import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../../src/server/app.ts';
import { MemoryStore } from '../../src/server/store.ts';

let srv: Server; let browser: Browser; let base = '';
beforeAll(async () => {
  srv = createApp({ store: new MemoryStore(), singleUser: true, webRoot: 'dist/web' });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/`;
  browser = await chromium.launch();
});
afterAll(async () => { await browser?.close(); srv?.close(); });

describe('terminale separato per shell', () => {
  it('cambiando shell la finestra mostra solo i comandi di quella shell', async () => {
    const page = await (await browser.newContext({ viewport: { width: 1360, height: 860 } })).newPage();
    await page.goto(base);
    await page.waitForSelector('.term-output');
    const input = page.locator('.term-input textarea, .term-input input').first();
    const run = async (c: string) => { await input.fill(c); await input.press('Enter'); await page.waitForTimeout(250); };
    await run('echo SOLO-BASH');
    await page.locator('.seg-btn').nth(1).click();
    await page.waitForTimeout(400);
    const pw = await page.locator('.term-output').innerText();
    await run('echo SOLO-PWSH');
    const pw2 = await page.locator('.term-output').innerText();
    await page.locator('.seg-btn').nth(0).click();
    await page.waitForTimeout(400);
    const bash2 = await page.locator('.term-output').innerText();
    await page.reload();
    await page.waitForSelector('.term-output');
    await page.waitForTimeout(500);
    const afterReload = await page.locator('.term-output').innerText();
    const pressed = await page.locator('.seg-btn').evaluateAll((els) => els.map((e) => e.getAttribute('aria-pressed')));
    expect(pw).not.toContain('SOLO-BASH');
    expect(pw2).not.toContain('SOLO-BASH');
    expect(bash2).not.toContain('SOLO-PWSH');
    // finestre distinte: titolo e colori propri
    expect(await page.locator('.pane-terminal').getAttribute('data-shell')).toBe('bash');
    expect(await page.locator('.term-title').innerText()).toBe('Bash');
    await page.locator('.seg-btn').nth(1).click();
    await page.waitForTimeout(300);
    expect(await page.locator('.pane-terminal').getAttribute('data-shell')).toBe('pwsh');
    expect(await page.locator('.term-title').innerText()).toBe('Windows PowerShell 5.1');
    await page.screenshot({ path: '/tmp/claude-0/-home-user/1548879b-caea-5407-a93b-b3e06081e602/scratchpad/pwsh.png' });
    await page.locator('.seg-btn').nth(0).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: '/tmp/claude-0/-home-user/1548879b-caea-5407-a93b-b3e06081e602/scratchpad/bash.png' });
  });
});
