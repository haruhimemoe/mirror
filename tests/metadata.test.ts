/**
 * @file tests/metadata.test.ts
 * @desc hinai behind the mirror client: metadata, availability, and checkAvailability's fast
 *       fail on a set osu! disabled.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { describe, expect, it } from "vitest";
import { MirrorError } from "../src/index.js";
import { recordedBeatmaps } from "../src/testing/index.js";
import { failure, ok, stub } from "./helpers/stub-fetch.js";

const availability = (disabled: boolean | null, info: string | null = null) =>
  Response.json({
    id: 1,
    availability: { download_disabled: disabled, more_information: info },
    video: false,
    cached: true,
  });

describe("hinai metadata", () => {
  it("looks up difficulties through hinai", async () => {
    const [first] = recordedBeatmaps;
    const { client, calls } = stub(() => Response.json(recordedBeatmaps));
    const { found } = await client.getBeatmaps([first?.id ?? 0]);
    expect(found.size).toBe(1);
    expect(calls[0]?.url).toContain("https://mirror.hinamizawa.ai/api/v2/beatmaps");
  });

  it("fails fast on a set whose download osu! disabled", async () => {
    const { client, calls } = stub(() => availability(true, "DMCA"));
    const error = await failure(client.downloadSet(1, { checkAvailability: true }));
    expect(error).toBeInstanceOf(MirrorError);
    expect(error).toMatchObject({ code: "download_disabled", message: "DMCA", retryable: false });
    expect(calls).toHaveLength(1);
  });

  it("has a default message for a disabled set", async () => {
    const { client } = stub(() => availability(true));
    expect(await failure(client.downloadSet(1, { checkAvailability: true }))).toMatchObject({
      message: "osu! has disabled downloads of this beatmapset.",
    });
  });

  it("downloads when the set is available or unknown", async () => {
    for (const disabled of [false, null]) {
      const { client } = stub((url) =>
        url.includes("/availability") ? availability(disabled) : ok(),
      );
      expect((await client.downloadSet(1, { checkAvailability: true })).mirror).toBe("osudirect");
    }
  });

  it("downloads anyway when the availability check fails", async () => {
    const { client } = stub((url) =>
      url.includes("/availability") ? new Response("", { status: 500 }) : ok(),
    );
    expect((await client.downloadSet(1, { checkAvailability: true })).mirror).toBe("osudirect");
  });

  it("rejects with the signal's reason when aborted during the check", async () => {
    const controller = new AbortController();
    const { client } = stub(() => {
      controller.abort("stop");
      throw controller.signal.reason;
    });
    expect(
      await failure(client.downloadSet(1, { checkAvailability: true, signal: controller.signal })),
    ).toBe("stop");
  });
});
