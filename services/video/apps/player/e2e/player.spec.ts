import { expect, Page, test } from '@playwright/test';

const API = process.env.API_URL ?? 'http://localhost:3010/v1';
const TENANT = 'empresa-a';
const PASSWORD = 'senha-forte-1';
const ORIGIN = 'http://localhost:5173';

const VTT = (words: string[]) =>
  [
    'WEBVTT',
    '',
    ...words.flatMap((w, i) => [
      `00:00:${String(i * 5).padStart(2, '0')}.000 --> 00:00:${String(i * 5 + 5).padStart(2, '0')}.000`,
      w,
      '',
    ]),
  ].join('\n');

async function call<T>(
  path: string,
  token: string | null,
  method = 'GET',
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      origin: ORIGIN,
      ...(token && { authorization: `Bearer ${token}` }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

const login = (email: string, password: string) =>
  call<{ accessToken: string }>('/auth/login', null, 'POST', {
    tenant: TENANT,
    email,
    password,
  }).then((r) => r.accessToken);

interface Fixture {
  email: string;
  userId: string;
  courseId: string;
  courseTitle: string;
  lessonId: string;
  lessonTitle: string;
}

/** Cria um aluno novo (progresso limpo), matricula e prepara legendas/capítulos na aula que tem vídeo. */
async function prepare(): Promise<Fixture> {
  const admin = await login('admin@empresa-a.local', 'dev12345');
  const prof = await login('professor@empresa-a.local', 'dev12345');

  const email = `aluno.${Date.now()}@empresa-a.local`;
  const user = await call<{ id: string }>('/users', admin, 'POST', {
    email,
    name: 'Aluno Teste',
    password: PASSWORD,
    role: 'aluno',
  });
  const courses = await call<{ data: { id: string; title: string }[] }>('/courses', prof);
  const course = courses.data[0];
  await call(`/courses/${course.id}/enrollments`, prof, 'POST', { userId: user.id });

  const modules = await call<
    { lessons: { id: string; title: string; videoId: string | null }[] }[]
  >(`/courses/${course.id}/modules`, prof);
  const lesson = modules.flatMap((m) => m.lessons).find((l) => l.videoId);
  if (!lesson)
    throw new Error('nenhuma aula com vídeo: rode npm run upload:sample -w apps/api -- video.mp4');

  await call(`/lessons/${lesson.id}/subtitles`, prof, 'POST', {
    lang: 'pt-BR',
    content: VTT([
      'Boas-vindas à aula',
      'Primeiro conceito importante',
      'Segundo conceito importante',
      'Resumo e encerramento',
    ]),
  });
  await call(`/lessons/${lesson.id}/subtitles`, prof, 'POST', {
    lang: 'en',
    content: VTT([
      'Welcome to the class',
      'First key concept',
      'Second key concept',
      'Summary and wrap-up',
    ]),
  });
  await call(`/lessons/${lesson.id}/chapters`, prof, 'PUT', {
    chapters: [
      { startS: 0, title: 'Introdução' },
      { startS: 10, title: 'Desenvolvimento' },
    ],
  });
  return {
    email,
    userId: user.id,
    courseId: course.id,
    courseTitle: course.title,
    lessonId: lesson.id,
    lessonTitle: lesson.title,
  };
}

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/#/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Meus cursos' })).toBeVisible();
}

const video = (page: Page) => page.locator('video');
const time = (page: Page) => video(page).evaluate((v: HTMLVideoElement) => v.currentTime);

async function openMenu(page: Page, button: string, option: string): Promise<void> {
  await page.getByRole('button', { name: button, exact: true }).click();
  await page.getByRole('menuitemradio', { name: option, exact: true }).click();
}

test.describe('player de referência (navegador real)', () => {
  let fx: Fixture;
  test.beforeAll(async () => {
    fx = await prepare();
  });

  test('assiste, usa todos os controles e o progresso é registrado e retomado', async ({
    page,
  }) => {
    await signIn(page, fx.email);
    await page.getByRole('link', { name: fx.courseTitle }).click();
    await page.getByRole('link', { name: fx.lessonTitle }).click();

    // carrega e toca de verdade (frames decodificados, não só a UI)
    await expect(page.getByLabel('Vídeo da aula')).toBeVisible();
    await page.getByRole('button', { name: 'Reproduzir' }).click();
    await page.waitForFunction(() => {
      const v = document.querySelector('video')!;
      return v.currentTime > 2 && v.videoWidth > 0 && !v.paused;
    });
    await page.getByRole('button', { name: 'Pausar' }).click();

    // marca d'água do aluno
    await expect(page.locator('.watermark')).toHaveText(/Aluno Teste · a\*\*\*@empresa-a\.local/);

    // velocidade
    await openMenu(page, 'Velocidade', '1.5×');
    expect(await video(page).evaluate((v: HTMLVideoElement) => v.playbackRate)).toBe(1.5);
    await expect(page.getByRole('button', { name: 'Velocidade' })).toHaveText('1.5×');

    // qualidade: todas as opções da escada e troca manual
    await page.getByRole('button', { name: 'Qualidade', exact: true }).click();
    const options = await page.getByRole('menuitemradio').allTextContents();
    expect(options).toEqual(['Auto', '720p', '480p', '360p', '240p']);
    await page.getByRole('menuitemradio', { name: '240p', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Qualidade', exact: true })).toHaveText('240p');

    // legendas
    await openMenu(page, 'Legendas', 'pt-BR');
    await expect
      .poll(() =>
        video(page).evaluate((v: HTMLVideoElement) => {
          const t = v.textTracks[0];
          return t ? `${t.mode}:${t.cues?.length ?? 0}` : 'nenhuma';
        }),
      )
      .toBe('showing:4');
    await openMenu(page, 'Legendas', 'Desativadas');
    expect(await video(page).locator('track').count()).toBe(0);

    // transcrição: lista, busca e clique leva ao instante
    const segments = page.getByTestId('transcript-segment');
    await expect(segments).toHaveCount(4);
    await page.getByLabel('Buscar na transcrição').fill('segundo');
    await expect(segments).toHaveCount(1);
    await page.getByLabel('Buscar na transcrição').fill('');
    await expect(segments).toHaveCount(4);
    await segments.nth(2).click(); // "Segundo conceito importante" começa em 10 s
    await expect.poll(() => time(page)).toBeGreaterThanOrEqual(9.5);
    await page.getByRole('button', { name: 'Pausar' }).click();

    // capítulos
    await page.getByRole('tab', { name: 'Capítulos' }).click();
    await expect(page.getByTestId('chapter')).toHaveCount(2);
    await page.getByTestId('chapter').first().click();
    await expect.poll(() => time(page)).toBeLessThan(1.5);

    // anotações: criar no instante, listar, saltar até ela
    await page.getByRole('tab', { name: 'Anotações' }).click();
    await page.getByLabel('Nova anotação').fill('Rever este trecho depois');
    await page.getByRole('button', { name: /^Anotar em/ }).click();
    await expect(page.getByTestId('note')).toHaveCount(1);
    await expect(page.getByTestId('note')).toContainText('Rever este trecho depois');

    // atalhos de teclado (foco no player)
    await page.locator('.player').focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => time(page)).toBeGreaterThan(4.5);
    await page.keyboard.press('k');
    await page.waitForFunction(() => !document.querySelector('video')!.paused);
    await page.keyboard.press('k');
    await page.waitForFunction(() => document.querySelector('video')!.paused);
    await page.keyboard.press('>');
    expect(await video(page).evaluate((v: HTMLVideoElement) => v.playbackRate)).toBe(1.75);

    // assiste uns segundos seguidos a 1× para gerar um trecho contado pelo servidor
    await openMenu(page, 'Velocidade', '1×');
    const startedAt = await time(page);
    await page.getByRole('button', { name: 'Reproduzir' }).click();
    await page.waitForTimeout(7000);
    await page.getByRole('button', { name: 'Pausar' }).click();
    const pausedAt = await time(page);
    expect(pausedAt - startedAt).toBeGreaterThan(5);

    // o servidor registrou o que foi assistido
    const token = await login(fx.email, PASSWORD);
    const progress = await call<{ ranges: [number, number][]; lastPos: number; maxPos: number }>(
      `/lessons/${fx.lessonId}/progress`,
      token,
    );
    const covered = progress.ranges.reduce((s, [a, b]) => s + (b - a), 0);
    expect(covered).toBeGreaterThanOrEqual(4);
    expect(progress.lastPos).toBeGreaterThan(startedAt);

    // recarregar retoma de onde parou
    await page.reload();
    await expect(page.getByLabel('Vídeo da aula')).toBeVisible();
    await page.waitForFunction(() => document.querySelector('video')!.readyState >= 1);
    const after = await call<{ lastPos: number }>(`/lessons/${fx.lessonId}/progress`, token);
    await expect.poll(() => time(page), { timeout: 15_000 }).toBeGreaterThan(after.lastPos - 2);
    expect(await time(page)).toBeGreaterThan(3);

    // "continuar assistindo" na home e histórico no servidor
    await page.goto('/#/');
    await expect(page.getByRole('heading', { name: 'Continuar assistindo' })).toBeVisible();
    const history = await call<{ total: number; data: { watchedS: number }[] }>(
      '/me/history',
      token,
    );
    expect(history.total).toBeGreaterThanOrEqual(1);
    expect(history.data.some((s) => s.watchedS >= 4)).toBe(true);
  });

  test('a 3ª tela simultânea do aluno é barrada com mensagem clara', async ({ page }) => {
    const token = await login(fx.email, PASSWORD);
    // ocupa as vagas que ainda restam (limite de 2 telas para alunos)
    for (let i = 0; i < 3; i++) {
      await fetch(`${API}/lessons/${fx.lessonId}/playback`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: ORIGIN,
          authorization: `Bearer ${token}`,
        },
        body: '{}',
      });
    }
    await signIn(page, fx.email);
    await page.goto(`/#/lesson/${fx.lessonId}`);
    await expect(
      page.getByRole('alert').filter({ hasText: 'Limite de sessões simultâneas' }),
    ).toBeVisible();
  });

  test('acessibilidade básica: controles com nome e barra de posição como slider', async ({
    page,
  }) => {
    const fresh = await call<{ id: string }>(
      '/users',
      await login('admin@empresa-a.local', 'dev12345'),
      'POST',
      {
        email: `a11y.${Date.now()}@empresa-a.local`,
        name: 'A11y',
        password: PASSWORD,
        role: 'aluno',
      },
    );
    const prof = await login('professor@empresa-a.local', 'dev12345');
    await call(`/courses/${fx.courseId}/enrollments`, prof, 'POST', { userId: fresh.id });
    const email = (
      await call<{ data: { id: string; email: string }[] }>('/users?limit=100', prof)
    ).data.find((u) => u.id === fresh.id)!.email;

    await signIn(page, email);
    await page.goto(`/#/lesson/${fx.lessonId}`);
    await expect(page.getByLabel('Vídeo da aula')).toBeVisible();
    for (const name of [
      'Reproduzir',
      'Silenciar',
      'Velocidade',
      'Qualidade',
      'Legendas',
      'Tela cheia',
    ]) {
      await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
    }
    const slider = page.getByRole('slider', { name: 'Posição do vídeo' });
    await expect(slider).toBeVisible();
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => time(page)).toBeGreaterThan(4.5);
  });
});
