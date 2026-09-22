# Get It In The Bucket (GIITB)

A 3D web game of the backyard classic. Bounce the ball off the ground **once**, off the wall
**once**, then into the bucket.

## Running locally

```bash
npm install
npm run dev      # http://localhost:5173, opens automatically, hot-reloads on save
```

Other scripts:

```bash
npm test             # typecheck + turn/scoring rule assertions (fast)
npm run typecheck    # tsc --noEmit
npm run build        # typecheck + production bundle into dist/
npm run preview      # serve the production build
```

No backend, no database, no build step to babysit — it's a static site.

## Tests

```bash
npm test                  # typecheck + rules assertions
npm run check:rules       # turn order, stealing and scoring (tools/rules-check.mts)
npm run check:physics     # every legal placement has a legal shot (~5 min)
npm run smoke             # drives a real browser through a full turn
npm run check:scoring     # drives a real browser through a made shot and a steal
npm run check:title       # title screen fits every viewport without clipping
```

The browser tests need Chrome and a running `npm run dev`. They use `puppeteer-core`
against your system browser, so nothing is downloaded; override with
`CHROME_PATH=... npm run smoke` if needed. `tools/browser.mjs` holds the shared launcher.

- `npm run smoke` plays a turn through real mouse input — start, place bucket, place
  feather, aim, throw, resolve, advance — and fails on any console or page error.
- `npm run check:scoring` covers the path mouse input cannot reach reliably: it throws the
  solver's ideal shot to force a make, then checks the steal pass, that a steal transfers
  the point, that exactly one point is awarded, and that the last player to make it places
  next round. It drives the game through `window.__giitb`, a seam registered only under
  `import.meta.env.DEV` and absent from production bundles.

Worth noting: the solver's ideal shot goes in on the **first attempt** in the browser, which
confirms the headless harness and the in-game physics agree.

Two flakes worth remembering if you add browser tests:

- `waitUntil: 'networkidle0'` never settles against the dev server, because Vite keeps an
  HMR WebSocket open. Wait for real readiness signals instead (see `openGame`).
- Launching Chrome against its default profile races with any Chrome you already have open
  and intermittently fails with "Timed out waiting for the WS endpoint". Each run gets a
  throwaway `userDataDir`.

## How to play

2–10 players share one screen (hot seat). Enter names on the title card to start.

1. **Place** — the placing player drops the bucket in front of the wall, then the feather
   further back. The highlighted patch of ground shows where placement is legal; the bucket
   and feather need not line up.
2. **Aim** — move the mouse (or drag on touch) to set the angle. A dashed preview shows the
   predicted flight up to the wall strike; judging the final arc into the bucket is left to you.
3. **Throw** — hold to charge. The vertical power meter on the right sweeps up and back down
   by itself; release on the power you want. Timing the release is the core skill.
4. **Score** — the ball must contact the ground exactly once, then the wall exactly once,
   then settle in the bucket. The HUD shows `Ground → Wall → Bucket` live and marks the shot
   dead the instant the sequence is broken. The ball keeps bouncing, but it can no longer score.

### Controls

|  | Mouse | Touch |
| --- | --- | --- |
| Place bucket / feather | Move to position, click to confirm | Drag to position, lift to confirm |
| Aim | Move the mouse | Drag anywhere on the court |
| Throw | Hold left button, release on the power you want | Hold the **THROW** button, release on the power you want |

Sound effects are synthesised with WebAudio, so the game ships no audio files. The speaker
button top-right mutes them.

Touch controls appear automatically the first time a touch pointer is used, so hybrid
laptop/tablet devices work either way.

### Round structure

- The placing player sets the spot, then **everyone throws from it in seating order,
  looping as many laps as it takes, until somebody makes it**.
- The first player to make it holds the point. Every other player then gets exactly one
  throw to steal it.
- The **last player to make it** banks 1 point and places the bucket and feather next round.

Play is endless — the scoreboard just keeps running. The ★ marks who currently holds the
point in the round.

## Architecture

