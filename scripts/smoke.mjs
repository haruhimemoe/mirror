/**
 * @file scripts/smoke.mjs
 * @desc Imports the built package the way apps will (dist/, all three entries, /testing with msw)
 *       and runs a failover download, a miss, and the hinai client against stub fetches fed by
 *       the testing fixtures. Run by `bun run test:dist`.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import assert from "node:assert/strict";
import { createHinaiClient, HinaiError } from "../dist/hinai/index.js";
import {
  createMirrorClient,
  DEFAULT_MIRRORS,
  MirrorError,
  HinaiError as RootHinaiError,
} from "../dist/index.js";
import { fakeOsz, hinaiHandlers, recordedBeatmaps } from "../dist/testing/index.js";

const zip = fakeOsz(39804);
assert.equal(DEFAULT_MIRRORS[0], "hinai");
assert.equal(RootHinaiError, HinaiError);

const failover = createMirrorClient({
  fetch: async (input) =>
    String(input).startsWith("https://dl.sayobot.cn/")
      ? new Response(zip)
      : new Response("", { status: 404 }),
});
const result = await failover.downloadSet(39804);
assert.equal(result.mirror, "sayobot");
assert.equal(result.failed.length, DEFAULT_MIRRORS.length - 1);
assert.deepEqual(new Uint8Array(await result.blob.arrayBuffer()), zip);
await assert.rejects(
  createMirrorClient({ fetch: async () => new Response("", { status: 404 }) }).downloadSet(1),
  MirrorError,
);

const [first] = recordedBeatmaps;
const hinai = createHinaiClient({
  fetch: async (input) =>
    String(input).includes("/api/v1/hinai/d/")
      ? new Response(zip, { headers: { "content-length": String(zip.length) } })
      : Response.json(recordedBeatmaps),
});
const { found, missing } = await hinai.getBeatmaps([first.id, 1]);
assert.equal(found.get(first.id)?.beatmapId, first.id);
assert.deepEqual(missing, [1]);
assert.deepEqual(new Uint8Array(await (await hinai.downloadSet(39804)).arrayBuffer()), zip);
await assert.rejects(
  createHinaiClient({ fetch: async () => new Response("nope") }).downloadSet(1),
  HinaiError,
);
assert.equal(hinaiHandlers.length, 3);
console.log("smoke: ok");
