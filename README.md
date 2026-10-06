# @haruhimemoe/mirror

Downloads osu! beatmapsets (`.osz`) from whichever public mirror has them, used by the haruhime.moe tools:

- **Failover:** tries [hinai](https://mirror.hinamizawa.ai) first, then [osu.direct](https://osu.direct), [Mino](https://catboy.best) and [Sayobot](https://osu.sayobot.cn). A 404 moves on to the next mirror; so do errors, timeouts and answers that aren't a zip.
- **Cooldowns:** a mirror that looks down (a network error, a timeout, a 429, or 3 failures in a row) is skipped by later downloads until its `Retry-After` or backoff has passed.
- **Zip checks:** every archive's first bytes are checked to be a zip before any progress is reported. Mirrors sometimes answer 200 with a JSON error.
- **Straight from the mirror:** bytes go from the mirror to your code. Nothing is hosted or proxied, and in a browser the mirror answers the browser directly (every mirror here sends open CORS).
- **The hinai client:** `@haruhimemoe/mirror/hinai` is the whole hinai client (metadata, availability, downloads), and `@haruhimemoe/mirror/testing` mocks hinai with msw. They replace `@haruhimemoe/hinai`, which is deprecated.

## Install

```sh
npm install @haruhimemoe/mirror zod
# or
bun add @haruhimemoe/mirror zod
```

`zod` (4.0.16 or later in 4.x) is a peer dependency. `@haruhimemoe/osu` installs with it; only its beatmap shapes are used. If your app imports `@haruhimemoe/osu` too, keep it on 0.4.x so there's one copy and one `BeatmapMeta` type. `msw` 2 is an optional peer, needed only for `/testing`.

| Entry | What |
| --- | --- |
| `@haruhimemoe/mirror` | The failover client, `MirrorError`, the mirror table, and `HinaiError`, `OSZ_MIME` and the retry helpers |
| `@haruhimemoe/mirror/hinai` | The hinai client, as `@haruhimemoe/hinai` 0.3.1 had it |
| `@haruhimemoe/mirror/testing` | msw handlers that mock hinai, recorded answers, `fakeOsz` |

## Moving from @haruhimemoe/hinai

Swap the import paths and remove the old package:

```diff
- import { createHinaiClient, HinaiError } from "@haruhimemoe/hinai";
- import { hinaiHandlers } from "@haruhimemoe/hinai/testing";
+ import { createHinaiClient, HinaiError } from "@haruhimemoe/mirror/hinai";
+ import { hinaiHandlers } from "@haruhimemoe/mirror/testing";
```

Names and behavior are unchanged. Don't keep both packages installed: each has its own `HinaiError` class, and `instanceof` fails across them.

## Usage

```ts
import { createMirrorClient, MirrorError } from "@haruhimemoe/mirror";

const mirror = createMirrorClient(); // in a browser
// On a server, name your tool. Mino refuses server requests without a User-Agent.
// const mirror = createMirrorClient({ userAgent: "my-tool/1.0 (https://example.com)" });

try {
  const { blob, mirror: from, failed } = await mirror.downloadSet(320118, {
    onProgress: ({ mirror, loaded, total }) => console.log(mirror, loaded, total),
  });
  console.log(`got ${blob.size} bytes from ${from} after ${failed.length} misses`);
} catch (error) {
  if (error instanceof MirrorError && error.retryable) {
    // try again after error.retryAfterMs
  }
}
```

Set ids, not difficulty ids: `downloadSet` takes a `beatmapset_id`.

## API

### `createMirrorClient(options?)`

| Option | Default | |
| --- | --- | --- |
| `mirrors` | `DEFAULT_MIRRORS` | Mirrors to try, in order: built-in ids or your own `Mirror` objects |
| `fetch` | `globalThis.fetch` | Looked up per request, so test interceptors installed later still apply |
| `timeoutMs` | `MIRROR_TIMEOUT_MS` (10 000) | How long each mirror gets to send a download's headers; the body then streams with no limit but your signal. Also hinai's metadata timeout |
| `userAgent` | none | Sent from servers only. Browsers and workers ignore it: they send their own, and a custom header would force a CORS preflight |
| `now` | `Date.now` | Clock for cooldowns |

Throws a `RangeError` when `mirrors` is empty, names an unknown id or repeats one, `timeoutMs` isn't an integer from 1 to 2147483647, or `userAgent` (on a server) isn't a valid header value.

### `downloadSet(setId, options?)`

Resolves to `{ blob, mirror, failed }`: the `.osz` (typed `OSZ_MIME`), the id of the mirror that sent it, and a `MirrorAttempt` for each mirror that failed first.

| Option | |
| --- | --- |
| `video` | `true` for the archive with its video. Default `false` |
| `signal` | Stops the download; it then rejects with the signal's reason |
| `onProgress` | `({ mirror, loaded, total })` per chunk, after the zip check. Starts again at 0 when a mirror fails over. What it throws rejects the call |
| `checkAvailability` | Ask hinai first whether osu! disabled the set's download, and fail fast with `download_disabled`. One extra request. If the check itself fails, the download goes ahead |

A set id that isn't a positive integer throws a `RangeError` before any request.

### `downloadLinks(setId, video?)`

Each mirror's URL for the set as `{ mirror, url }`, in order, mirrors cooling down last. Use it for plain `<a href>` links or when the browser should save the file itself.

### `health()`

Each mirror's `{ mirror, failures, coolingUntil }`: failures in a row (404s don't count) and when it's worth asking again, or `null`.

