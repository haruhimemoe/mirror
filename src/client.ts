/**
 * @file src/client.ts
 * @desc createMirrorClient: downloads a set's .osz from the first mirror that has it, failing
 *       over down an ordered list (hinai last by default) and cooling a mirror down when it
 *       looks down (network errors, timeouts, 429s, or MIRROR_FAILURE_LIMIT failures in a row),
 *       so later downloads skip it until its Retry-After or backoff has passed. Bytes
 *       go from the mirror straight to the caller: nothing is hosted or proxied. Metadata and
 *       availability come from hinai through @haruhimemoe/hinai.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { backoffDelayMs, createHinaiClient, parseRetryAfter } from "@haruhimemoe/hinai";
import { ArchiveReadError, readArchive } from "./archive.js";
import { type MirrorAttempt, MirrorError } from "./errors.js";
import { DEFAULT_MIRRORS, MIRRORS, type Mirror, type MirrorId } from "./mirrors.js";
import type {
  DownloadOptions,
  DownloadResult,
  MirrorClientOptions,
  MirrorHealth,
  MirrorLink,
} from "./types.js";

/** Default time each mirror gets to send a download's headers. */
export const MIRROR_TIMEOUT_MS = 10_000;

/**
 * Failures in a row after which any failure cools a mirror down. Before that only a network
 * error, a timeout or a 429 does: a 403 or 5xx is often about one set (hinai sends 503 with
 * Retry-After for a set its upstreams lack), not the whole mirror.
 */
export const MIRROR_FAILURE_LIMIT = 3;

/** setTimeout's ms limit (2^31 - 1); beyond this Node and browsers clamp to ~1 ms. */
const MAX_TIMEOUT_MS = 2_147_483_647;
const TIMED_OUT = Symbol("timed out");

const checkSetId = (setId: number): void => {
  if (!Number.isSafeInteger(setId) || setId <= 0) {
    throw new RangeError("setId must be a positive integer.");
  }
};

/** The mirror list, built-in ids resolved, checked for unknown and repeated ids. */
const resolveMirrors = (list: readonly (MirrorId | Mirror)[]): Mirror[] => {
  if (list.length === 0) throw new RangeError("mirrors must name at least one mirror.");
  const mirrors = list.map((entry) => {
    if (typeof entry !== "string") return entry;
    const mirror = Object.hasOwn(MIRRORS, entry) ? MIRRORS[entry] : undefined;
    if (!mirror) throw new RangeError(`Unknown mirror "${entry}".`);
    return mirror;
  });
  const ids = new Set(mirrors.map((mirror) => mirror.id));
  if (ids.size !== mirrors.length) throw new RangeError("mirrors must not repeat an id.");
  return mirrors;
};

/** The User-Agent header to send: servers only, and only a value fetch will take. */
const userAgentHeaders = (userAgent: string | undefined): Record<string, string> | undefined => {
  const inBrowser =
    typeof document !== "undefined" ||
    (typeof self !== "undefined" && typeof window === "undefined" && "importScripts" in self);
  if (!userAgent || inBrowser) return undefined;
  try {
    new Headers({ "User-Agent": userAgent });
  } catch (cause) {
    throw new RangeError("userAgent must be a valid header value.", { cause });
  }
  return { "User-Agent": userAgent };
};

/**
 * @function createMirrorClient
 * @param options {MirrorClientOptions} mirror order, fetch, timeout, (on servers) a User-Agent
 * @returns {MirrorClient} downloadSet, downloadLinks, health, getBeatmaps, getAvailability
 * @throws {RangeError} when mirrors is empty, names an unknown id or repeats one, timeoutMs isn't
 *         an integer from 1 to 2147483647, or userAgent (on a server) isn't a valid header value
 */
