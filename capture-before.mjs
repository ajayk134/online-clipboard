import { chromium } from 'playwright';

const WIDTHS = [320, 375, 390, 768, 1024, 1440];
const HEIGHT = 900;
const BASE = 'http://127.0.0.1:3000';
const OUT = 'before';

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
  await page.waitForTimeout(800);
  const file = `${OUT}/${label}-${width}w.png`;
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  ${file}`);
}

async function ensureAuth() {
  const username = `testuser_${Date.now()}`;
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  
  const url = page.url();
  if (!url.includes('/login')) {
    console.log('  Already authenticated');
    return true;
  }
  
  // Click register tab
  await page.click('button[data-auth-tab="register"]');
  await page.waitForTimeout(300);
  
  // Fill register form (specific to #form-register)
  await page.fill('#form-register input#reg-username', username);
  await page.fill('#form-register input#reg-email', `${username}@example.com`);
  await page.fill('#form-register input#reg-password', 'TestPass123!');
  
  // Submit register form specifically
  await page.click('#form-register button.btn.primary[type="submit"]');
  await page.waitForTimeout(2000);
  
  // Should now be on main view
  await page.waitForTimeout(1000);
  const mainVisible = await page.locator('#view-main:not(.hidden)').count() > 0;
  console.log(`  Authenticated: ${mainVisible}`);
  return mainVisible;
}

async function createClips() {
  // Text clip
  await page.click('#btn-new');
  await page.waitForTimeout(800);
  await page.fill('#ed-title', 'Sample text clip');
  await page.fill('#ed-text', 'This is a sample text clip content for screenshot testing.');
  await page.click('#ed-save');
  await page.waitForTimeout(2000);
  
  // Code clip
  await page.click('#btn-new');
  await page.waitForTimeout(800);
  await page.click('button[data-tab="code"]');
  await page.waitForTimeout(300);
  await page.fill('#ed-title', 'Sample code snippet');
  await page.fill('#ed-code', 'function hello() {\n  console.log("Hello, World!");\n}');
  await page.click('#ed-save');
  await page.waitForTimeout(2000);
}

async function main() {
  console.log('Starting before-screenshot capture...\n');
  
  const authed = await ensureAuth();
  
  if (authed) {
    await createClips();
  }
  
  const paths = authed ? ['/'] : ['/login'];
  
  for (const path of paths) {
    const label = path === '/' ? 'main' : 'auth';
    for (const w of WIDTHS) {
      await snap(label, w, path);
    }
  }
  
  if (authed) {
    // User dropdown
    await page.click('#btn-user');
    await page.waitForTimeout(500);
    for (const w of WIDTHS) {
      await snap('user-dropdown-open', w);
    }
    await page.click('body');
    await page.waitForTimeout(300);
    
    // Editor modal
    await page.click('#btn-new');
    await page.waitForTimeout(1000);
    for (const w of WIDTHS) {
      await snap('editor-modal', w);
    }
    
    // Editor code tab
    await page.click('button[data-tab="code"]');
    await page.waitForTimeout(500);
    for (const w of WIDTHS) {
      await snap('editor-modal-code', w);
    }
    await page.click('#ed-cancel');
    await page.waitForTimeout(500);
    
    // Detail modal
    await page.click('.clip-card', { timeout: 5000 });
    await page.waitForTimeout(1000);
    for (const w of WIDTHS) {
      await snap('detail-modal', w);
    }
    
    // Share panel
    await page.click('#dt-share');
    await page.waitForTimeout(500);
    for (const w of WIDTHS) {
      await snap('detail-modal-share', w);
    }
    await page.click('.modal-close');
    await page.waitForTimeout(500);
    
    // Settings modal
    await page.click('#btn-user');
    await page.waitForTimeout(300);
    await page.click('button[data-action="settings"]');
    await page.waitForTimeout(500);
    for (const w of WIDTHS) {
      await snap('settings-modal', w);
    }
    await page.click('.modal-close');
    await page.waitForTimeout(300);
    
    // Sidebar drawer mobile
    await page.setViewportSize({ width: 375, height: HEIGHT });
    await page.waitForTimeout(300);
    await page.click('#btn-menu');
    await page.waitForTimeout(500);
    await snap('sidebar-drawer-mobile', 375);
    
    await page.setViewportSize({ width: 1440, height: HEIGHT });
  }
  
  console.log('\nBefore screenshots complete!');
  await browser.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
