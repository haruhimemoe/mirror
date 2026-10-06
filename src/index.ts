/**
 * @file src/index.ts
 * @desc @haruhimemoe/mirror: downloads osu! beatmapsets from whichever public mirror has them,
 *       hinai first, failing over down an ordered list straight from the mirror to the caller.
 *       hinai's own client lives at @haruhimemoe/mirror/hinai; the pieces both share are
 *       re-exported here so there is one HinaiError class.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

export * from "./client.js";
export * from "./errors.js";
export { OSZ_MIME } from "./hinai/archive.js";
export { HinaiError, type HinaiErrorCode } from "./hinai/errors.js";
export { backoffDelayMs, MAX_RETRY_DELAY_MS, parseRetryAfter } from "./hinai/retry.js";
export * from "./mirrors.js";
export type * from "./types.js";
