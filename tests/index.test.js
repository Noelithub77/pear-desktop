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

test('Alt shortcuts and Ctrl+Tab switch between preloaded tabs', async () => {
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

  const selected = window.locator('.pear-tab[aria-selected="true"]');
  const shown = window.locator('.pear-tab-view:not([hidden])');
  const expectTab = async (label) => {
    await expect(selected).toHaveText(label, { timeout: 1000 });
    await expect(shown).toHaveCount(1, { timeout: 1000 });
  };

  // Polled because the tabs open only once their pages are fetched.
  await expect(async () => {
    await window.keyboard.press('Alt+h');
    await expectTab('History');
  }).toPass({ timeout: 30000 });
  const url = window.url();

  await window.keyboard.press('Alt+g');
  await expectTab('Charts');
  // The picker only exposes its label; `ZZ` is labelled "Global" in English.
  await expect(
    shown.locator('ytmusic-sort-filter-button-renderer').first(),
  ).toHaveText(/Global/);

  await window.keyboard.press('Control+Tab');
  await expectTab('Home');
  await window.keyboard.press('Control+Shift+Tab');
  await expectTab('Charts');
  await window.keyboard.press('Alt+Escape');
  await expectTab('Home');
  // Switching shows a page that is already drawn instead of loading one.
  expect(window.url()).toBe(url);

  // Opening any other page hands the view back to the site.
  await window.evaluate(() =>
    document.querySelector('ytmusic-app').dispatchEvent(
      new CustomEvent('yt-navigate', {
        bubbles: true,
        composed: true,
        detail: { endpoint: { browseEndpoint: { browseId: 'FEmusic_explore' } } },
      }),
    ),
  );
  await window.waitForURL(/\/explore$/);
  await expect(shown).toHaveCount(0);
  await expect(selected).toHaveCount(0);

  await app.close();
});
