/**
 * @file tests/exports.test.ts
 * @desc Pins the package's runtime exports and the built-in mirror table.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { expect, it } from "vitest";
import * as api from "../src/index.js";

it("exports", () => {
  expect(Object.keys(api).sort()).toMatchInlineSnapshot(`
    [
      "DEFAULT_MIRRORS",
      "HinaiError",
      "MIRRORS",
      "MIRROR_FAILURE_LIMIT",
      "MIRROR_TIMEOUT_MS",
      "MirrorError",
      "OSZ_MIME",
      "createMirrorClient",
    ]
  `);
});

it("defaults to our mirrors first, hinai last", () => {
  expect(api.DEFAULT_MIRRORS).toEqual(["osudirect", "catboy", "sayobot", "hinai"]);
  expect(Object.keys(api.MIRRORS).sort()).toEqual([
    "catboy",
    "hinai",
    "nerinyan",
    "osudirect",
    "sayobot",
  ]);
  for (const [id, mirror] of Object.entries(api.MIRRORS)) expect(mirror.id).toBe(id);
});
