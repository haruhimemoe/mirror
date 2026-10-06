/**
 * @file scripts/smoke.mjs
 * @desc Imports the built package the way apps will (dist/, with @haruhimemoe/hinai) and runs a
 *       failover download and a miss against a stub fetch. Run by `bun run test:dist`.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import assert from "node:assert/strict";
import { createMirrorClient, DEFAULT_MIRRORS, MirrorError } from "../dist/index.js";

const zip = Uint8Array.from([0x50, 0x4b, 3, 4, 0, 0, 0, 0]);
const client = createMirrorClient({
  fetch: async (input) =>
    String(input).startsWith("https://mirror.hinamizawa.ai/")
      ? new Response(zip)
      : new Response("", { status: 404 }),
});
const result = await client.downloadSet(39804);
assert.equal(result.mirror, "hinai");
assert.equal(result.failed.length, DEFAULT_MIRRORS.length - 1);
assert.deepEqual(new Uint8Array(await result.blob.arrayBuffer()), zip);
await assert.rejects(
  createMirrorClient({ fetch: async () => new Response("", { status: 404 }) }).downloadSet(1),
  MirrorError,
);
console.log("smoke: ok");
