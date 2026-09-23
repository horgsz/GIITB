import { launchBrowser, openGame } from './browser.mjs';

const { browser, cleanup } = await launchBrowser();
const page = await browser.newPage();
await page.setViewport({
  width: 393,
  height: 852,
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true
});

const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

await openGame(page, { needSeam: true });

const selector = await page.evaluate(() => {
  const buttons = [...document.querySelectorAll('.player-count-btn')];
  const tops = buttons.map((button) => Math.round(button.getBoundingClientRect().top));
  return {
    count: buttons.length,
    rows: new Set(tops).size,
    withinViewport: buttons.every((button) => {
      const rect = button.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= window.innerWidth;
    })
  };
});

let failed = 0;
const check = (label, result) => {
  console.log(`${result ? 'OK  ' : 'FAIL'} ${label}`);
  if (!result) failed++;
};

check('player selector has buttons 1 through 8', selector.count === 8);
check('all player buttons are on one horizontal row', selector.rows === 1);
check('player buttons fit the iPhone viewport', selector.withinViewport);

// Select solo through the actual visible control.
await page.click('.player-count-btn[data-count="1"]');
check(
  'solo selection renders one name input',
  (await page.$$('#name-list input')).length === 1
);

// Use eight players to exercise the busiest possible in-game HUD.
await page.click('.player-count-btn[data-count="8"]');
check(
  'eight-player selection renders eight name inputs',
  (await page.$$('#name-list input')).length === 8
);
await page.click('#start-game');
await new Promise((resolve) => setTimeout(resolve, 500));
const placementState = await page.evaluate(() => window.__giitb.state());
check('bucket is visible before the first mobile drag', placementState.bucketVisible);
check(
  'bucket ghost starts inside the legal placement zone',
  placementState.bucketPosition[2] >= 0.6 && placementState.bucketPosition[2] <= 2.5
);
await page.evaluate(() => window.__giitb.setup(0, 1.55, 0, 5.3));
await new Promise((resolve) => setTimeout(resolve, 1000));

const layout = await page.evaluate(() => {
  const rect = (selector) => {
    const r = document.querySelector(selector).getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  };
  const overlaps = (a, b) =>
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

  const scoreboard = rect('#scoreboard');
  const mute = rect('#mute-btn');
  const banner = rect('#banner');
  const power = rect('#power-wrap');
  const throwButton = rect('#throw-btn');

  return {
    scoreboardMute: overlaps(scoreboard, mute),
    scoreboardBanner: overlaps(scoreboard, banner),
    muteBanner: overlaps(mute, banner),
    powerThrow: overlaps(power, throwButton),
    inside: [scoreboard, mute, banner, power, throwButton].every(
      (r) => r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight
    ),
    scoreboardHeight: scoreboard.bottom - scoreboard.top
  };
});

check('scoreboard does not overlap mute', !layout.scoreboardMute);
check('scoreboard does not overlap instructions', !layout.scoreboardBanner);
check('mute does not overlap instructions', !layout.muteBanner);
check('power meter does not overlap throw button', !layout.powerThrow);
check('all HUD controls remain inside the viewport', layout.inside);
check('eight-player scoreboard stays a compact strip', layout.scoreboardHeight < 60);
check('no browser errors', errors.length === 0);

console.log(`\n${failed ? `${failed} mobile check(s) failed` : 'mobile layout passes'}`);

try {
  await browser.close();
} catch {
  // Ignore Chrome teardown races after results are collected.
}
cleanup();
process.exit(failed ? 1 : 0);
