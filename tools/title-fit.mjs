import { launchBrowser, openGame } from './browser.mjs';

/** Checks the title screen never overflows horizontally at common viewport widths. */
const { browser, cleanup } = await launchBrowser();
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));

const SIZES = [
  [360, 780, 'small phone'],
  [390, 844, 'phone'],
  [768, 1024, 'tablet'],
  [1280, 800, 'laptop'],
  [1920, 1080, 'desktop'],
  [2560, 1440, 'wide']
];

await page.setViewport({ width: 1280, height: 800 });
await openGame(page);

let failed = 0;
for (const [w, h, label] of SIZES) {
  await page.setViewport({ width: w, height: h });
  await new Promise((r) => setTimeout(r, 350));
  const m = await page.evaluate(() => {
    const huge = document.querySelector('.title-huge');
    const card = document.querySelector('.modal-card');
    const btn = document.getElementById('start-game');
    return {
      docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      titleRight: Math.round(huge.getBoundingClientRect().right),
      titleLeft: Math.round(huge.getBoundingClientRect().left),
      titleFont: getComputedStyle(huge).fontSize,
      cardW: Math.round(card.getBoundingClientRect().width),
      btnVisible: btn.getBoundingClientRect().top < window.innerHeight
    };
  });
  const clipped = m.titleLeft < 0 || m.titleRight > w;
  const ok = m.docOverflow <= 0 && !clipped;
  if (!ok) failed++;
  console.log(
    `${ok ? 'OK  ' : 'FAIL'} ${label.padEnd(12)} ${String(w).padStart(4)}px  ` +
    `title ${m.titleFont.padStart(7)}  spans ${m.titleLeft}..${m.titleRight}  ` +
    `overflow=${m.docOverflow}  startVisible=${m.btnVisible}`
  );
}

console.log(`\n${failed ? `${failed} viewport(s) FAILED` : 'title fits every viewport'}`);
try { await browser.close(); } catch { /* ignore */ }
cleanup();
process.exit(failed ? 1 : 0);
