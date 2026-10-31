import { chromium } from 'playwright';

const WIDTHS = [320, 375, 390, 768, 1024, 1440];
const HEIGHT = 900;
const BASE = 'http://127.0.0.1:3000';
const OUT = 'after';

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium-browser',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});

const context = await browser.newContext({
  viewport: { width: 1440, height: HEIGHT },
  ignoreHTTPSErrors: true,
});

const page = await context.newPage();

async function snap(label, width, path = null) {
  await page.setViewportSize({ width, height: HEIGHT });
  if (path) await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const file = `${OUT}/${label}-${width}w.png`;
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  ${file}`);
}

async function ensureAuth() {
  const username = `testuser_${Date.now()}`;
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const url = page.url();
  if (!url.includes('/login')) { console.log('  Already authenticated'); return true; }
  await page.click('button[data-auth-tab="register"]');
  await page.waitForTimeout(250);
  await page.fill('#form-register input#reg-username', username);
  await page.fill('#form-register input#reg-email', `${username}@example.com`);
  await page.fill('#form-register input#reg-password', 'TestPass123!');
  await page.click('#form-register button.btn.primary[type="submit"]');
  await page.waitForTimeout(2000);
  const ok = await page.locator('#view-main:not(.hidden)').count() > 0;
  console.log(`  Authenticated: ${ok}`);
  return ok;
}

async function setTheme(theme) {
  await page.evaluate((t) => { localStorage.setItem('oc_theme', t); }, theme);
  await page.evaluate(() => document.documentElement.dataset.theme = localStorage.getItem('oc_theme'));
  await page.waitForTimeout(150);
}

async function createClips() {
  await page.click('#btn-new');
  await page.waitForTimeout(700);
  await page.fill('#ed-title', 'Sprint planning notes');
  await page.fill('#ed-text', 'Discussed Q4 roadmap, prioritized the sharing revamp and offline support. Follow up with design on the new navigation.');
  await page.click('#ed-save');
  await page.waitForTimeout(1500);

  await page.click('#btn-new');
  await page.waitForTimeout(700);
  await page.click('button[data-tab="code"]');
  await page.waitForTimeout(200);
  await page.fill('#ed-title', 'Debounce helper');
  await page.fill('#ed-code', 'export function debounce(fn, wait = 300) {\n  let t;\n  return (...args) => {\n    clearTimeout(t);\n    t = setTimeout(() => fn(...args), wait);\n  };\n}');
  await page.click('#ed-save');
  await page.waitForTimeout(1500);

  await page.click('#btn-new');
  await page.waitForTimeout(700);
  await page.click('button[data-tab="richtext"]');
  await page.waitForTimeout(400);
  await page.fill('#ed-title', 'Launch checklist');
  await page.evaluate(() => {
    const q = document.querySelector('.ql-editor');
    if (q) q.innerHTML = '<h2>Launch checklist</h2><ul><li>Final QA pass</li><li>Update changelog</li><li>Notify beta users</li></ul><p>Targeting <strong>Friday</strong> morning.</p>';
  });
  await page.click('#ed-save');
  await page.waitForTimeout(1500);
}

async function captureShare() {
  const sharePath = await page.evaluate(async () => {
    const token = localStorage.getItem('oc_token');
    const list = await fetch('/api/clips', { headers: { Authorization: 'Bearer ' + token } }).then((r) => r.json());
    const id = list.items[0].id;
    const res = await fetch(`/api/clips/${id}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ enabled: true }),
    });
    const data = await res.json();
    return data.shareUrl;
  });
  if (!sharePath) return;
  const anon = await browser.newContext({ viewport: { width: 1440, height: HEIGHT }, ignoreHTTPSErrors: true });
  const anonPage = await anon.newPage();
  for (const w of WIDTHS) {
    await anonPage.setViewportSize({ width: w, height: HEIGHT });
    await anonPage.goto(`${BASE}${sharePath}`, { waitUntil: 'networkidle' });
    await anonPage.waitForTimeout(700);
    const file = `${OUT}/share-view-${w}w.png`;
    await anonPage.screenshot({ path: file, fullPage: true });
    console.log(`  ${file}`);
  }
  await anon.close();
}

async function captureAuth() {
  const anon = await browser.newContext({ viewport: { width: 1440, height: HEIGHT }, ignoreHTTPSErrors: true });
  const anonPage = await anon.newPage();
  for (const w of WIDTHS) {
    await anonPage.setViewportSize({ width: w, height: HEIGHT });
    await anonPage.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await anonPage.waitForTimeout(500);
    const file = `${OUT}/auth-${w}w.png`;
    await anonPage.screenshot({ path: file, fullPage: true });
    console.log(`  ${file}`);
  }
  // register tab
  await anonPage.setViewportSize({ width: 390, height: HEIGHT });
  await anonPage.click('button[data-auth-tab="register"]');
  await anonPage.waitForTimeout(300);
  await anonPage.screenshot({ path: `${OUT}/auth-register-390w.png`, fullPage: true });
  await anon.close();
}

async function main() {
  console.log('Starting after-screenshot capture...\n');
  const authed = await ensureAuth();

  if (authed) {
    await setTheme('light');
    // empty state before creating clips
    for (const w of WIDTHS) await snap('empty-state', w);
    await createClips();

    for (const w of WIDTHS) await snap('main', w);

    // dark theme main
    await setTheme('dark');
    for (const w of WIDTHS) await snap('main-dark', w);
    await setTheme('light');

    // user dropdown
    await page.setViewportSize({ width: 1440, height: HEIGHT });
    await page.click('#btn-user');
    await page.waitForTimeout(300);
    for (const w of WIDTHS) await snap('user-dropdown-open', w);
    await page.click('body');
    await page.waitForTimeout(200);

    // editor modal
    await page.click('#btn-new');
    await page.waitForTimeout(700);
    for (const w of WIDTHS) await snap('editor-modal', w);
    await page.click('button[data-tab="code"]');
    await page.waitForTimeout(300);
    for (const w of WIDTHS) await snap('editor-modal-code', w);
    await page.click('#ed-cancel');
    await page.waitForTimeout(300);

    // detail modal
    await page.setViewportSize({ width: 1440, height: HEIGHT });
    await page.click('.clip-card', { timeout: 5000 });
    await page.waitForTimeout(700);
    for (const w of WIDTHS) await snap('detail-modal', w);
    await page.click('#dt-share');
    await page.waitForTimeout(400);
    for (const w of WIDTHS) await snap('detail-modal-share', w);
    await page.click('.modal-close');
    await page.waitForTimeout(300);

    // settings
    await page.click('#btn-user');
    await page.waitForTimeout(250);
    await page.click('button[data-action="settings"]');
    await page.waitForTimeout(400);
    for (const w of WIDTHS) await snap('settings-modal', w);
    await page.click('.modal-close');
    await page.waitForTimeout(200);

    // sidebar drawer
    await page.setViewportSize({ width: 375, height: HEIGHT });
    await page.waitForTimeout(200);
    await page.click('#btn-menu');
    await page.waitForTimeout(400);
    await snap('sidebar-drawer-mobile', 375);

    await captureShare();
  }

  await captureAuth();
  console.log('\nAfter screenshots complete!');
  await browser.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
