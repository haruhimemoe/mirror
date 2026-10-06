/**
 * @file tests/helpers/stub-fetch.ts
 * @desc Stub-fetch building blocks: a client whose fetch answers per mirror host and records
 *       every call, a tiny zip, a fetch that never answers, and `failure` to read a rejection.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { createMirrorClient, type MirrorClientOptions } from "../../src/index.js";

export type Route = (url: string, init?: RequestInit) => Response | Promise<Response>;

/**
 * @function zip
 * @returns {Uint8Array<ArrayBuffer>} the zip signature plus four bytes
 */
export const zip = (): Uint8Array<ArrayBuffer> => Uint8Array.from([0x50, 0x4b, 3, 4, 0, 0, 0, 0]);

/** An OK response holding a zip. */
export const ok = (): Response => new Response(zip(), { headers: { "content-length": "8" } });

/**
 * @function stub
 * @param route {Route} answers each request
 * @param options {Omit<MirrorClientOptions, "fetch">} the other client options
 * @returns {{ client, calls }} a client on the stub fetch, and every URL it fetched
 */
export const stub = (route: Route, options: Omit<MirrorClientOptions, "fetch"> = {}) => {
  const calls: { url: string; headers: Headers }[] = [];
  const client = createMirrorClient({
    ...options,
    fetch: async (input, init) => {
      calls.push({ url: String(input), headers: new Headers(init?.headers) });
      return route(String(input), init);
    },
  });
  return { client, calls };
};

/** The host a URL points at, for routing by mirror. */
export const host = (url: string): string => new URL(url).host;

/**
 * @function failure
 * @param promise {Promise<unknown>} a call expected to reject
 * @returns {Promise<unknown>} what it rejected with, or null when it resolved
 */
export const failure = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => null,
    (error: unknown) => error,
  );

/** A fetch that never answers; it rejects with the signal's reason on abort, as fetch does. */
export const hang: Route = (_url, init) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
  });
