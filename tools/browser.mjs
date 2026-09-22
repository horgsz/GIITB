import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5173/';

/**
 * Launches the system Chrome for tests.
 *
 * Uses a throwaway profile directory: sharing the default profile with a Chrome the user
 * already has open causes intermittent "Timed out waiting for the WS endpoint" failures
 * from profile-lock contention.
 */
export async function launchBrowser() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'giitb-chrome-'));
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    userDataDir,
    timeout: 60000,
    protocolTimeout: 120000,
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-default-browser-check'
    ]
  });

  const cleanup = () => {
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  };
  return { browser, cleanup };
}

/**
 * Navigates and waits for the game to be interactive. networkidle0 is unreliable here
 * because Vite's HMR WebSocket stays open, so navigation never settles.
 */
export async function openGame(page, { needSeam = false } = {}) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#start-game', { timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('#scene')?.clientWidth > 0, {
    timeout: 30000
  });
  if (needSeam) {
    await page.waitForFunction(() => typeof window.__giitb === 'object', { timeout: 30000 });
  }
  await new Promise((r) => setTimeout(r, 1200));
}
