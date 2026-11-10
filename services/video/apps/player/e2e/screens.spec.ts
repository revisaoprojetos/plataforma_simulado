import { expect, Page, test } from '@playwright/test';

const SENHA = 'dev12345';

async function entrar(page: Page, email: string): Promise<void> {
  await page.goto('/#/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('link', { name: 'Meu progresso' })).toBeVisible();
}

const VTT = [
  'WEBVTT',
  '',
  '00:00:01.000 --> 00:00:04.000',
  'Primeira fala da legenda de teste.',
  '',
  '00:00:05.000 --> 00:00:08.000',
  'Segunda fala da legenda de teste.',
  '',
].join('\n');

// .srt: numeração, vírgula nos tempos e sem cabeçalho (o painel converte para WebVTT)
const SRT = [
  '1',
  '00:00:01,000 --> 00:00:04,000',
  'Primeira fala em SRT.',
  '',
  '2',
  '00:00:05,000 --> 00:00:08,000',
  'Segunda fala em SRT.',
  '',
].join('\r\n');

// O login é limitado a 30 por IP a cada 10 min: o professor entra uma vez e as telas dele reutilizam a página.
test.describe('telas de gestão e do aluno', () => {
  test.describe.configure({ mode: 'serial' });
  let prof: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({ baseURL: 'http://localhost:5173', locale: 'pt-BR' });
    prof = await context.newPage();
    await entrar(prof, 'professor@empresa-a.local');
  });

  test.afterAll(async () => {
    await prof.context().close();
  });
  test('professor: analytics do curso e progresso de um aluno', async () => {
    const page = prof;
    await page.goto('/#/');
    await page.getByRole('link', { name: 'Analytics' }).click();

    await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible();
    await expect(page.getByText('Alunos matriculados')).toBeVisible();
    await expect(page.getByRole('table').first()).toContainText('Aula 1');
    await expect(page.getByRole('button', { name: 'Exportar ranking (CSV)' })).toBeVisible();

    // detalhe de uma aula: curva de retenção e quedas
    await page.getByRole('button', { name: 'Detalhar Aula 1' }).click();
    await expect(page.getByRole('heading', { name: /Aula: Aula 1/ })).toBeVisible();
    await expect(page.getByText('Visualizações por dia')).toBeVisible();

    // por aluno: busca e progresso
    await page.getByLabel('Buscar aluno').fill('aluno@empresa-a');
    await page
      .getByRole('button', { name: /aluno@empresa-a\.local/ })
      .first()
      .click();
    await expect(page.getByText('Aulas concluídas')).toBeVisible();
    await expect(page.locator('.student progress').first()).toBeVisible();
  });

  test('aluno: tela simples com resumo, progresso e continuar assistindo', async ({ page }) => {
    await entrar(page, 'aluno@empresa-a.local');
    // aluno não vê as telas de gestão
    await expect(page.getByRole('link', { name: 'Analytics' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Biblioteca de vídeos' })).toHaveCount(0);

    await page.getByRole('link', { name: 'Meu progresso' }).click();
    await expect(page.getByRole('heading', { name: 'Meu progresso' })).toBeVisible();
    await expect(page.getByText('Aulas concluídas')).toBeVisible();
    await expect(page.locator('.student progress').first()).toBeVisible();

    // aluno que abre a rota de analytics por URL recebe o aviso, não dados
    await page.goto('/#/analytics');
    await expect(page.getByText('Somente professor ou administrador')).toBeVisible();
  });

  test('legendas: enviar .vtt e .srt, listar e excluir', async () => {
    const page = prof;
    await page.goto('/#/');
    await page.getByRole('link', { name: 'Biblioteca de vídeos' }).click();

    const row = page.locator('.lib-row', { hasText: 'Aula 1' }).first();
    await row.locator('summary').click();

    for (const [lang, name, body] of [
      ['fr', 'legenda.vtt', VTT],
      ['es', 'legenda.srt', SRT],
    ] as const) {
      await row.getByLabel('Idioma da legenda').fill(lang);
      await row.getByLabel('Arquivo de legenda').setInputFiles({
        name,
        mimeType: 'text/plain',
        buffer: Buffer.from(body),
      });
      await expect(row.getByRole('status')).toContainText(`Legenda ${lang} enviada`);
      await expect(row.locator('.sub-list')).toContainText(lang);
    }

    // limpeza: apaga as duas e confirma que saíram da lista
    for (const lang of ['fr', 'es']) {
      page.once('dialog', (d) => void d.accept());
      await row.getByRole('button', { name: `Excluir legenda ${lang}` }).click();
      await expect(row.getByRole('button', { name: `Excluir legenda ${lang}` })).toHaveCount(0);
    }
  });

  test('legenda inválida mostra o motivo e não grava', async () => {
    const page = prof;
    await page.goto('/#/');
    await page.getByRole('link', { name: 'Biblioteca de vídeos' }).click();
    const row = page.locator('.lib-row', { hasText: 'Aula 1' }).first();
    await row.locator('summary').click();

    await row.getByLabel('Idioma da legenda').fill('portugues-do-brasil');
    await row.getByLabel('Arquivo de legenda').setInputFiles({
      name: 'x.vtt',
      mimeType: 'text/plain',
      buffer: Buffer.from(VTT),
    });
    await expect(row.getByRole('status')).toContainText('Idioma inválido');

    await row.getByLabel('Idioma da legenda').fill('de');
    await row.getByLabel('Arquivo de legenda').setInputFiles({
      name: 'x.vtt',
      mimeType: 'text/plain',
      buffer: Buffer.from('isto não é WebVTT nenhum, só um texto qualquer sem tempos'),
    });
    await expect(row.getByRole('status')).toHaveClass(/error/);
    await expect(row.locator('.sub-list')).not.toContainText('de');
  });
});
