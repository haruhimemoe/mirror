# Changelog

All notable changes to `@haruhimemoe/mirror` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-10-10

### Changed

- Depends on `@haruhimemoe/osu` ^0.7.0 (was ^0.4.0), so apps on osu 0.7 get one copy of the shapes. The `msw` peer for `/testing` takes 3 as well as 2.
- CI runs CodeQL and a gitleaks scan of the full git history, and Dependabot covers dependencies and pinned actions. Dependencies are on their latest versions.

## [0.1.0] - 2026-10-06

### Added

- `createMirrorClient` with `downloadSet` (failover across hinai, osu.direct, Mino and Sayobot, with zip checks, progress and abort), `downloadLinks`, `health`, and hinai's `getBeatmaps` and `getAvailability`.
- `@haruhimemoe/mirror/hinai`: the whole `@haruhimemoe/hinai` 0.3.1 client, moved here unchanged. `@haruhimemoe/hinai` is deprecated in its favor; swap the import path.
- `@haruhimemoe/mirror/testing`: `@haruhimemoe/hinai/testing`, moved here unchanged (msw 2 as an optional peer).
- `HinaiError`, `HinaiErrorCode`, `OSZ_MIME`, `parseRetryAfter`, `backoffDelayMs` and `MAX_RETRY_DELAY_MS` from the root too, the same objects as `/hinai`'s.
- Per-mirror cooldowns: a network error, timeout or 429 at once, other failures after `MIRROR_FAILURE_LIMIT` in a row.
- `MirrorError` with `not_found`, `unavailable` and `download_disabled`, and every failed attempt.
- `MIRRORS`, `DEFAULT_MIRRORS` and custom `Mirror` objects, with `missingStatuses` for mirrors that don't answer 404.

[unreleased]: https://github.com/haruhimemoe/mirror/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/haruhimemoe/mirror/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/haruhimemoe/mirror/releases/tag/v0.1.0
