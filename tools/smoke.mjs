import { launchBrowser, openGame } from './browser.mjs';

const errors = [];
const logs = [];

const { browser, cleanup } = await launchBrowser();

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on('console', (m) => {
  const t = `${m.type()}: ${m.text()}`;
  logs.push(t);
  if (m.type() === 'error') errors.push(`CONSOLE ${t}`);
});

await openGame(page);

const step = async (label, fn) => {
  const before = errors.length;
  await fn();
  await new Promise((r) => setTimeout(r, 900));
  console.log(`${errors.length === before ? 'OK  ' : 'FAIL'} ${label}`);
};

// 1. Start a 3-player game.
await step('start game (3 players)', async () => {
  await page.click('.player-count-btn[data-count="3"]');
  await page.click('#start-game');
});

const phaseText = () => page.$eval('#banner-instruction', (el) => el.textContent);
console.log('     banner:', await phaseText());

// 2. Place the bucket: move then click.
await step('place bucket', async () => {
  await page.mouse.move(640, 480);
  await page.mouse.move(640, 470);
  await page.mouse.down();
  await page.mouse.up();
});
console.log('     banner:', await phaseText());

// 3. Place the feather.
await step('place feather', async () => {
  await page.mouse.move(640, 600);
  await page.mouse.move(640, 610);
  await page.mouse.down();
  await page.mouse.up();
});
console.log('     banner:', await phaseText());

// 4. Aim and throw: hold to charge, release.
await step('aim + throw', async () => {
  await page.mouse.move(640, 300);
  await page.mouse.down();
  await new Promise((r) => setTimeout(r, 400));
  await page.mouse.up();
});

// 5. Let the ball resolve.
await step('ball resolves', async () => {
  for (let i = 0; i < 40; i++) {
    const visible = await page.$eval('#result-panel', (el) => !el.classList.contains('hidden'));
    if (visible) break;
    await new Promise((r) => setTimeout(r, 400));
  }
});

const resolved = await page.$eval('#result-panel', (el) => !el.classList.contains('hidden'));
const title = await page.$eval('#result-title', (el) => el.textContent);
const detail = await page.$eval('#result-detail', (el) => el.textContent);
console.log(`     resolved=${resolved}  title="${title}"  detail="${detail}"`);

// 6. Continue to the next player and confirm the turn advanced.
await step('continue to next player', async () => { await page.click('#result-next'); });
const banner2 = await page.$eval('#banner-player', (el) => el.textContent);
console.log('     next player:', banner2);

// 7. Scoreboard renders all 3 players.
const rows = await page.$$eval('#scoreboard .score-row', (els) => els.length);
console.log(`     scoreboard rows: ${rows}`);

try {
  await browser.close();
} catch {
  /* ignore teardown races */
}
cleanup();

console.log(`\nerrors: ${errors.length}`);
errors.slice(0, 12).forEach((e) => console.log('  ' + e));
process.exit(errors.length ? 1 : 0);
