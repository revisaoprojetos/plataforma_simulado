import { defineConfig } from '@playwright/test';

/**
 * Teste em navegador real contra a stack local (docker compose up -d --build api worker).
 * Usa o Microsoft Edge instalado: o Chromium embutido do Playwright não decodifica H.264/AAC.
 * Em outras máquinas, troque `channel` por 'chrome'.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    locale: 'pt-BR',
    channel: 'msedge',
    headless: true,
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
