/**
 * @file tests/aborts.test.ts
 * @desc Timeouts and aborts: a mirror that sends no headers in time fails over as `timeout`, and
 *       the caller's signal stops everything with its own reason.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { describe, expect, it } from "vitest";
import { failure, hang, host, ok, stub } from "./helpers/stub-fetch.js";

describe("timeouts and aborts", () => {
  it("fails a silent mirror over as a timeout", async () => {
    const { client } = stub((url, init) => (host(url) === "osu.direct" ? hang(url, init) : ok()), {
      timeoutMs: 5,
    });
    const result = await client.downloadSet(1);
    expect(result.mirror).toBe("catboy");
    expect(result.failed[0]).toMatchObject({ mirror: "osudirect", code: "timeout" });
  });

  it("rejects with the signal's reason when aborted while waiting", async () => {
    const controller = new AbortController();
    const { client } = stub((url, init) => {
      queueMicrotask(() => controller.abort("stop"));
      return hang(url, init);
    });
    expect(await failure(client.downloadSet(1, { signal: controller.signal }))).toBe("stop");
  });

  it("rejects before any request when already aborted", async () => {
    const { client, calls } = stub(() => ok());
    const signal = AbortSignal.abort("early");
    expect(await failure(client.downloadSet(1, { signal }))).toBe("early");
    expect(calls).toHaveLength(0);
  });

  it("stops reading the body on abort", async () => {
    const controller = new AbortController();
    let cancelled = false;
    const { client } = stub(() => {
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(Uint8Array.from([0x50, 0x4b, 3, 4]));
        },
        cancel() {
          cancelled = true;
        },
      });
      return new Response(body);
    });
    const pending = failure(
      client.downloadSet(1, {
        signal: controller.signal,
        onProgress: () => controller.abort("mid"),
      }),
    );
    expect(await pending).toBe("mid");
    expect(cancelled).toBe(true);
  });
});