### `getBeatmaps(ids)` and `getAvailability(setId)`

The hinai client's, passed through. See [Metadata](#metadata) and [Availability](#availability). They reject with a `HinaiError`.

### Mirrors

`MIRRORS` holds the built-ins by id, and `DEFAULT_MIRRORS` the default order:

| Id | Mirror | Default | Notes |
| --- | --- | --- | --- |
| `hinai` | hinai | 1st | The mirror this package was built around |
| `osudirect` | osu.direct | 2nd | Redirects to short-lived storage links |
| `catboy` | Mino (catboy.best) | 3rd | Needs a User-Agent from servers |
| `sayobot` | Sayobot | 4th | Answers 403 for sets it doesn't have; slower outside Asia |
| `nerinyan` | NeriNyan | off | Answered 404 for every set when checked (Oct 2026) |

Add your own with a `Mirror` object:

```ts
const mirror = createMirrorClient({
  mirrors: [
    "hinai",
    {
      id: "mine",
      name: "My mirror",
      homepage: "https://example.com",
      downloadUrl: (setId, video) => `https://example.com/d/${setId}${video ? "" : "?nv=1"}`,
      missingStatuses: [403], // optional: statuses besides 404 and 410 that mean "no such set"
    },
    "osudirect",
  ],
});
```

### Errors

`downloadSet` rejects with a `MirrorError` once every mirror has had its turn:

| `code` | `retryable` | When |
| --- | --- | --- |
| `not_found` | false | Every mirror asked said it doesn't have the set |
| `unavailable` | true | The rest failed, or were cooling down. `retryAfterMs` is the shortest wait any mirror asked for, when one did |
| `download_disabled` | false | `checkAvailability` found osu! disabled the set's download; the message is hinai's reason |

`attempts` lists every failed try as `{ mirror, url, code, status, retryAfterMs }`, where `code` is `not_found`, `http_error`, `network`, `timeout` or `bad_response` (a 200 that wasn't a zip).

Aborts reject with the signal's reason, not a `MirrorError`. So do errors thrown by `onProgress`.

### Cooldowns

A network error, a timeout or a 429 cools a mirror down at once. Other failures (a 403, a 5xx, a bad body) often concern one set, so they only cool it down after `MIRROR_FAILURE_LIMIT` (3) in a row. The wait is the mirror's `Retry-After` (capped at 60 s), else 1 s, 2 s, 4 s and so on by failures in a row. A download resets the mirror. State lives in the client: make one per app, not per download.

## The hinai client

`@haruhimemoe/mirror/hinai` talks to [hinai](https://mirror.hinamizawa.ai) alone: no failover. Use it for metadata, or when you want hinai's request ids and forensics URLs on every error.

### hinai usage

```ts
import { createHinaiClient } from "@haruhimemoe/mirror/hinai";

const hinai = createHinaiClient(); // in a browser
// On a server, say who you are, as the mirror asks:
// createHinaiClient({ userAgent: "my-app/1.0 (+https://example.com)" })

const controller = new AbortController();

