/**
 * Test dell'interfaccia nel browser (Chromium). Richiedono `npm run build:web` e un Chromium installato
 * (`npx playwright install chromium`). Si eseguono con `npm run test:ui`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../../src/server/app.ts';
import { MemoryStore } from '../../src/server/store.ts';

let srv: Server;
let browser: Browser;
let base = '';

beforeAll(async () => {
  srv = createApp({ store: new MemoryStore(), singleUser: true, webRoot: 'dist/web' });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/`;
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
  srv?.close();
});

async function open(width = 1360, height = 860): Promise<{ page: Page; errors: string[] }> {
  const page = await (await browser.newContext({ viewport: { width, height } })).newPage();
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  await page.goto(base);
  await page.waitForSelector('.term-output');
  return { page, errors };
}

async function run(page: Page, cmd: string): Promise<void> {
  const input = page.locator('.term-input textarea, .term-input input').first();
  await input.fill(cmd);
  await input.press('Enter');
  await page.waitForTimeout(250);
}

describe('interfaccia', () => {
  it('mostra il badge di ambiente simulato e il terminale', async () => {
    const { page, errors } = await open();
    expect(await page.locator('body').innerText()).toContain('AMBIENTE SIMULATO');
    await run(page, 'echo ciao');
    expect(await page.locator('.term-output').innerText()).toContain('ciao');
    expect(errors).toEqual([]);
  });

  it('esegue un comando PowerShell dopo il cambio di shell', async () => {
    const { page, errors } = await open();
    await page.getByRole('button', { name: /PowerShell/ }).first().click();
    await run(page, 'Write-Output "da-ps"');
    expect(await page.locator('.term-output').innerText()).toContain('da-ps');
    expect(errors).toEqual([]);
  });

  it('lezione: la verifica a vuoto non risulta superata', async () => {
    const { page, errors } = await open();
    await page.locator('details.module summary').first().click();
    await page.getByRole('button', { name: /M1\.L1/ }).click();
    await page.waitForSelector('.lesson-head');
    await page.getByRole('button', { name: /Verifica/ }).first().click();
    await page.waitForTimeout(400);
    expect(await page.locator('body').innerText()).not.toContain('Superata');
    expect(errors).toEqual([]);
  });

  it('documentazione: la scheda si apre senza errori', async () => {
    const { page, errors } = await open();
    await page.getByRole('tab', { name: 'Documentazione' }).click();
    await page.getByRole('button', { name: 'Nuovo file' }).waitFor();
    expect(errors).toEqual([]);
  });

  it('mobile: nessuno scorrimento orizzontale', async () => {
    const { page, errors } = await open(390, 800);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);
    expect(errors).toEqual([]);
  });
});
