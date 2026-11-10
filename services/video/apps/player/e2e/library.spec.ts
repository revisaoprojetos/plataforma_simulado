import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const VIDEO = fileURLToPath(new URL('./fixtures/teste-20s.mp4', import.meta.url));

test('biblioteca: criar aula, enviar vídeo, esperar o processamento e assistir', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const title = `Aula enviada pela biblioteca ${Date.now()}`;

  await page.goto('/#/login');
  await page.getByLabel('E-mail').fill('professor@empresa-a.local');
  await page.getByLabel('Senha').fill('dev12345');
  await page.getByRole('button', { name: 'Entrar' }).click();

  await page.getByRole('link', { name: /Biblioteca de vídeos/ }).click();
  await expect(page.getByRole('heading', { name: 'Biblioteca de vídeos' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Swagger' })).toHaveAttribute('href', /\/docs$/);

  // cria a aula no primeiro módulo
  await page.getByLabel('Título da nova aula').first().fill(title);
  await page.getByRole('button', { name: '+ Nova aula' }).first().click();
  const row = page.locator('.lib-row', { hasText: title });
  await expect(row).toBeVisible();
  await expect(row.locator('.badge')).toHaveText('Sem vídeo');

  // envia: o input de arquivo é escondido atrás do botão
  await row.getByLabel('Escolher vídeo').setInputFiles(VIDEO);
  await expect(row.locator('.badge')).toHaveText(/Enviando|Na fila|Processando|Pronto/);

  // o worker converte para HLS
  await expect(row.locator('.badge')).toHaveText('Pronto', { timeout: 180_000 });
  await expect(row).toContainText('teste-20s.mp4');

  // assistir
  const href = (await row.getByRole('link', { name: /Assistir/ }).getAttribute('href')) ?? '';
  const lessonId = /lesson\/([0-9a-f-]{36})/.exec(href)?.[1] ?? '';
  expect(lessonId).not.toBe('');
  await row.getByRole('link', { name: /Assistir/ }).click();
  await expect(page.locator('video')).toBeVisible();
  await page.getByRole('button', { name: 'Reproduzir' }).click();
  await expect
    .poll(() => page.evaluate(() => document.querySelector('video')?.currentTime ?? 0), {
      timeout: 60_000,
    })
    .toBeGreaterThan(1);

  // limpeza: volta à biblioteca e apaga o vídeo e a aula criados
  await page.goto('/#/library');
  const again = page.locator('.lib-row', { hasText: title });
  page.once('dialog', (d) => void d.accept());
  await again.getByRole('button', { name: 'Excluir vídeo' }).click();
  await expect(again.locator('.badge')).toHaveText('Sem vídeo');

  // a aula criada pelo teste também sai (não há botão de excluir aula na tela)
  await page.evaluate(async (id) => {
    const { accessToken } = JSON.parse(sessionStorage.getItem('gv.auth') ?? '{}');
    await fetch('http://localhost:3010/v1/lessons/' + id, {
      method: 'DELETE',
      headers: { authorization: 'Bearer ' + accessToken },
    });
  }, lessonId);
});
