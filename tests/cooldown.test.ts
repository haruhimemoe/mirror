/**
 * @file tests/cooldown.test.ts
 * @desc Mirror health: network errors, timeouts and 429s cool a mirror down at once, other
 *       failures only after MIRROR_FAILURE_LIMIT in a row, 404s never; a success resets it, and
 *       cooling mirrors are skipped and listed last.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { describe, expect, it } from "vitest";
import { MIRROR_FAILURE_LIMIT } from "../src/index.js";
import { failure, host, ok, stub } from "./helpers/stub-fetch.js";

const FIRST = "osu.direct";

describe("cooldowns", () => {
  it("skips a mirror after a network error, until its backoff passes", async () => {
    let time = 1_000;
    let up = false;
    const { client, calls } = stub(
      (url) => {
        if (host(url) === FIRST && !up) throw new TypeError("fetch failed");
        return ok();
      },
      { now: () => time },
    );
    expect((await client.downloadSet(1)).mirror).toBe("catboy");
    expect(client.health()[0]).toEqual({ mirror: "osudirect", failures: 1, coolingUntil: 2_000 });
    calls.length = 0;
    expect((await client.downloadSet(2)).mirror).toBe("catboy");
    expect(calls.map((c) => host(c.url))).toEqual(["catboy.best"]);
    expect(client.downloadLinks(2).map((l) => l.mirror)).toEqual([
      "catboy",
      "sayobot",
      "hinai",
      "osudirect",
    ]);
    time = 2_000;
    up = true;
    expect((await client.downloadSet(3)).mirror).toBe("osudirect");
    expect(client.health()[0]).toEqual({ mirror: "osudirect", failures: 0, coolingUntil: null });
  });

  it("honors a 429's Retry-After", async () => {
    const { client } = stub(
      (url) =>
        host(url) === FIRST
          ? new Response("", { status: 429, headers: { "retry-after": "30" } })
          : ok(),
      { now: () => 0 },
    );
    await client.downloadSet(1);
    expect(client.health()[0]?.coolingUntil).toBe(30_000);
  });

  it("cools down on other failures only after several in a row", async () => {
    const { client } = stub(
      (url) =>
        host(url) === FIRST
          ? new Response("", { status: 503, headers: { "retry-after": "30" } })
          : ok(),
      { now: () => 0 },
    );
    for (let i = 1; i < MIRROR_FAILURE_LIMIT; i += 1) {
      await client.downloadSet(i);
      expect(client.health()[0]).toEqual({ mirror: "osudirect", failures: i, coolingUntil: null });
    }
    await client.downloadSet(9);
    expect(client.health()[0]?.coolingUntil).toBe(30_000);
  });

  it("backs off longer the more failures in a row", async () => {
    let time = 0;
    const { client } = stub(
      (url) => (host(url) === FIRST ? new Response("", { status: 500 }) : ok()),
      { now: () => time },
    );
    for (let i = 0; i < MIRROR_FAILURE_LIMIT; i += 1) await client.downloadSet(1);
    expect(client.health()[0]?.coolingUntil).toBe(4_000);
    time = 4_000;
    await client.downloadSet(1);
    expect(client.health()[0]?.coolingUntil).toBe(12_000);
  });

  it("doesn't count a 404, or a mirror's own missing status", async () => {
    const { client } = stub((url) => {
      if (host(url) === FIRST) return new Response("", { status: 404 });
      if (host(url) === "catboy.best") return new Response("", { status: 410 });
      if (host(url) === "dl.sayobot.cn") return new Response("", { status: 403 });
      return ok();
    });
    const result = await client.downloadSet(1);
    expect(result.failed.map((a) => a.code)).toEqual(["not_found", "not_found", "not_found"]);
    expect(client.health().every((h) => h.failures === 0)).toBe(true);
  });

  it("rejects unavailable with the shortest wait when every mirror is cooling", async () => {
    const { client, calls } = stub(
      (url) =>
        new Response("", {
          status: 429,
          headers: { "retry-after": host(url) === "dl.sayobot.cn" ? "2" : "9" },
        }),
      { now: () => 0 },
    );
    await failure(client.downloadSet(1));
    calls.length = 0;
    const error = await failure(client.downloadSet(1));
    expect(calls).toHaveLength(0);
    expect(error).toMatchObject({ code: "unavailable", retryable: true, retryAfterMs: 2_000 });
  });

  it("passes on a set-specific Retry-After without cooling the mirror", async () => {
    const { client } = stub(
      (url) =>
        host(url) === "mirror.hinamizawa.ai"
          ? new Response("", { status: 503, headers: { "retry-after": "30" } })
          : new Response("", { status: 404 }),
      { now: () => 0 },
    );
    expect(await failure(client.downloadSet(1))).toMatchObject({
      code: "unavailable",
      retryAfterMs: 30_000,
    });
    expect(client.health().every((h) => h.coolingUntil === null)).toBe(true);
  });

  it("doesn't call it not_found when some mirrors were skipped", async () => {
    let time = 0;
    let down = true;
    const { client } = stub(
      (url) => {
        if (host(url) === FIRST && down) throw new TypeError("fetch failed");
        return new Response("", { status: 404 });
      },
      { now: () => time },
    );
    await failure(client.downloadSet(1));
    down = false;
    time = 500;
    expect(await failure(client.downloadSet(1))).toMatchObject({
      code: "unavailable",
      retryAfterMs: 500,
    });
  });

  it("gives no retryAfterMs when every wait has already passed", async () => {
    let time = 0;
    const { client } = stub(() => new Response("", { status: 500 }), {
      now: () => {
        time += 60_000;
        return time;
      },
    });
    expect(await failure(client.downloadSet(1))).toMatchObject({
      code: "unavailable",
      retryAfterMs: null,
    });
  });
});
