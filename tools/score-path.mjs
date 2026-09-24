import { launchBrowser, openGame } from './browser.mjs';

/*
 * Verifies the scoring path end to end in a real browser: a made shot, the steal pass,
 * stealing transferring the point, the point award, and handover of placement.
 *
 * Mouse input cannot drive this reliably because power depends on release timing to within
 * about ±0.008, so it uses the dev-only window.__giitb seam (stripped from prod builds).
 */

const LAYOUT = { bx: 0, bz: 1.55, fx: 0, fz: 5.3 };
// Solver's ideal shot for LAYOUT (tools/ideal-shot.mjs).
const IDEAL = { yaw: -0.002973236221907199, pitch: 0.2551111111111111, power: 0.11843161111111111 };
const DUD = { yaw: 0.5, pitch: 1.0, power: 0.95 };

const { browser, cleanup } = await launchBrowser();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;

function check(label, ok) {
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${label}`);
  if (!ok) failures++;
}

/**
 * Plays one round: the placer throws the ideal shot, then each remaining player throws
 * whatever `stealShots` specifies. Returns the final game state.
 */
async function runRound(name, stealShots) {
  console.log(`\n${name}`);
  const errors = [];
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });

  const state = () => page.evaluate(() => window.__giitb.state());
  const shown = () => page.$eval('#result-panel', (el) => !el.classList.contains('hidden'));
  const text = () => page.evaluate(() => ({
    title: document.getElementById('result-title').textContent,
    detail: document.getElementById('result-detail').textContent
  }));
  const cont = async () => {
    if (await shown()) { await page.click('#result-next'); await sleep(450); }
  };

  async function throwAndResolve(shot) {
    await page.evaluate((s) => window.__giitb.throwExact(s.yaw, s.pitch, s.power), shot);
    for (let i = 0; i < 60; i++) {
      if (await shown()) return text();
      await sleep(300);
    }
    throw new Error('shot never resolved');
  }

  // networkidle0 is unreliable here: Vite's HMR WebSocket stays open, so "no network
  // activity" is never reliably reached and goto times out. Wait for real readiness signals.
  await openGame(page, { needSeam: true });
  await page.click('.player-count-btn[data-count="3"]');
  await page.click('#start-game');
  await sleep(600);

  await page.evaluate((l) => window.__giitb.setup(l.bx, l.bz, l.fx, l.fz), LAYOUT);
  await sleep(400);

  // Opening throw by the placer.
  const opener = await throwAndResolve(IDEAL);
  check('opening throw scores', opener.title.toLowerCase().includes('bucket'));
  let st = await state();
  const bucketLabel = await page.$eval('#seq-bucket', (element) => {
    const style = getComputedStyle(element);
    return {
      done: element.classList.contains('done'),
      animationName: style.animationName,
      backgroundColor: style.backgroundColor,
      textShadow: style.textShadow
    };
  });
  check('point holder set after the make', st.pointHolder === 'Player 1');
  check('steal phase begins', st.isStealPhase === true);
  check('BUCKET sequence label enters its confirmed state', bucketLabel.done);
  check(
    'BUCKET text uses the subtle glow animation',
    bucketLabel.animationName.includes('bucket-glow') && bucketLabel.textShadow !== 'none'
  );
  check(
    'BUCKET pill keeps a dark background instead of filling green',
    bucketLabel.backgroundColor.includes('13, 17, 23')
  );
  check('bucket interior glows after the settled score', st.bucketGlowing === true);
  check('settled ball is occluded by the bucket', st.ballVisible === false);
  await cont();

  // Steal pass.
  const holders = [];
  let taken = 0;
  let final = opener;
  let guard = 0;
  while (guard++ < 8) {
    st = await state();
    if (st.phase === 'placeBucket') break;
    if (st.phase !== 'aim') { await cont(); continue; }
    final = await throwAndResolve(stealShots[taken] ?? DUD);
    taken++;
    holders.push((await state()).pointHolder);
    await cont();
  }

  st = await state();
  console.log(`     steals taken: ${taken}, holder after each: ${holders.join(' -> ')}`);
  console.log(`     round end: "${final.title}" — ${final.detail}`);
  console.log(`     scores: ${st.scores.map((s) => `${s.name}=${s.score}`).join(' ')}`);

  check('every other player gets exactly one steal attempt', taken === 2);
  check(
    'exactly one point awarded for the round',
    st.scores.reduce((a, s) => a + s.score, 0) === 1
  );
  check('back to placement', st.phase === 'placeBucket');
  check('no console/page errors', errors.length === 0);
  errors.slice(0, 5).forEach((e) => console.log('       ' + e));

  return st;
}

// Scenario A: nobody steals, so the opener keeps the point.
const a = await runRound('Scenario A — opener makes it, both steals miss', [DUD, DUD]);
check('opener keeps the point', a.scores.find((s) => s.name === 'Player 1').score === 1);
check('opener places next round', a.placer === 'Player 1');

// Scenario B: Player 2 steals with the same shot, Player 3 misses.
const b = await runRound('Scenario B — Player 2 steals it', [IDEAL, DUD]);
check(
  'steal transfers the point to Player 2',
  b.scores.find((s) => s.name === 'Player 2').score === 1
);
check(
  'opener gets nothing after being stolen from',
  b.scores.find((s) => s.name === 'Player 1').score === 0
);
check('the last player to make it places next round', b.placer === 'Player 2');

// Puppeteer can throw during teardown when frames detach; the run is already finished
// by this point, so never let that turn a passing run into a failure.
try {
  await browser.close();
} catch {
  /* ignore teardown races */
}
cleanup();

console.log(`\n${failures ? `${failures} CHECK(S) FAILED` : 'all scoring-path checks passed'}`);
process.exit(failures ? 1 : 0);
