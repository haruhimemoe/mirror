# AGENTS.md

`@haruhimemoe/mirror`: downloads osu! beatmapsets from whichever public mirror has them, hinai first, failing over down an ordered list. It also holds the hinai client that used to be `@haruhimemoe/hinai` (deprecated). Three entry points, all running in browsers, workers and on servers: `@haruhimemoe/mirror` (failover), `@haruhimemoe/mirror/hinai` (the hinai client) and `@haruhimemoe/mirror/testing` (msw mocks of hinai).

## Layout

- `src/index.ts`: the root entry. Re-exports `client.ts`, `errors.ts`, `mirrors.ts`, the types in `types.ts`, and `HinaiError`, `OSZ_MIME` and the retry helpers from `src/hinai/`.
- `src/hinai/`: the `/hinai` entry, moved from `@haruhimemoe/hinai` 0.3.1. `client.ts` (`createHinaiClient`, `setDownloadUrl`, constants), `response.ts` and `archive.ts` (internal reading), `errors.ts` (`HinaiError`), `retry.ts`, `schemas.ts` (internal), `types.ts`, `index.ts`.
- `src/testing/`: the `/testing` entry. msw handlers, `fixtures.ts` (answers recorded from hinai), `osz.ts` (`fakeOsz`). Only this entry imports msw.
- `src/client.ts`: `createMirrorClient` (`downloadSet`, `downloadLinks`, `health`, `getBeatmaps`, `getAvailability`), `MIRROR_TIMEOUT_MS`, `MIRROR_FAILURE_LIMIT`, `MirrorClient`.
- `src/mirrors.ts`: `Mirror`, `MirrorId`, `MIRRORS`, `DEFAULT_MIRRORS`.
- `src/archive.ts`: reading a body into an `.osz` Blob with progress and the zip check (internal).
- `src/errors.ts`: `MirrorError`, `MirrorErrorCode`, `MirrorAttempt`.
- `src/types.ts`: option and result types.
- `tests/`: Vitest. Failover tests on stub fetches (`tests/helpers/stub-fetch.ts`, written against `TEST_ORDER`); hinai's tests in `tests/hinai/` with `helpers/hinai-stub.ts` and `helpers/hinai-server.ts` (msw on the `/testing` handlers). `tests/exports.test.ts` and `tests/hinai/exports.test.ts` pin every entry's exports, the default order, and that the root and `/hinai` share one `HinaiError`.
- `scripts/smoke.mjs`: imports the built `dist/` (all three entries) and runs them against stub fetches (`bun run test:dist`).
- `scripts/check-consumer.mjs`: packs the package into a throwaway project with a given zod version, typechecks a strict consumer of all three entries and runs it (`bun run check:consumer <zod version>`).

## Rules

- **Never host or proxy beatmap bytes.** This package points callers at public mirrors; it must never route an `.osz` through a haruhime server. Rights holders go to each mirror's takedown process.
- **Browser-first.** No custom headers unless the caller passes `userAgent` (servers only).
- **hinai is first and the metadata source.** Failover code calls hinai through `src/hinai/`, never by URL by hand.
- **`/hinai` keeps `@haruhimemoe/hinai` 0.3.1's API.** Apps migrate by swapping the import path, so don't rename its exports or change its behavior without a semver note. The root re-exports shared pieces from `src/hinai/`; never define a second `HinaiError`.
- **Shapes come from `@haruhimemoe/osu/shapes`, in lockstep.** `@haruhimemoe/osu` is a regular dependency pinned `^0.4.0` and its `BeatmapMeta` crosses the public API; every osu minor below 1.0 needs a matching mirror release. Never import `@haruhimemoe/osu`'s client.
- **hinai errors:** every `/hinai` failure is a `HinaiError` with an honest `retryable`, `requestId` and `forensicsUrl` once a response arrived; aborts reject with the signal's reason; bad arguments throw `RangeError` before any request. Metadata requests are timed end to end, downloads only until headers.
- **Cooldowns only for mirror-wide trouble.** A failure about one set (a 403, a 5xx with a set-specific Retry-After) must not cool a whole mirror at once.
- **Before changing a built-in mirror's URL or default order, check it live** (a range request for set 1 and a missing set) and note the date in `src/mirrors.ts` and the README.
- **Tests never call real mirrors.** Stub fetches and msw only, synthetic zips only. When hinai's answers change, re-record them in `src/testing/fixtures.ts`: apps mock hinai with them too.
- **Public API is pinned** by `tests/exports.test.ts`. Adding or removing an export is a semver decision: note it in `CHANGELOG.md`.
- **Docs match the code.** `README.md` documents every export, option, default and error code; update `llms.txt` with it.
- **Releases are cut by the maintainers.** Don't bump the version, tag or publish unless a maintainer asks.
- Code style: Biome (2 spaces, double quotes, 100 columns). Every file starts with the `@file / @desc / @author / @created / @modified` header. Exported functions get JSDoc. Imports in `src/` use `.js` extensions.

## Before calling a change done

```sh
bun run check && bun run typecheck && bun run test:coverage && bun run test:dist
bun run check:consumer 4.0.16 && bun run check:consumer latest
```

The consumer check needs the npm registry. Coverage must stay at or above the 95% floor in `vitest.config.ts`.