export const createMirrorClient = (options: MirrorClientOptions = {}) => {
  const mirrors = resolveMirrors(options.mirrors ?? DEFAULT_MIRRORS);
  const timeoutMs = options.timeoutMs ?? MIRROR_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new RangeError(`timeoutMs must be an integer from 1 to ${MAX_TIMEOUT_MS}.`);
  }
  const doFetch =
    options.fetch ?? ((input: string | URL, init?: RequestInit) => globalThis.fetch(input, init));
  const headers = userAgentHeaders(options.userAgent);
  const now = options.now ?? Date.now;
  const hinai = createHinaiClient({
    fetch: doFetch,
    timeoutMs,
    userAgent: options.userAgent,
  });
  /** Each mirror with its failures in a row and when it's worth asking again (0: now). */
  const states = mirrors.map((mirror) => ({ mirror, failures: 0, coolingUntil: 0 }));
  type State = (typeof states)[number];

  const isCooling = (state: State): boolean => state.coolingUntil > now();
  const recordFailure = (state: State, attempt: MirrorAttempt): void => {
    if (attempt.code === "not_found") return;
    state.failures += 1;
    const mirrorWide =
      attempt.code === "network" || attempt.code === "timeout" || attempt.status === 429;
    if (mirrorWide || state.failures >= MIRROR_FAILURE_LIMIT)
      state.coolingUntil = now() + backoffDelayMs(state.failures, attempt.retryAfterMs);
  };

  /** One mirror's try: the archive, or what went wrong. Aborts reject with the signal's reason. */
  const tryMirror = async (
    mirror: Mirror,
    url: string,
    options: DownloadOptions,
  ): Promise<Blob | MirrorAttempt> => {
    const { signal } = options;
    const failed = (
      code: MirrorAttempt["code"],
      status: number | null = null,
      retryAfterMs: number | null = null,
    ): MirrorAttempt => ({ mirror: mirror.id, url, code, status, retryAfterMs });
    const controller = new AbortController();
    const forward = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", forward, { once: true });
    const timer = setTimeout(() => controller.abort(TIMED_OUT), timeoutMs);
    try {
      let response: Response;
      try {
        response = await doFetch(url, {
          signal: controller.signal,
          ...(headers ? { headers } : {}),
        });
      } catch {
        signal?.throwIfAborted();
        return failed(controller.signal.reason === TIMED_OUT ? "timeout" : "network");
      } finally {
        clearTimeout(timer);
      }
      if (!response.ok) {
        response.body?.cancel().catch(() => undefined);
        const missing = [404, 410, ...(mirror.missingStatuses ?? [])];
        if (missing.includes(response.status)) {
          return failed("not_found", response.status);
        }
        const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"), now());
        return failed("http_error", response.status, retryAfterMs);
      }
      try {
        return await readArchive(response, mirror.id, signal, options.onProgress);
      } catch (error) {
        if (error instanceof ArchiveReadError) return failed(error.code, response.status);
        throw error;
      }
    } finally {
      signal?.removeEventListener("abort", forward);
    }
  };

  /** Fails fast when hinai says osu! disabled the set's download; any other answer goes on. */
  const checkDisabled = async (setId: number, signal: AbortSignal | undefined) => {
    const availability = await hinai.getAvailability(setId, { signal }).catch(() => {
      signal?.throwIfAborted();
      return null;
    });
    if (availability && !availability.downloadable) {
      throw new MirrorError(
        "download_disabled",
        availability.reason ?? "osu! has disabled downloads of this beatmapset.",
      );
    }
  };

  return {
    /**
     * @function downloadSet
     * @param setId {number} beatmapset id (not a difficulty id)
     * @param options {DownloadOptions} video, signal, onProgress, checkAvailability
     * @returns {Promise<DownloadResult>} the .osz, the mirror that sent it, and the ones that failed
     * @throws {MirrorError} not_found when every mirror that answered said 404; unavailable
     *         (retryable) when the rest failed or were cooling down; download_disabled from the
     *         availability check. An abort rejects with the signal's reason.
     * @throws {RangeError} when setId isn't a positive integer
     */
    async downloadSet(setId: number, options: DownloadOptions = {}): Promise<DownloadResult> {
      checkSetId(setId);
      options.signal?.throwIfAborted();
      if (options.checkAvailability) await checkDisabled(setId, options.signal);
      const failed: MirrorAttempt[] = [];
      let skipped = false;
      for (const state of states) {
        if (isCooling(state)) {
          skipped = true;
          continue;
        }
        const { mirror } = state;
        const url = mirror.downloadUrl(setId, options.video ?? false);
        const result = await tryMirror(mirror, url, options);
        if (result instanceof Blob) {
          Object.assign(state, { failures: 0, coolingUntil: 0 });
          return { blob: result, mirror: mirror.id, failed };
        }
        recordFailure(state, result);
        failed.push(result);
      }
      if (!skipped && failed.length > 0 && failed.every((a) => a.code === "not_found")) {
        throw new MirrorError("not_found", "No mirror has this beatmapset.", { attempts: failed });
      }
      const waits = [
        ...states.map((state) => state.coolingUntil - now()),
        ...failed.map((attempt) => attempt.retryAfterMs ?? 0),
      ].filter((wait) => wait > 0);
      throw new MirrorError("unavailable", "No mirror could send this beatmapset right now.", {
        retryable: true,
        retryAfterMs: waits.length > 0 ? Math.min(...waits) : null,
        attempts: failed,
      });
    },

    /**
     * @function downloadLinks
     * @param setId {number} beatmapset id
     * @param video {boolean} true for archives with video
     * @returns {MirrorLink[]} each mirror's URL for the set, in order, mirrors cooling down last;
     *          for plain links and fallbacks when the browser should download it itself
     * @throws {RangeError} when setId isn't a positive integer
     */
    downloadLinks(setId: number, video = false): MirrorLink[] {
      checkSetId(setId);
      const ready = states.filter((state) => !isCooling(state));
      const cooling = states.filter(isCooling);
      return [...ready, ...cooling].map(({ mirror }) => ({
        mirror: mirror.id,
        url: mirror.downloadUrl(setId, video),
      }));
    },

    /**
     * @function health
     * @returns {MirrorHealth[]} each mirror's failures in a row and cooldown, in order
     */
    health(): MirrorHealth[] {
      return states.map((state) => ({
        mirror: state.mirror.id,
        failures: state.failures,
        coolingUntil: isCooling(state) ? state.coolingUntil : null,
      }));
    },

    /** Difficulty metadata from hinai: see @haruhimemoe/hinai's getBeatmaps. */
    getBeatmaps: hinai.getBeatmaps,
    /** A set's availability from hinai: see @haruhimemoe/hinai's getAvailability. */
    getAvailability: hinai.getAvailability,
  };
};

/** The client createMirrorClient returns. */
export type MirrorClient = ReturnType<typeof createMirrorClient>;
