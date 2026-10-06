/**
 * @file src/index.ts
 * @desc @haruhimemoe/mirror: downloads osu! beatmapsets from whichever public mirror has them,
 *       failing over down an ordered list with hinai last, straight from the mirror to the caller.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

export { HinaiError, OSZ_MIME } from "@haruhimemoe/hinai";
export * from "./client.js";
export * from "./errors.js";
export * from "./mirrors.js";
export type * from "./types.js";
