/**
 * @file src/mirrors.ts
 * @desc The public osu! beatmap mirrors the client knows, how each one spells a set's .osz URL,
 *       and the default order: hinai first, then osu.direct, Mino and Sayobot. Every mirror here
 *       answers browsers directly (CORS open); none of them is ours.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { HINAI_BASE_URL, setDownloadUrl } from "./hinai/client.js";

/** A beatmap mirror: where to send a browser or server for a set's .osz. */
export type Mirror = {
  /** Short id, unique within a client (shows up in results, errors and health). */
  id: string;
  /** Display name. */
  name: string;
  /** The mirror's site. */
  homepage: string;
  /**
   * @param setId {number} beatmapset id (already checked: a positive integer)
   * @param video {boolean} true for the archive with its video
   * @returns {string} the .osz URL
   */
  downloadUrl: (setId: number, video: boolean) => string;
  /** Statuses besides 404 and 410 that this mirror sends for a set it doesn't have. */
  missingStatuses?: readonly number[] | undefined;
};

/** The ids of the built-in mirrors. */
export type MirrorId = "catboy" | "osudirect" | "sayobot" | "nerinyan" | "hinai";

/** The built-in mirrors, by id. */
export const MIRRORS: Readonly<Record<MirrorId, Mirror>> = Object.freeze({
  catboy: {
    id: "catboy",
    name: "Mino (catboy.best)",
    homepage: "https://catboy.best",
    // Mino refuses requests without an identifying User-Agent: browsers send theirs, servers pass
    // userAgent.
    downloadUrl: (setId, video) => `https://catboy.best/d/${setId}${video ? "" : "n"}`,
  },
  osudirect: {
    id: "osudirect",
    name: "osu.direct",
    homepage: "https://osu.direct",
    downloadUrl: (setId, video) => `https://osu.direct/api/d/${setId}${video ? "" : "?noVideo=1"}`,
  },
  sayobot: {
    id: "sayobot",
    name: "Sayobot",
    homepage: "https://osu.sayobot.cn",
    downloadUrl: (setId, video) =>
      `https://dl.sayobot.cn/beatmaps/download/${video ? "full" : "novideo"}/${setId}`,
    // Sayobot's file server answers 403 for sets it doesn't have.
    missingStatuses: [403],
  },
  nerinyan: {
    id: "nerinyan",
    name: "NeriNyan",
    homepage: "https://nerinyan.moe",
    downloadUrl: (setId, video) =>
      `https://api.nerinyan.moe/d/${setId}${video ? "" : "?noVideo=true"}`,
  },
  hinai: {
    id: "hinai",
    name: "hinai (mirror.hinamizawa.ai)",
    homepage: HINAI_BASE_URL,
    downloadUrl: (setId, video) => setDownloadUrl(setId, HINAI_BASE_URL, video),
  },
});

/**
 * The order a client tries mirrors in when none is given: hinai, then osu.direct, Mino and Sayobot
 * (fastest first when checked, Oct 2026). NeriNyan is left out: it answered 404 for every set when checked
 * (Oct 2026). Pass `mirrors` to change the order or add it back.
 */
export const DEFAULT_MIRRORS: readonly MirrorId[] = Object.freeze([
  "hinai",
  "osudirect",
  "catboy",
  "sayobot",
]);
