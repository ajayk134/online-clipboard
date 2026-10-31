import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3000';
const HEIGHT = 900;
let failures = 0;
function check(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) failures++;
}

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium-browser',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: HEIGHT }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();

const username = `flow_${Date.now()}`;
const password = 'TestPass123!';
const newPassword = 'NewPass456!';

// --- Register ---
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.click('button[data-auth-tab="register"]');
await page.fill('#reg-username', username);
await page.fill('#reg-email', `${username}@example.com`);
await page.fill('#reg-password', password);
await page.click('#form-register button[type="submit"]');
await page.waitForTimeout(1800);
check('register redirects to app', await page.locator('#view-main:not(.hidden)').count() > 0);
check('empty state visible', await page.locator('#empty-state:not(.hidden)').count() > 0);

// --- Create clip ---
await page.click('#btn-new');
await page.waitForTimeout(500);
check('editor opens', await page.locator('.editor-body').count() > 0);
check('modal container focused', await page.evaluate(() => document.activeElement?.classList.contains('modal')));
await page.fill('#ed-title', 'Flow test clip');
await page.fill('#ed-text', 'Hello from the automated flow test. Searchable token: zanzibar.');
await page.fill('#ed-tags', 'work, test');
await page.click('#ed-save');
await page.waitForTimeout(1600);
check('clip appears in list', (await page.locator('.clip-card').count()) === 1);
check('clip title rendered', (await page.locator('.card-title').first().textContent()) === 'Flow test clip');
check('all-clips count is 1', (await page.locator('#count-all').textContent()).trim() === '1');

// --- Search ---
await page.fill('#search-input', 'zanzibar');
await page.waitForTimeout(700);
check('search finds clip', (await page.locator('.clip-card').count()) === 1);
await page.fill('#search-input', 'nonexistent-xyz');
await page.waitForTimeout(700);
check('search shows nothing-found', (await page.locator('#empty-state:not(.hidden)').count()) > 0);
await page.fill('#search-input', '');
await page.waitForTimeout(700);
check('clearing search restores list', (await page.locator('.clip-card').count()) === 1);

// --- Favorite toggle ---
await page.click('.clip-card [data-fav]');
await page.waitForTimeout(900);
check('favorite count updates', (await page.locator('#count-fav').textContent()).trim() === '1');
check('favorite button on', await page.locator('.clip-card [data-fav].on').count() === 1);

// --- Detail + edit ---
await page.click('.clip-card');
await page.waitForTimeout(700);
check('detail modal opens', await page.locator('.detail-body').count() > 0);
await page.click('#dt-edit');
await page.waitForTimeout(600);
check('edit reopens editor', await page.locator('.editor-body').count() > 0);
await page.fill('#ed-title', 'Flow test clip edited');
await page.click('#ed-save');
await page.waitForTimeout(1600);
check('edited title persists', (await page.locator('.card-title').first().textContent()) === 'Flow test clip edited');

// --- Modal stack: delete confirm, Escape closes only top ---
await page.click('.clip-card');
await page.waitForTimeout(600);
await page.click('#dt-edit');
await page.waitForTimeout(500);
await page.click('#ed-delete');
await page.waitForTimeout(400);
check('confirm dialog opens over editor', (await page.locator('.confirm-body').count()) === 1);
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
check('Escape closes only confirm', (await page.locator('.confirm-body').count()) === 0 && (await page.locator('.editor-body').count()) === 1);
await page.click('#ed-cancel');
await page.waitForTimeout(400);

