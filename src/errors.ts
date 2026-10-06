/**
 * @file src/errors.ts
 * @desc MirrorError: how a download fails once every mirror has had its turn, with a code to
 *       branch on, whether trying again can help, how long to wait, and each mirror's attempt.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

/**
 * What went wrong. On an attempt: one mirror's answer. On a MirrorError: the outcome over every
 * mirror (`not_found` only when every mirror that answered said 404).
 */
export type MirrorErrorCode =
  | "not_found"
  | "download_disabled"
  | "unavailable"
  | "network"
  | "timeout"
  | "bad_response"
  | "http_error";

/** One mirror's failed try at a download. */
export type MirrorAttempt = {
  /** The mirror's id. */
  mirror: string;
  /** The URL that was fetched. */
  url: string;
  /** What went wrong with this mirror. */
  code: MirrorErrorCode;
  /** The HTTP status, or null when no response arrived. */
  status: number | null;
  /** How long the mirror asked us to wait (Retry-After), when it said. */
  retryAfterMs: number | null;
};

/**
 * How a download fails, except aborts (which reject with the signal's reason), bad arguments (a
 * RangeError) and errors thrown by the caller's onProgress. Branch on `code`; retry only when
 * `retryable`, after `retryAfterMs` when set.
 */
export class MirrorError extends Error {
  /** The outcome over every mirror. */
  readonly code: MirrorErrorCode;
  /** Whether trying again later can help. */
  readonly retryable: boolean;
  /** The shortest wait before a mirror is worth asking again, when one is cooling down. */
  readonly retryAfterMs: number | null;
  /** Every mirror's failed try, in order. Empty when no mirror was asked. */
  readonly attempts: readonly MirrorAttempt[];

  constructor(
    code: MirrorErrorCode,
    message: string,
    options: {
      retryable?: boolean | undefined;
      retryAfterMs?: number | null | undefined;
      attempts?: readonly MirrorAttempt[] | undefined;
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "MirrorError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs ?? null;
    this.attempts = options.attempts ?? [];
  }
}
