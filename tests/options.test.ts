/**
 * @file tests/options.test.ts
 * @desc createMirrorClient's options: mirror lists, timeoutMs, userAgent, the default fetch.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { createMirrorClient, type MirrorId } from "../src/index.js";
import { ok, stub } from "./helpers/stub-fetch.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("options", () => {
  it("refuses an empty, unknown or repeated mirror list", () => {
    expect(() => createMirrorClient({ mirrors: [] })).toThrow(RangeError);
    expect(() => createMirrorClient({ mirrors: ["nope" as MirrorId] })).toThrow(/Unknown mirror/);
    expect(() => createMirrorClient({ mirrors: ["toString" as MirrorId] })).toThrow(RangeError);
    expect(() => createMirrorClient({ mirrors: ["hinai", "hinai"] })).toThrow(/repeat/);
  });

  it("refuses a bad timeoutMs", () => {
    for (const timeoutMs of [0, 1.5, 2 ** 31]) {
      expect(() => createMirrorClient({ timeoutMs })).toThrow(RangeError);
    }
  });

  it("sends userAgent from servers", async () => {
    const { client, calls } = stub(() => ok(), { userAgent: "test/1.0" });
    await client.downloadSet(1);
    expect(calls[0]?.headers.get("user-agent")).toBe("test/1.0");
  });

  it("sends no headers without a userAgent", async () => {
    const { client, calls } = stub(() => ok());
    await client.downloadSet(1);
    expect([...(calls[0]?.headers.keys() ?? [])]).toEqual([]);
  });

  it("refuses a userAgent fetch wouldn't take", () => {
    expect(() => createMirrorClient({ userAgent: "bad\nvalue" })).toThrow(RangeError);
  });

  it("ignores userAgent in a browser", async () => {
    vi.stubGlobal("document", {});
    const { client, calls } = stub(() => ok(), { userAgent: "test/1.0" });
    await client.downloadSet(1);
    expect(calls[0]?.headers.has("user-agent")).toBe(false);
  });

  it("uses globalThis.fetch by default, looked up per request", async () => {
    const fetch = vi.fn(async () => ok());
    const client = createMirrorClient();
    vi.stubGlobal("fetch", fetch);
    expect((await client.downloadSet(1)).mirror).toBe("hinai");
    expect(fetch).toHaveBeenCalledOnce();
  });
});
