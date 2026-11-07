import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const url = 'https://eskiya771.github.io/mevicar-cockpit-demo/';
const profiles = [
  { name: 'iphone17-landscape', width: 874, height: 402 },
  { name: 's20fe-landscape', width: 915, height: 412 },
  { name: 'panorama', width: 1920, height: 720 },
  { name: 'fullhd', width: 1920, height: 1080 },
];
await mkdir('visual-results', { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = [];
let failures = 0;
try {
  for (const profile of profiles) {
    const context = await browser.newContext({
      viewport: { width: profile.width, height: profile.height },
      deviceScaleFactor: 1,
      isMobile: profile.width < 1000,
      hasTouch: true,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `visual-results/${profile.name}.png`, fullPage: false });
      const metrics = await page.evaluate(() => {
        const rect = selector => {
          const element = document.querySelector(selector);
          if (!element) return null;
          const r = element.getBoundingClientRect();
          return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) };
        };
        const buttons = [...document.querySelectorAll('button')].filter(e => {
          const r = e.getBoundingClientRect();
          const s = getComputedStyle(e);
          return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
        });
        return {
          viewport: { width: innerWidth, height: innerHeight },
          document: { scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight },
          shell: rect('.shell'), cockpit: rect('.cockpit'), map: rect('.cockpit .map'),
          status: rect('.cockpit .status'), dock: rect('.cockpit .dock.left'),
          buttons: buttons.length,
          clippedButtons: buttons.filter(e => {
            const r = e.getBoundingClientRect();
            return r.right > innerWidth + 1 || r.bottom > innerHeight + 1 || r.left < -1 || r.top < -1;
          }).slice(0, 12).map(e => e.textContent.trim().slice(0, 40))
        };
      });
      const issues = [];
      if (metrics.document.scrollWidth > metrics.viewport.width + 1) issues.push('Horizontal overflow');
      if (metrics.document.scrollHeight > metrics.viewport.height + 1) issues.push('Vertical overflow');
      if (!metrics.map) issues.push('Map missing');
      if (metrics.clippedButtons.length) issues.push('Buttons outside viewport');
      if (errors.length) issues.push('JavaScript errors');
      if (issues.length) failures++;
      report.push({ profile: profile.name, metrics, errors, issues });
    } catch (e) {
      failures++;
      report.push({ profile: profile.name, issues: [String(e)] });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
await writeFile('visual-results/report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (failures) process.exitCode = 1;
