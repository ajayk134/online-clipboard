import { chromium } from 'playwright';

const WIDTHS = [320, 375, 390, 768, 1024, 1440];
const HEIGHT = 900;
const BASE = 'http://127.0.0.1:3000';

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium-browser',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});

async function overflow(page, label, width) {
  const info = await page.evaluate(() => {
    const de = document.documentElement;
    return { scrollW: de.scrollWidth, clientW: de.clientWidth, bodyScrollW: document.body.scrollWidth };
  });
  const over = info.scrollW > info.clientW + 1;
  console.log(`${over ? 'OVERFLOW' : 'ok      '} ${label} @${width}  scrollW=${info.scrollW} clientW=${info.clientW}`);
  return over;
}

const ctx = await browser.newContext({ viewport: { width: 1440, height: HEIGHT }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();

const username = `ovf_${Date.now()}`;
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.click('button[data-auth-tab="register"]');
await page.fill('#reg-username', username);
await page.fill('#reg-email', `${username}@example.com`);
await page.fill('#reg-password', 'TestPass123!');
await page.click('#form-register button.btn.primary[type="submit"]');
await page.waitForTimeout(1800);

// create one clip
await page.click('#btn-new');
await page.waitForTimeout(600);
await page.fill('#ed-title', 'Overflow test clip');
await page.fill('#ed-text', 'A fairly long line of text to exercise wrapping in cards and detail views. '.repeat(4));
await page.click('#ed-save');
await page.waitForTimeout(1500);

let bad = 0;
for (const w of WIDTHS) {
  await page.setViewportSize({ width: w, height: HEIGHT });
  await page.waitForTimeout(250);
  bad += await overflow(page, 'main', w) ? 1 : 0;

  await page.click('#btn-user');
  await page.waitForTimeout(200);
  bad += await overflow(page, 'user-dropdown', w) ? 1 : 0;
  await page.click('body');
  await page.waitForTimeout(150);

  await page.click('.clip-card');
  await page.waitForTimeout(500);
  bad += await overflow(page, 'detail', w) ? 1 : 0;
  await page.click('#dt-share');
  await page.waitForTimeout(350);
  bad += await overflow(page, 'detail-share', w) ? 1 : 0;
  await page.click('.modal-close');
  await page.waitForTimeout(250);

  await page.evaluate(() => document.querySelector('#btn-new').click());
  await page.waitForTimeout(500);
  bad += await overflow(page, 'editor', w) ? 1 : 0;
  await page.evaluate(() => document.querySelector('#ed-cancel').click());
  await page.waitForTimeout(200);
}

// public share view
const sharePath = await page.evaluate(async () => {
  const token = localStorage.getItem('oc_token');
  const list = await fetch('/api/clips', { headers: { Authorization: 'Bearer ' + token } }).then((r) => r.json());
  const res = await fetch(`/api/clips/${list.items[0].id}/share`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ enabled: true }),
  });
  return (await res.json()).shareUrl;
});
const anon = await browser.newContext({ viewport: { width: 1440, height: HEIGHT }, ignoreHTTPSErrors: true });
const ap = await anon.newPage();
for (const w of WIDTHS) {
  await ap.setViewportSize({ width: w, height: HEIGHT });
  await ap.goto(`${BASE}${sharePath}`, { waitUntil: 'networkidle' });
  await ap.waitForTimeout(400);
  bad += await overflow(ap, 'share-view', w) ? 1 : 0;
}

// auth
for (const w of WIDTHS) {
  await ap.setViewportSize({ width: w, height: HEIGHT });
  await ap.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await ap.waitForTimeout(300);
  bad += await overflow(ap, 'auth', w) ? 1 : 0;
}

console.log(`\n${bad === 0 ? 'PASS: no horizontal overflow detected' : `FAIL: ${bad} overflow(s)`}`);
await browser.close();
process.exit(bad === 0 ? 0 : 1);
