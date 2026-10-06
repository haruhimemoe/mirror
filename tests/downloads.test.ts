/**
 * @file tests/downloads.test.ts
 * @desc downloadSet: order, failover on 404 and errors, zip checks, progress, the final error.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { describe, expect, it } from "vitest";
import { MirrorError, OSZ_MIME } from "../src/index.js";
import { failure, host, ok, stub } from "./helpers/stub-fetch.js";

describe("downloadSet", () => {
  it("takes the first mirror in the default order", async () => {
    const { client, calls } = stub(() => ok());
    const result = await client.downloadSet(1);
    expect(result.mirror).toBe("osudirect");
    expect(result.failed).toEqual([]);
    expect(result.blob.type).toBe(OSZ_MIME);
    expect(result.blob.size).toBe(8);
    expect(calls.map((c) => c.url)).toEqual(["https://osu.direct/api/d/1?noVideo=1"]);
  });

  it("builds each mirror's no-video and video URLs", () => {
    const { client } = stub(() => ok(), {
      mirrors: ["osudirect", "catboy", "sayobot", "nerinyan", "hinai"],
    });
    expect(client.downloadLinks(7).map((l) => l.url)).toEqual([
      "https://osu.direct/api/d/7?noVideo=1",
      "https://catboy.best/d/7n",
      "https://dl.sayobot.cn/beatmaps/download/novideo/7",
      "https://api.nerinyan.moe/d/7?noVideo=true",
      "https://mirror.hinamizawa.ai/api/v1/hinai/d/7?noVideo=true",
    ]);
    expect(client.downloadLinks(7, true).map((l) => l.url)).toEqual([
      "https://osu.direct/api/d/7",
      "https://catboy.best/d/7",
      "https://dl.sayobot.cn/beatmaps/download/full/7",
      "https://api.nerinyan.moe/d/7",
      "https://mirror.hinamizawa.ai/api/v1/hinai/d/7",
    ]);
  });

  it("asks for video when told to", async () => {
    const { client, calls } = stub(() => ok());
    await client.downloadSet(3, { video: true });
    expect(calls[0]?.url).toBe("https://osu.direct/api/d/3");
  });

  it("falls back to hinai when the others miss or fail", async () => {
    const { client } = stub((url) => {
      if (host(url) === "osu.direct") return new Response("{}", { status: 404 });
      if (host(url) === "catboy.best") return new Response("bad gateway", { status: 502 });
      if (host(url) === "dl.sayobot.cn") throw new TypeError("fetch failed");
      return ok();
    });
    const result = await client.downloadSet(5);
    expect(result.mirror).toBe("hinai");
    expect(result.failed.map((a) => [a.mirror, a.code, a.status])).toEqual([
      ["osudirect", "not_found", 404],
      ["catboy", "http_error", 502],
      ["sayobot", "network", null],
    ]);
  });

  it("treats a 200 that isn't a zip as a failure and moves on", async () => {
    const { client } = stub((url) =>
      host(url) === "osu.direct" ? Response.json({ error: "nope" }) : ok(),
    );
    const result = await client.downloadSet(5);
    expect(result.mirror).toBe("catboy");
    expect(result.failed[0]).toMatchObject({ code: "bad_response", status: 200 });
  });

  it("treats an empty or bodiless 200 as a failure", async () => {
    let n = 0;
    const { client } = stub(() => {
      n += 1;
      if (n === 1) return new Response(null);
      if (n === 2) return new Response(new Uint8Array([0x50, 0x4b]));
      return ok();
    });
    const result = await client.downloadSet(5);
    expect(result.failed.map((a) => a.code)).toEqual(["bad_response", "bad_response"]);
  });

  it("treats a body that breaks off as a network failure", async () => {
    let n = 0;
    const { client } = stub(() => {
      n += 1;
      if (n > 1) return ok();
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.error(new TypeError("reset"));
        },
      });
      return new Response(body);
    });
    const result = await client.downloadSet(5);
    expect(result.failed[0]?.code).toBe("network");
  });

  it("rejects not_found when every mirror says 404", async () => {
    const { client } = stub(() => new Response("", { status: 404 }));
    const error = await failure(client.downloadSet(9));
    expect(error).toBeInstanceOf(MirrorError);
    expect(error).toMatchObject({ code: "not_found", retryable: false });
    expect((error as MirrorError).attempts).toHaveLength(4);
  });

  it("counts 410 as not found", async () => {
    const { client } = stub(() => new Response("", { status: 410 }));
    expect(await failure(client.downloadSet(9))).toMatchObject({ code: "not_found" });
  });

  it("rejects unavailable, retryable, when any mirror failed for another reason", async () => {
    const { client } = stub((url) =>
      host(url) === "mirror.hinamizawa.ai"
        ? new Response("", { status: 503, headers: { "retry-after": "7" } })
        : new Response("", { status: 404 }),
    );
    const error = await failure(client.downloadSet(9));
    expect(error).toMatchObject({ code: "unavailable", retryable: true, retryAfterMs: 7000 });
  });

  it("reports progress per mirror after the zip check", async () => {
    const seen: unknown[] = [];
    const { client } = stub(() => ok());
    await client.downloadSet(1, { onProgress: (p) => seen.push(p) });
    expect(seen).toEqual([{ mirror: "osudirect", loaded: 8, total: 8 }]);
  });

  it("drops a content-length the body outgrows", async () => {
    const seen: unknown[] = [];
    const { client } = stub(
      () =>
        new Response(new Uint8Array([0x50, 0x4b, 3, 4, 1, 2]), {
          headers: { "content-length": "4" },
        }),
    );
    await client.downloadSet(1, { onProgress: (p) => seen.push(p) });
    expect(seen).toEqual([{ mirror: "osudirect", loaded: 6, total: null }]);
  });

  it("passes through what onProgress throws", async () => {
    const boom = new Error("boom");
    const { client } = stub(() => ok());
    const error = await failure(
      client.downloadSet(1, {
        onProgress: () => {
          throw boom;
        },
      }),
    );
    expect(error).toBe(boom);
  });

  it("refuses bad set ids before any request", async () => {
    const { client, calls } = stub(() => ok());
    for (const id of [0, -1, 1.5, Number.NaN]) {
      await expect(client.downloadSet(id)).rejects.toBeInstanceOf(RangeError);
      expect(() => client.downloadLinks(id)).toThrow(RangeError);
    }
    expect(calls).toHaveLength(0);
  });

  it("uses custom mirrors", async () => {
    const mine = {
      id: "mine",
      name: "Mine",
      homepage: "https://example.com",
      downloadUrl: (setId: number) => `https://example.com/d/${setId}`,
    };
    const { client, calls } = stub(() => ok(), { mirrors: [mine, "hinai"] });
    expect((await client.downloadSet(2)).mirror).toBe("mine");
    expect(calls[0]?.url).toBe("https://example.com/d/2");
  });
});

it("checks the zip signature across small chunks", async () => {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(Uint8Array.from([0x50, 0x4b]));
      c.enqueue(Uint8Array.from([3, 4, 9]));
      c.close();
    },
  });
  const { client } = stub(() => new Response(body));
  expect((await client.downloadSet(1)).blob.size).toBe(5);
});
