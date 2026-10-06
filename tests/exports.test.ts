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
      "MAX_RETRY_DELAY_MS",
      "MIRRORS",
      "MIRROR_FAILURE_LIMIT",
      "MIRROR_TIMEOUT_MS",
      "MirrorError",
      "OSZ_MIME",
      "backoffDelayMs",
      "createMirrorClient",
      "parseRetryAfter",
    ]
  `);
});

it("defaults to hinai first", () => {
  expect(api.DEFAULT_MIRRORS).toEqual(["hinai", "osudirect", "catboy", "sayobot"]);
  expect(Object.keys(api.MIRRORS).sort()).toEqual([
    "catboy",
    "hinai",
    "nerinyan",
    "osudirect",
    "sayobot",
  ]);
  for (const [id, mirror] of Object.entries(api.MIRRORS)) expect(mirror.id).toBe(id);
});

it("shares one HinaiError and OSZ_MIME with the /hinai entry", async () => {
  const hinai = await import("../src/hinai/index.js");
  expect(api.HinaiError).toBe(hinai.HinaiError);
  expect(api.OSZ_MIME).toBe(hinai.OSZ_MIME);
  expect(api.parseRetryAfter).toBe(hinai.parseRetryAfter);
});