// Metadata takes difficulty ids.
const { found, missing } = await hinai.getBeatmaps([129891, 75], { signal: controller.signal });
for (const [id, meta] of found) console.log(id, meta.artist, meta.title, meta.version);
console.log("not on the mirror:", missing);

// Availability and downloads take set ids.
const { downloadable, reason } = await hinai.getAvailability(39804, { signal: controller.signal });
if (downloadable) {
  const osz = await hinai.downloadSet(39804, {
    video: false,
    signal: controller.signal,
    onProgress: ({ loaded, total }) => console.log(loaded, total),
  });
  console.log(osz.size, osz.type); // type is "application/x-osu-beatmap-archive"
} else {
  console.log("downloads are disabled:", reason);
}
```

#### Metadata

`getBeatmaps(ids, { signal })` takes difficulty ids. Duplicates are fine.

- Valid ids go to the mirror in requests of 100 (`HINAI_BATCH_LIMIT`), one after another. If one request fails, the whole call rejects with that error.
- `found` is a `Map` from difficulty id to `BeatmapMeta`: ids, ruleset, title, artist, version, creator, CS/AR/OD/HP, BPM, length, star rating and md5 checksum. The fields are listed in [`@haruhimemoe/osu`](https://github.com/haruhimemoe/osu#shapes).
- `missing` has every id you passed that isn't in `found`, once each, in the order you passed them. That covers ids the mirror doesn't know, ids that aren't positive integers, and rows the mirror sent that don't parse as an osu! beatmap.
- A list with no valid ids sends no request.

#### Availability

`getAvailability(setId, { signal })` takes a set id and resolves to `{ downloadable, reason }`.

- `downloadable` is `false` only when the mirror says downloads are disabled (a DMCA or other takedown). `reason` is the mirror's `more_information` text, or `null`.
- When the mirror doesn't know whether a set is blocked (`download_disabled: null`), `downloadable` is `true`: try the download.
- A set the mirror doesn't know rejects with a `HinaiError` whose code is `not_found`.

#### Downloads

`downloadSet(setId, { video, signal, onProgress })` takes a set id and resolves to a `Blob` of type `application/x-osu-beatmap-archive` (`OSZ_MIME`), held in memory.

- `video: false` (the default) asks for the archive without its video. The mirror only keeps no-video archives itself, so `video: true` can be slower.
- The first 4 bytes must be the zip signature (`PK\x03\x04`), else the call rejects with `bad_response`.
- `onProgress` is called once per chunk, only after that check, with `{ loaded, total }`. `total` is the `content-length`, or `null` when the mirror didn't send one or the body turned out longer.
- `timeoutMs` only covers the wait for the response headers (and, on an error status, reading the mirror's error body). Once the archive streams, only your `signal` stops a download.
- `setDownloadUrl(setId, baseUrl?, video?)` builds the same URL without downloading anything.

#### Aborts and bad arguments

- Every method takes a `signal`. An abort rejects with the signal's reason (a `DOMException` named `AbortError`, unless you aborted with a reason of your own), not a `HinaiError`. A signal that's already aborted rejects at once, before any request, even when there's nothing to send (an empty id list). An error thrown by your `onProgress` also rejects the call as it is.
- `createHinaiClient` throws a `RangeError` for a bad `baseUrl`, `timeoutMs` or `userAgent`, and `setDownloadUrl` for a bad set id or `baseUrl`.
- `getAvailability` and `downloadSet` reject with a `RangeError`, before any request, for a set id that isn't a positive integer.

#### Options

Options to `createHinaiClient`:

| Option | Default | Notes |
| --- | --- | --- |
| `baseUrl` | `https://mirror.hinamizawa.ai` (`HINAI_BASE_URL`) | Absolute http(s) URL with no query, hash or credentials, else a `RangeError`. A path is kept (a mirror behind a proxy prefix); trailing slashes are dropped. |
| `userAgent` | none | Sent as `User-Agent`, on servers only. Ignored in a browser (where `document` exists) or a worker (`self` with `importScripts` and no `window`): pages and workers can't set it, and an extra header would force a CORS preflight. On a server it must be a valid header value (no line breaks, nothing outside Latin-1), else a `RangeError`. |
| `timeoutMs` | `10_000` (`HINAI_TIMEOUT_MS`) | Per metadata or availability request, body included. For a download, only until the headers arrive (plus the error body on an error status). Must be an integer from 1 to 2147483647 (2^31 - 1: `setTimeout`'s own limit), else a `RangeError`. |
| `fetch` | `globalThis.fetch` | For tests or a custom agent. Without it, `globalThis.fetch` is looked up on every request, so a fetch mock installed later still applies. |

Every option, and every method option, also accepts `undefined`, which means "use the default".

### hinai API

Everything below is exported from `@haruhimemoe/mirror/hinai`, except `getBeatmaps`, `getAvailability` and `downloadSet`, which are methods on the client. The msw mocks for tests are in [Testing](#testing).

**Client**

| Export | Description |
| --- | --- |
| `createHinaiClient(options?)` | Builds the client: `getBeatmaps`, `getAvailability`, `downloadSet` (below). |
| `HinaiClient` | Type of the object `createHinaiClient` returns. |
| `HinaiClientOptions` | `baseUrl`, `fetch`, `userAgent`, `timeoutMs`. See [Options](#options). |
| `setDownloadUrl(setId, baseUrl?, video?)` | The `.osz` URL for a set, without downloading it. No-video unless `video` is `true`. Throws `RangeError` for a bad `setId` or `baseUrl` (checked like the client's). |
| `HINAI_BASE_URL` | Default `baseUrl`: `"https://mirror.hinamizawa.ai"`. |
| `HINAI_TIMEOUT_MS` | Default `timeoutMs`: `10_000`. |
| `HINAI_BATCH_LIMIT` | Ids per metadata request: `100`. `getBeatmaps` splits longer lists into requests of this size. |
| `OSZ_MIME` | MIME type of the `Blob` `downloadSet` resolves to: `"application/x-osu-beatmap-archive"`. |

**Methods (on the object `createHinaiClient` returns) and their shapes**

| Name | Description |
| --- | --- |
| `getBeatmaps(ids, options?)` | `Promise<BeatmapLookup>`: metadata for every difficulty id the mirror knows. |
| `BeatmapLookup` | `{ found: Map<number, BeatmapMeta>; missing: number[] }` |
| `BeatmapOptions` | `{ signal? }` |
| `getAvailability(setId, options?)` | `Promise<SetAvailability>`. Rejects with `RangeError` for a bad `setId`. |
| `SetAvailability` | `{ downloadable: boolean; reason: string \| null }` |
| `AvailabilityOptions` | `{ signal? }` |
| `downloadSet(setId, options?)` | `Promise<Blob>`. Rejects with `RangeError` for a bad `setId`. |
| `DownloadOptions` | `{ signal?; onProgress?; video? }` |
| `DownloadProgress` | `{ loaded: number; total: number \| null }` |

`BeatmapMeta` itself comes from `@haruhimemoe/osu/shapes`; this package doesn't re-export it.

**Errors and retry**

| Export | Description |
| --- | --- |
| `HinaiError` | `extends Error`, with `name` `"HinaiError"`. Fields in [Errors](#hinai-errors). |
| `HinaiErrorCode` | The client's own codes (`network`, `timeout`, `bad_response`, `not_found`, `http_error`), or any string (the mirror's own, e.g. `upstream_relay_shed`). |
| `backoffDelayMs(attempt, retryAfterMs)` | ms to wait after `attempt` failed tries (1-based): `retryAfterMs` when it isn't `null`, else 1s, 2s, 4s… capped at `MAX_RETRY_DELAY_MS`. |
| `parseRetryAfter(header, now)` | Parses a `Retry-After` header into ms, from 0 to `MAX_RETRY_DELAY_MS`. It reads delta-seconds (`"120"`) or an HTTP date in the IMF-fixdate form (`"Tue, 22 Sep 2026 12:00:03 GMT"`, measured from `now` in ms). `null` when the header is `null` or in any other form (`"1.5"`, `"-5"`, an ISO date). |
| `MAX_RETRY_DELAY_MS` | `60_000`: the cap on `parseRetryAfter`'s result and on the backoff. |

#### Retrying

```ts
import { backoffDelayMs, createHinaiClient, HinaiError } from "@haruhimemoe/mirror/hinai";

const hinai = createHinaiClient();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function downloadWithRetries(setId: number) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await hinai.downloadSet(setId);
    } catch (error) {
      if (!(error instanceof HinaiError) || !error.retryable || attempt === 4) throw error;
      await sleep(backoffDelayMs(attempt, error.retryAfterMs)); // Retry-After, else 1s, 2s, 4s…
    }
  }
}
```

#### hinai errors

A `HinaiError` has:

| Field | Value |
| --- | --- |
| `code` | One of the codes below. |
| `message` | For the client's own codes, a sentence you can show to users. For the mirror's codes, the mirror's `error` text. |
| `status` | The HTTP status, or `null` for `network` and `timeout`. |
| `retryable` | Whether trying again can help. |
| `retryAfterMs` | The mirror's `Retry-After` in ms (at most 60 s) on an error status other than 404, else `null`. |
| `hint` | The mirror's `hint` from its error body, else `null`. |
| `requestId` | The response's `x-hinai-request-id`, else `null`. It is `null` when no response arrived (a `network` failure or a `timeout` before the headers). |
| `forensicsUrl` | The response's `x-hinai-forensics` when it's an absolute http(s) URL, else `null` (as for `requestId`), so it's safe to show as a link. |
| `cause` | The underlying error when there is one (for example fetch's `TypeError` or a JSON `SyntaxError`). |

| `code` | Meaning | Retry? |
| --- | --- | --- |
| `network` | Couldn't reach the mirror, or a download broke off | yes |
| `timeout` | No answer within `timeoutMs` | yes |
| `bad_response` | A success status whose body isn't what it should be (not JSON, not the expected shape, not a zip) | yes |
| `not_found` | A 404. For availability and downloads, the mirror doesn't have the set. For metadata, `baseUrl` has no metadata endpoint | no |
| `http_error` | Another error status, without the mirror's error body | 5xx and 429 only |
| anything else | The mirror's own code (e.g. `upstream_relay_shed`), with its `error` as the message | as the mirror says, else 5xx and 429 only |

### Testing

`@haruhimemoe/mirror/testing` mocks the mirror for your app's tests with [msw](https://mswjs.io) 2 (an optional peer: install it yourself). These are the handlers and recorded answers this package tests itself with, so your mocks change when the client does.

```ts
import { hinaiHandlers, hinaiUnknownSetHandler } from "@haruhimemoe/mirror/testing";
import { setupServer } from "msw/node";

const server = setupServer(...hinaiHandlers);
// In a test: availability for any set now rejects with not_found.
server.use(hinaiUnknownSetHandler);
```

| Export | Description |
| --- | --- |
| `hinaiHandlers` | Every endpoint the client calls: `hinaiBatchHandler` and `hinaiDownloadHandlers`. |
| `hinaiBatchHandler` | Metadata from `recordedBeatmaps`: the rows asked for, unknown ids left out, as the mirror does. |
| `hinaiDownloadHandlers` | `hinaiAvailabilityHandler` (downloadable, for any set) and `hinaiDownloadHandler` (`fakeOsz(setId)` with a `content-length`). |
| `hinaiUnknownSetHandler` | Availability answered with the recorded 404 for a set no source knows. |
| `HINAI_BATCH_URL`, `HINAI_AVAILABILITY_URL`, `HINAI_DOWNLOAD_URL` | The endpoints on the default mirror, as msw paths (`:setId`), for your own `http.get` overrides. |
| `fakeOsz(setId)` | A small valid zip (`Uint8Array`) holding one stand-in `<setId>.osu`, the same bytes on every call. Real `.osz` files are copyrighted. |
| `recordedBeatmaps` | The mirror's answer for difficulties 129891 (FREEDOM DiVE [FOUR DIMENSIONS]), 2116202 and 1872396, as `RecordedBeatmapRow[]` (`{ id: number }` plus the mirror's other fields). |
| `recordedAvailability`, `recordedUnknownSet` | The mirror's availability answer for set 39804, and its 404 body for an unknown set. |

The handlers answer on `https://mirror.hinamizawa.ai` only; for another `baseUrl`, write your own with the recorded answers and `fakeOsz`.

## Etiquette

- Download one or two sets at a time and cache finished files (browsers: OPFS or IndexedDB).
- Identify your tool with `userAgent` on servers.
- Don't re-host `.osz` files. Rights holders use each mirror's own takedown process.

## Compatibility

Node 22.12 or later, current browsers and workers. ESM only.

## License

MIT
