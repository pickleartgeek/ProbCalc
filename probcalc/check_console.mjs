import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
const consoleMsgs = [];
page.on('console', msg => consoleMsgs.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', err => errors.push(err.message + '\n' + err.stack));
page.on('requestfailed', req => errors.push(`REQUEST FAILED: ${req.url()} - ${req.failure()?.errorText}`));
page.on('response', res => { if (res.status() >= 400) errors.push(`HTTP ${res.status()}: ${res.url()}`); });

await page.goto('http://127.0.0.1:8080/probcalc-engine/', { waitUntil: 'networkidle', timeout: 20000 }).catch(e => errors.push('goto error: ' + e.message));
await page.waitForTimeout(2000);

const bodyText = await page.evaluate(() => document.getElementById('root')?.innerHTML.slice(0, 500));
console.log('=== ROOT INNER HTML (first 500 chars) ===');
console.log(bodyText);
console.log('=== CONSOLE MESSAGES ===');
consoleMsgs.forEach(m => console.log(m));
console.log('=== ERRORS ===');
errors.forEach(e => console.log(e));

await browser.close();
