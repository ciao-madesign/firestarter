/** Aiuto con AI nell'interfaccia: finto servizio Gemini, nessuna chiamata esterna. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../src/server/app.ts';
import { MemoryStore } from '../../src/server/store.ts';

let srv: Server;
let fake: Server;
let browser: Browser;
let base = '';

beforeAll(async () => {
  fake = createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Spiegazione di prova in parole semplici.' }] } }] }));
    });
  });
  await new Promise<void>((r) => fake.listen(0, '127.0.0.1', r));
  const fakeUrl = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`;
  srv = createApp({ store: new MemoryStore(), singleUser: true, webRoot: 'dist/web', ai: { key: 'k-prova-123456', model: 'm', baseUrl: fakeUrl } });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/`;
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
  srv?.close();
  fake?.close();
});

describe('aiuto con AI', () => {
  it('compare nel tutor, va attivato, e produce una risposta etichettata', async () => {
    const page = await (await browser.newContext({ viewport: { width: 1360, height: 860 } })).newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base);
    await page.waitForSelector('.term-output');
    await page.getByRole('tab', { name: 'Chat' }).click();
    const toggle = page.locator('#ai-toggle');
    await toggle.waitFor();
    expect(await page.getByText('Spiega la lezione più semplice').count()).toBe(0); // prima dell'attivazione non ci sono i pulsanti
    await toggle.check();
    await page.getByRole('button', { name: 'Spiega la lezione più semplice' }).waitFor();
    // serve una lezione attiva: la si apre dalla scheda Istruzioni
    await page.getByRole('tab', { name: 'Istruzioni' }).click();
    await page.locator('details.module summary').first().click();
    await page.locator('.lesson-item').first().click();
    await page.getByRole('button', { name: /Non ho capito/ }).click();
    await page.getByText('Spiegazione di prova in parole semplici.').waitFor();
    expect(await page.getByText("Risposta generata da un'AI").count()).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
});
