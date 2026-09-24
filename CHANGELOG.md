# Changelog

All notable changes to **Get It In The Bucket** are documented here.

This project follows [Semantic Versioning](https://semver.org/):

- **Minor** releases add meaningful gameplay or player-facing capabilities.
- **Patch** releases fix bugs, polish presentation, or improve documentation without
  changing the core game.

## [Unreleased]

No unreleased changes.

## [0.3.1] - 2026-09-24

### Changed

- Made the confirmed **BUCKET** label briefly glow before smoothly filling green.
- Matched the label's final background, text, and border styling to **GROUND** and **WALL**.

### Tests

- Updated the browser scoring test to compare the final computed styles of all three
  sequence labels.

## [0.3.0] - 2026-09-24

### Added

- Added a green interior light and emissive floor when a shot is confirmed in the bucket.
- Added a confirmed bucket state to the live `GROUND → WALL → BUCKET` sequence display.

### Fixed

- Prevented the ball from rendering through the steel bucket wall while below the rim.
- Kept the ball visible again if it bounces out before the settle timer confirms a score.
- Tied all success visuals to the existing settle threshold, so they cannot trigger for a
  ball that may still escape.

### Tests

- Added browser assertions for the completed BUCKET state, illuminated interior, hidden
  settled ball, scoring flow, and steal flow.

## [0.2.2] - 2026-09-23

### Fixed

- Made the bucket placement ghost visible immediately on touch devices, before the first
  finger drag.
- Seeded the ghost in the middle of the legal placement zone.

### Tests

- Added a mobile regression check for pre-drag bucket visibility and legal placement.

## [0.2.1] - 2026-09-23

### Changed

- Replaced the plain wall with cartoon brickwork.
- Added staggered rounded bricks, heavy mortar, painted highlights and shadows, color
  variation, small chips, and a dark outer outline.
- Preserved the existing wall dimensions and collision physics.

## [0.2.0] - 2026-09-23

### Added

- Added endless solo mode: every successful shot adds one point with no end condition.
- Added a horizontal single-select player picker for one through eight players.
- Added an iPhone-sized automated layout check with touch input enabled.

### Changed

- Reworked the mobile HUD into a compact horizontal scoreboard strip.
- Separated the instruction banner from the scoreboard.
- Shortened and repositioned the power meter for small screens.
- Kept the throw and result controls inside mobile safe areas.
- Enlarged the setup panel on larger screens.

### Tests

- Added solo scoring assertions across repeated rounds.
- Verified the maximum eight-player HUD has no overlap on a 393×852 viewport.

## [0.1.1] - 2026-09-23

### Documentation

- Documented GitHub Pages deployment.
- Added custom-domain DNS records and HTTPS setup instructions for
  `www.getitinthebucket.com`.

## [0.1.0] - 2026-09-23

### Added

- Created the initial 3D **Get It In The Bucket** browser game.
- Added hot-seat multiplayer, player names, turn rotation, point stealing, and an endless
  scoreboard.
- Added bucket and feather placement within a validated playable zone.
- Added mouse and touch aiming, a vertical timing-based power meter, and trajectory preview.
- Added Rapier physics with CCD for the ball, ground and wall bounces, and a compound bucket.
- Enforced the exact `ground once → wall once → bucket` scoring sequence.
- Added live rule-state feedback and reasons for invalid throws.
- Added a steel bucket, ground feather, title screen, player colors, ball trail, and camera
  tracking.
- Added synthesized WebAudio effects for bounces, wall hits, bucket impacts, scoring,
  steals, invalid throws, and misses.
- Added a mute control.
- Added Vite development and production builds.
- Added automated rule, browser smoke, scoring, title-fit, and physics-feasibility tools.
- Added a deterministic physics solver proving that every allowed placement has a legal
  shot.
- Added automatic GitHub Pages deployment on pushes to `main`.

[Unreleased]: https://github.com/horgsz/GIITB/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/horgsz/GIITB/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/horgsz/GIITB/compare/v0.2.2...v0.3.0
[0.2.2]: https://github.com/horgsz/GIITB/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/horgsz/GIITB/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/horgsz/GIITB/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/horgsz/GIITB/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/horgsz/GIITB/releases/tag/v0.1.0
