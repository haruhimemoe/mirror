# @haruhimemoe/mirror

Downloads osu! beatmapsets (`.osz`) from whichever public mirror has them, used by the haruhime.moe tools:

- **Failover:** tries [osu.direct](https://osu.direct), [Mino](https://catboy.best) and [Sayobot](https://osu.sayobot.cn) in that order, then falls back to [hinai](https://mirror.hinamizawa.ai). A 404 moves on to the next mirror; so do errors, timeouts and answers that aren't a zip.
- **Cooldowns:** a mirror that looks down (a network error, a timeout, a 429, or 3 failures in a row) is skipped by later downloads until its `Retry-After` or backoff has passed.
- **Zip checks:** every archive's first bytes are checked to be a zip before any progress is reported. Mirrors sometimes answer 200 with a JSON error.
- **Straight from the mirror:** bytes go from the mirror to your code. Nothing is hosted or proxied, and in a browser the mirror answers the browser directly (every mirror here sends open CORS).
- **Metadata through hinai:** `getBeatmaps` and `getAvailability` are [`@haruhimemoe/hinai`](https://github.com/haruhimemoe/hinai)'s.

## Install

```sh
npm install @haruhimemoe/mirror zod
# or
bun add @haruhimemoe/mirror zod
```

`zod` (4.0.16 or later in 4.x) is a peer of `@haruhimemoe/hinai`, which installs with this package.

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

hinai's, unchanged. See [`@haruhimemoe/hinai`](https://github.com/haruhimemoe/hinai#metadata). They reject with a `HinaiError` (re-exported here).

### Mirrors

`MIRRORS` holds the built-ins by id, and `DEFAULT_MIRRORS` the default order:

| Id | Mirror | Default | Notes |
| --- | --- | --- | --- |
| `osudirect` | osu.direct | 1st | Redirects to short-lived storage links |
| `catboy` | Mino (catboy.best) | 2nd | Needs a User-Agent from servers |
| `sayobot` | Sayobot | 3rd | Answers 403 for sets it doesn't have; slower outside Asia |
| `nerinyan` | NeriNyan | off | Answered 404 for every set when checked (Oct 2026) |
| `hinai` | hinai | last | The fallback |

Add your own with a `Mirror` object:

```ts
const mirror = createMirrorClient({
  mirrors: [
    "osudirect",
    {
      id: "mine",
      name: "My mirror",
      homepage: "https://example.com",
      downloadUrl: (setId, video) => `https://example.com/d/${setId}${video ? "" : "?nv=1"}`,
      missingStatuses: [403], // optional: statuses besides 404 and 410 that mean "no such set"
    },
    "hinai",
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

## Etiquette

- Download one or two sets at a time and cache finished files (browsers: OPFS or IndexedDB).
- Identify your tool with `userAgent` on servers.
- Don't re-host `.osz` files. Rights holders use each mirror's own takedown process.

## Compatibility

Node 22.12 or later, current browsers and workers. ESM only.

## License

MIT
