# Changelog

All notable changes to `@haruhimemoe/mirror` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `createMirrorClient` with `downloadSet` (failover across osu.direct, Mino and Sayobot, then hinai, with zip checks, progress and abort), `downloadLinks`, `health`, and hinai's `getBeatmaps` and `getAvailability`.
- Per-mirror cooldowns: a network error, timeout or 429 at once, other failures after `MIRROR_FAILURE_LIMIT` in a row.
- `MirrorError` with `not_found`, `unavailable` and `download_disabled`, and every failed attempt.
- `MIRRORS`, `DEFAULT_MIRRORS` and custom `Mirror` objects, with `missingStatuses` for mirrors that don't answer 404.
