# AGENTS.md

`@haruhimemoe/mirror`: downloads osu! beatmapsets from whichever public mirror has them, failing over down an ordered list with hinai last. Metadata comes from `@haruhimemoe/hinai`. One npm package, one entry point, runs in browsers, workers and on servers.

## Layout

- `src/index.ts`: the entry point. Re-exports `client.ts`, `errors.ts`, `mirrors.ts`, the types in `types.ts`, and `HinaiError` and `OSZ_MIME` from `@haruhimemoe/hinai`.
- `src/client.ts`: `createMirrorClient` (`downloadSet`, `downloadLinks`, `health`, `getBeatmaps`, `getAvailability`), `MIRROR_TIMEOUT_MS`, `MIRROR_FAILURE_LIMIT`, `MirrorClient`.
- `src/mirrors.ts`: `Mirror`, `MirrorId`, `MIRRORS`, `DEFAULT_MIRRORS`.
- `src/archive.ts`: reading a body into an `.osz` Blob with progress and the zip check (internal).
- `src/errors.ts`: `MirrorError`, `MirrorErrorCode`, `MirrorAttempt`.
- `src/types.ts`: option and result types.
- `tests/`: Vitest on stub fetches (`tests/helpers/stub-fetch.ts`). `tests/exports.test.ts` pins the runtime exports and the default order.
- `scripts/smoke.mjs`: imports the built `dist/` and runs a failover against a stub fetch (`bun run test:dist`).

## Rules

- **Never host or proxy beatmap bytes.** This package points callers at public mirrors; it must never route an `.osz` through a haruhime server. Rights holders go to each mirror's takedown process.
- **Browser-first.** No custom headers unless the caller passes `userAgent` (servers only).
- **hinai stays the fallback and the metadata source.** Use `@haruhimemoe/hinai` for anything hinai-specific; don't copy its client here.
- **Cooldowns only for mirror-wide trouble.** A failure about one set (a 403, a 5xx with a set-specific Retry-After) must not cool a whole mirror at once.
- **Before changing a built-in mirror's URL or default order, check it live** (a range request for set 1 and a missing set) and note the date in `src/mirrors.ts` and the README.
- **Tests never call real mirrors.** Stub fetches only, synthetic zips only.
- **Public API is pinned** by `tests/exports.test.ts`. Adding or removing an export is a semver decision: note it in `CHANGELOG.md`.
- **Docs match the code.** `README.md` documents every export, option, default and error code; update `llms.txt` with it.
- **Releases are cut by the maintainers.** Don't bump the version, tag or publish unless a maintainer asks.
- Code style: Biome (2 spaces, double quotes, 100 columns). Every file starts with the `@file / @desc / @author / @created / @modified` header. Exported functions get JSDoc. Imports in `src/` use `.js` extensions.

## Before calling a change done

```sh
bun run check && bun run typecheck && bun run test:coverage && bun run test:dist
```

Coverage must stay at or above the 95% floor in `vitest.config.ts`.
