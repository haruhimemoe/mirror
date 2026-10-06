/**
 * @file src/types.ts
 * @desc The mirror client's option and result types.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import type { MirrorAttempt } from "./errors.js";
import type { Mirror, MirrorId } from "./mirrors.js";

/** Options for createMirrorClient. */
export type MirrorClientOptions = {
  /**
   * Mirrors to try, in order: built-in ids or your own Mirror objects. Default DEFAULT_MIRRORS
   * (osu.direct, Mino, Sayobot, then hinai).
   */
  mirrors?: readonly (MirrorId | Mirror)[] | undefined;
  /** The fetch to use. Default globalThis.fetch, looked up per request. */
  fetch?: ((input: string | URL, init?: RequestInit) => Promise<Response>) | undefined;
  /**
   * How long a download may wait for each mirror's headers, in ms (the body then streams for as
   * long as the caller's signal allows). Also the hinai metadata timeout. Default 10 000.
   */
  timeoutMs?: number | undefined;
  /**
   * User-Agent naming your tool, sent from servers only (browsers send their own; a custom header
   * there would force a CORS preflight). Mino refuses server requests without one.
   */
  userAgent?: string | undefined;
  /** Clock for cooldowns, in ms. Default Date.now. */
  now?: (() => number) | undefined;
};

/** Progress of the mirror currently downloading. Starts again at 0 when a mirror fails over. */
export type DownloadProgress = {
  /** The mirror sending the bytes. */
  mirror: string;
  /** Bytes read so far. */
  loaded: number;
  /** Bytes expected, when the mirror said (content-length). */
  total: number | null;
};

/** Options for downloadSet. */
export type DownloadOptions = {
  /** true for the archive with its video. Default false. */
  video?: boolean | undefined;
  /** Stops the download; it then rejects with the signal's reason. */
  signal?: AbortSignal | undefined;
  /** Called for each chunk read, after the zip check. */
  onProgress?: ((progress: DownloadProgress) => void) | undefined;
  /**
   * Ask hinai first whether osu! disabled the set's download, and fail fast with
   * `download_disabled` when it did. One extra request. Default false.
   */
  checkAvailability?: boolean | undefined;
};

/** A finished download. */
export type DownloadResult = {
  /** The .osz, typed OSZ_MIME, zip signature checked. */
  blob: Blob;
  /** The id of the mirror that sent it. */
  mirror: string;
  /** Mirrors that failed before it, in order. */
  failed: readonly MirrorAttempt[];
};

/** A mirror's URL for a set, for links and fallbacks. */
export type MirrorLink = { mirror: string; url: string };

/** One mirror's health as this client has seen it. */
export type MirrorHealth = {
  mirror: string;
  /** Failures in a row (404s don't count). */
  failures: number;
  /** When the mirror is worth asking again (ms timestamp), or null when it isn't cooling down. */
  coolingUntil: number | null;
};
