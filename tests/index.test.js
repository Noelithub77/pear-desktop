import path from 'node:path';
import process from 'node:process';

import { test, expect, _electron as electron } from '@playwright/test';

process.env.NODE_ENV = 'test';

const appPath = path.resolve(import.meta.dirname, '..');

test('Pear Desktop App - With default settings, app is launched and visible', async () => {
  const app = await electron.launch({
    cwd: appPath,
    args: [
      appPath,
      '--no-sandbox',
      '--disable-gpu',
      '--whitelisted-ips=',
      '--disable-dev-shm-usage',
    ],
  });

  const window = await app.firstWindow();

  const consentForm = await window.$(
    "form[action='https://consent.\u0079\u006f\u0075\u0074\u0075\u0062\u0065.com/save']",
  );
  if (consentForm) {
    await consentForm.click('button');
  }

  // const title = await window.title();
  // expect(title.replaceAll(/\s/g, ' ')).toEqual('Pear Desktop');

  const url = window.url();
  expect(
    url.startsWith(
      'https://music.\u0079\u006f\u0075\u0074\u0075\u0062\u0065.com',
    ),
  ).toBe(true);

  await app.close();
});

test('Alt shortcuts navigate between history, global charts and home', async () => {
  const app = await electron.launch({
    cwd: appPath,
    // NODE_ENV=test sandboxes the preload, which stops renderer plugins loading.
    env: { ...process.env, NODE_ENV: 'production' },
    args: [
      appPath,
      '--no-sandbox',
      '--disable-gpu',
      '--whitelisted-ips=',
      '--disable-dev-shm-usage',
    ],
  });

  const window = await app.firstWindow();
  await window.waitForSelector('ytmusic-app ytmusic-browse-response', {
    state: 'attached',
  });

  // Polled because plugins start after the page first renders.
  const pressUntil = (key, url) =>
    expect(async () => {
      await window.keyboard.press(key);
      await window.waitForURL(url, { timeout: 3000, waitUntil: 'commit' });
    }).toPass({ timeout: 30000 });

  await pressUntil('Alt+h', /\/history$/);

  await pressUntil('Alt+g', /\/charts$/);
  // The picker only exposes its label; `ZZ` is labelled "Global" in English.
  await expect(
    window.locator('ytmusic-sort-filter-button-renderer').first(),
  ).toHaveText(/Global/);

  await pressUntil('Alt+Escape', /\.com\/$/);

  // By now the shortcut pages are prefetched, so they open without a page request.
  await window.evaluate(() => {
    const inner = window.fetch;
    globalThis.browseSources = [];
    window.fetch = async (input, init) => {
      const response = await inner(input, init);
      if (input instanceof Request && input.url.includes('/youtubei/v1/browse')) {
        // A response built in memory has no URL.
        globalThis.browseSources.push(response.url === '' ? 'memory' : 'network');
      }
      return response;
    };
  });
  await pressUntil('Alt+g', /\/charts$/);
  expect(await window.evaluate(() => globalThis.browseSources)).toEqual([
    'memory',
  ]);

  await app.close();
});