| File | Responsibility |
| --- | --- |
| `src/main.ts` | Bootstraps Rapier, owns input handling and the frame loop, drives phase transitions |
| `src/world.ts` | Three.js scene and the Rapier physics world, kept in lockstep |
| `src/predict.ts` | Cheap bounce-aware trajectory prediction for the aiming preview |
| `src/shot.ts` | Validates one throw against the ground → wall → bucket rule and decides when it resolves |
| `src/game.ts` | Turn order, stealing and scoring |
| `src/ui.ts` | DOM overlay: scoreboard, banner, live sequence, power bar, result panel |
| `src/constants.ts` | Tunable dimensions, physics limits and shared types |

### Physics notes

- **Rapier3D** runs at a fixed 120 Hz timestep with CCD enabled on the ball, so a fast-moving
  ball cannot tunnel through the thin bucket walls.
- The bucket is a compound body: a disc base plus 20 thin boxes arranged in a ring to
  approximate the curved shell.
- A make is detected geometrically rather than with a trigger volume — the ball must stay
  inside the bucket's cylinder for 0.5 s, so a ball that bounces straight back out does not
  count.
- Ground and wall contacts are read from Rapier collision events and fed to a small state
  machine, which is what makes "exactly once each, in order" enforceable.
- **Rolling resistance is conditional.** Heavy damping is switched in only when the ball is
  slow *and* on the ground, so a missed ball pulls up quickly without sapping throws in
  flight. Applying it globally silently cuts the ball's range and makes the game unwinnable.

## Physics validation

The strict rule — ground exactly once, wall exactly once, then the bucket with no further
ground contact — is a narrow target, so the constants are not guesswork. `tools/` contains a
headless harness that runs the same Rapier setup outside the browser:

```bash
node tools/validate.mjs      # every legal placement has a legal shot  (currently 17/17)
node tools/strict-zone.mjs   # maps which bucket/feather placements are solvable
node tools/power-range.mjs   # checks the useful band spans the whole power bar
node tools/window.mjs        # local aim-window hit rate around an ideal shot
```

`tools/solver.mjs` finds an ideal throw for a layout by compass search over
(yaw, pitch, power) against a continuous cost function. Seeds come from a sorted coarse
grid rather than random restarts, so it is **deterministic** — an earlier random
multi-start disagreed with itself between runs and was useless for validating constants.

Three findings from this harness shaped the design, and none was visible by eye:

1. Global linear damping added for rolling friction also sapped the ball mid-flight, so it
   could not reach the wall in one bounce. Every layout became unsolvable.
2. Placement had to be restricted. Outside `BUCKET_MIN_Z..BUCKET_MAX_Z` and the feather gap
   limits, no legal shot exists at all, so players could unknowingly set up an impossible
   round. The allowed zone is drawn on the ground during placement.
3. `MAX_YAW` had to be widened. Bucket and feather at opposite lateral extremes needs about
   36° of yaw, which was exactly the old limit, leaving diagonal placements unreachable.

Re-run `npm run check:physics` after changing any constant in `src/constants.ts` — it must
stay at 17/17.

## Tuning

Difficulty lives in `src/constants.ts`. The most useful knobs:

- `BUCKET_R` / `BUCKET_H` — bucket size
- `MIN_SPEED` / `MAX_SPEED` — the range the power meter maps onto
- `POWER_PERIOD` / `POWER_CURVE` in `src/main.ts` — how fast the meter sweeps, and how much
  it lingers over low power. `POWER_CURVE` shapes the meter's motion through time only, so
  changing it does not invalidate the physics validation
- `MAX_YAW`, `MIN_PITCH`, `MAX_PITCH` — how much aim freedom a player has
- `SETTLE_IN_BUCKET` — how long the ball must stay in to count
- `BUCKET_MIN_Z`, `BUCKET_MAX_Z`, `FEATHER_MIN_GAP`, `FEATHER_MAX_GAP` — the legal placement zone

Ball and surface restitution are set where the colliders are built in `src/world.ts`.

## Possible next steps

- Online multiplayer (the game state is already serialisable and deterministic-ish)
- Replay camera on a made shot
- Sound