// --- Share with password + one-time ---
await page.click('.clip-card');
await page.waitForTimeout(600);
await page.click('#dt-share');
await page.waitForTimeout(400);
await page.click('#sh-enable');
await page.waitForTimeout(900);
const shareLink = await page.locator('#detail-share input[readonly]').first().inputValue();
check('share link generated', /^\/s\/.+/.test(shareLink), shareLink);
await page.fill('#sh-pass', 'sharepass1');
await page.evaluate(() => { document.querySelector('#sh-onetime').checked = true; });
await page.click('#sh-apply');
await page.waitForTimeout(900);
const shareState = await page.evaluate(async () => {
  const t = localStorage.getItem('oc_token');
  const l = await fetch('/api/clips?sort=created', { headers: { Authorization: 'Bearer ' + t } }).then((r) => r.json());
  const id = l.items[0].id;
  return fetch('/api/clips/' + id, { headers: { Authorization: 'Bearer ' + t } }).then((r) => r.json());
});
check('share password + one-time applied', shareState.hasPassword === true && shareState.isOneTime === true,
  JSON.stringify({ hasPassword: shareState.hasPassword, isOneTime: shareState.isOneTime }));
await page.click('.modal-close');
await page.waitForTimeout(400);

// --- Public share view: password gate + one-time burn ---
const anon = await browser.newContext({ viewport: { width: 390, height: HEIGHT }, ignoreHTTPSErrors: true });
const ap = await anon.newPage();
await ap.goto(`${BASE}${shareLink}`, { waitUntil: 'networkidle' });
await ap.waitForTimeout(800);
check('share view shows password form', (await ap.locator('#share-pass-form').count()) === 1);
await ap.fill('#share-pass', 'wrongpass');
await ap.click('#share-pass-form button[type="submit"]');
await ap.waitForTimeout(900);
check('wrong password rejected', (await ap.locator('#share-pass-form').count()) === 1);
await ap.fill('#share-pass', 'sharepass1');
await ap.click('#share-pass-form button[type="submit"]');
await ap.waitForTimeout(900);
check('correct password reveals content', (await ap.locator('.shared-content').count()) === 1);
check('one-time notice shown', (await ap.locator('.share-notice.warn').count()) === 1);
await ap.reload({ waitUntil: 'networkidle' });
await ap.waitForTimeout(800);
check('one-time link burned after view', (await ap.locator('.share-notice.error').count()) >= 1);
await anon.close();

// --- Theme toggle persists ---
await page.click('#btn-theme');
await page.waitForTimeout(300);
const themeAfter = await page.evaluate(() => document.documentElement.dataset.theme);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const themeReload = await page.evaluate(() => document.documentElement.dataset.theme);
check('theme persists across reload', themeAfter === themeReload, `${themeAfter}/${themeReload}`);

// --- Settings: change password ---
await page.click('#btn-user');
await page.waitForTimeout(250);
await page.click('button[data-action="settings"]');
await page.waitForTimeout(500);
check('settings opens', (await page.locator('.settings-body').count()) === 1);
const inputs = page.locator('.settings-body input[type="password"]');
await inputs.nth(0).fill(password);
await inputs.nth(1).fill(newPassword);
await inputs.nth(2).fill(newPassword);
await page.click('#st-pass-form button[type="submit"]');
await page.waitForTimeout(1400);
check('password change closes settings', (await page.locator('.settings-body').count()) === 0);

// --- Logout + login with new password ---
await page.click('#btn-user');
await page.waitForTimeout(250);
await page.click('button[data-action="logout"]');
await page.waitForTimeout(900);
check('logout returns to auth', (await page.locator('#view-auth:not(.hidden)').count()) === 1);
await page.fill('#login-identifier', username);
await page.fill('#login-password', newPassword);
await page.click('#form-login button[type="submit"]');
await page.waitForTimeout(1600);
check('login with new password works', (await page.locator('#view-main:not(.hidden)').count()) === 1);

// --- Delete clip ---
await page.click('.clip-card');
await page.waitForTimeout(600);
await page.click('#dt-edit');
await page.waitForTimeout(500);
await page.click('#ed-delete');
await page.waitForTimeout(400);
await page.click('.confirm-body .btn.danger');
await page.waitForTimeout(1200);
check('clip deleted -> empty state', (await page.locator('#empty-state:not(.hidden)').count()) === 1);
check('all-clips count cleared', (await page.locator('#count-all').textContent()).trim() === '');

console.log(`\n${failures === 0 ? 'ALL FLOWS PASSED' : `${failures} FLOW(S) FAILED`}`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
