import './style.css';
import {
  API_URL,
  ApiError,
  api,
  currentUser,
  isLoggedIn,
  login,
  logout,
  setLogoutHandler,
} from './api';
import { el, fmtTime } from './dom';
import { analyticsContent } from './analytics';
import { canManageVideos, libraryContent } from './library';
import { myAreaContent } from './student';
import { ChaptersPanel, NotesPanel, TranscriptPanel } from './panels';
import { LessonPlayer } from './player';

interface Lesson {
  id: string;
  title: string;
  status: string;
}
interface CourseDetail {
  id: string;
  title: string;
  description: string | null;
  modules: { id: string; title: string; lessons: Lesson[] }[];
}
interface CourseProgress {
  lessons: { lessonId: string; percent: number; completed: boolean }[];
  completedLessons: number;
  totalLessons: number;
  percent: number;
}

const app = document.getElementById('app')!;
let cleanup: (() => void) | null = null;

function go(hash: string): void {
  if (location.hash === hash) void route();
  else location.hash = hash;
}

setLogoutHandler(() => go('#/login'));

function shell(title: string, content: HTMLElement, back?: string): HTMLElement {
  const user = currentUser();
  return el(
    'div',
    { class: 'shell' },
    el(
      'header',
      { class: 'topbar' },
      back ? el('a', { class: 'back', text: '← Voltar', attrs: { href: back } }) : null,
      el('h1', { text: title }),
      el('span', { class: 'spacer' }),
      // Atalho de desenvolvimento: documentação interativa da API (desligada em produção).
      import.meta.env.DEV
        ? el('a', {
            class: 'dev-link',
            text: 'Swagger',
            attrs: { href: `${API_URL}/docs`, target: '_blank', rel: 'noopener' },
          })
        : null,
      user ? el('span', { class: 'user', text: `${user.email} · ${user.tenant}` }) : null,
      user
        ? el('button', {
            class: 'btn secondary',
            text: 'Sair',
            attrs: { type: 'button' },
            on: {
              click: async () => {
                await logout();
                go('#/login');
              },
            },
          })
        : null,
    ),
    el('main', {}, content),
  );
}

// ---------- telas ----------

function loginPage(): HTMLElement {
  const err = el('p', { class: 'error', attrs: { role: 'alert' } });
  const field = (label: string, attrs: Record<string, string>, value = '') => {
    const input = el('input', { attrs: { required: '', ...attrs } });
    input.value = value;
    return { input, node: el('label', {}, label, input) };
  };
  const tenant = field('Empresa', { name: 'tenant', autocomplete: 'organization' }, 'empresa-a');
  const email = field('E-mail', { name: 'email', type: 'email', autocomplete: 'username' });
  const pass = field('Senha', {
    name: 'password',
    type: 'password',
    autocomplete: 'current-password',
  });
  const form = el(
    'form',
    { class: 'card login' },
    el('h1', { text: 'Entrar' }),
    tenant.node,
    email.node,
    pass.node,
    err,
    el('button', { class: 'btn', text: 'Entrar', attrs: { type: 'submit' } }),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    try {
      await login(tenant.input.value.trim(), email.input.value.trim(), pass.input.value);
      go('#/');
    } catch (ex) {
      err.textContent = ex instanceof ApiError ? ex.message : 'Falha de conexão com a API';
    }
  });
  return el('div', { class: 'center' }, form);
}

async function homePage(): Promise<HTMLElement> {
  const [courses, cw] = await Promise.all([
    api<{ data: { id: string; title: string; description: string | null }[] }>('/courses?limit=50'),
    api<
      {
        lessonId: string;
        lessonTitle: string;
        courseId: string;
        courseTitle: string;
        lastPos: number;
        percent: number;
      }[]
    >('/me/continue-watching'),
  ]);
  const content = el('div', {});
  const manager = await canManageVideos().catch(() => false);
  content.append(
    el(
      'p',
      { class: 'home-links' },
      el('a', { class: 'btn secondary', text: 'Meu progresso', attrs: { href: '#/me' } }),
      manager
        ? el('a', { class: 'btn', text: 'Biblioteca de vídeos', attrs: { href: '#/library' } })
        : null,
      manager ? el('a', { class: 'btn', text: 'Analytics', attrs: { href: '#/analytics' } }) : null,
    ),
  );
  if (cw.length) {
    content.append(
      el('h2', { text: 'Continuar assistindo' }),
      el(
        'ul',
        { class: 'cards', attrs: { 'aria-label': 'Continuar assistindo' } },
        ...cw.map((c) =>
          el(
            'li',
            {},
            el(
              'a',
              {
                class: 'card link-card',
                attrs: { href: `#/lesson/${c.lessonId}?course=${c.courseId}` },
              },
              el('strong', { text: c.lessonTitle }),
              el('span', { text: c.courseTitle }),
              el('small', {
                text: `parou em ${fmtTime(c.lastPos)} · ${Math.round(c.percent)}% assistido`,
              }),
            ),
          ),
        ),
      ),
    );
  }
  content.append(
    el('h2', { text: 'Meus cursos' }),
    el(
      'ul',
      { class: 'cards', attrs: { 'aria-label': 'Cursos' } },
      ...(courses.data.length
        ? courses.data.map((c) =>
            el(
              'li',
              {},
              el(
                'a',
                { class: 'card link-card', attrs: { href: `#/course/${c.id}` } },
                el('strong', { text: c.title }),
                el('span', { text: c.description ?? '' }),
              ),
            ),
          )
        : [el('li', { class: 'empty', text: 'Você não tem cursos.' })]),
    ),
  );
  return shell('Vídeo-aulas', content);
}

async function coursePage(id: string): Promise<HTMLElement> {
  const [course, progress] = await Promise.all([
    api<CourseDetail>(`/courses/${id}`),
    api<CourseProgress>(`/courses/${id}/progress`),
  ]);
  const byLesson = new Map(progress.lessons.map((l) => [l.lessonId, l]));
  const content = el(
    'div',
    {},
    el('p', {
      class: 'muted',
      text: `${progress.completedLessons} de ${progress.totalLessons} aulas concluídas (${progress.percent}%)`,
    }),
    ...course.modules.map((m) =>
      el(
        'section',
        { class: 'module' },
        el('h2', { text: m.title }),
        el(
          'ul',
          { class: 'lessons' },
          ...m.lessons.map((l) => {
            const p = byLesson.get(l.id);
            return el(
              'li',
              {},
              el(
                'a',
                { attrs: { href: `#/lesson/${l.id}?course=${id}` } },
                el('span', { text: l.title }),
                el('small', {
                  text: p?.completed
                    ? '✓ concluída'
                    : p?.percent
                      ? `${Math.round(p.percent)}%`
                      : '',
                }),
              ),
            );
          }),
        ),
      ),
    ),
  );
  return shell(course.title, content, '#/');
}

async function analyticsPage(): Promise<HTMLElement> {
  if (!(await canManageVideos())) {
    return shell(
      'Analytics',
      el('p', { class: 'error', text: 'Somente professor ou administrador vê o analytics.' }),
      '#/',
    );
  }
  return shell('Analytics', await analyticsContent(), '#/');
}

async function myAreaPage(): Promise<HTMLElement> {
  return shell('Meu progresso', await myAreaContent(), '#/');
}

async function libraryPage(): Promise<HTMLElement> {
  if (!(await canManageVideos())) {
    return shell(
      'Biblioteca de vídeos',
      el('p', { class: 'error', text: 'Somente professor ou administrador gerencia vídeos.' }),
      '#/',
    );
  }
  const lib = await libraryContent();
  cleanup = lib.destroy;
  return shell('Biblioteca de vídeos', lib.root, '#/');
}

async function lessonPage(lessonId: string, courseId: string | null): Promise<HTMLElement> {
  const lesson = await api<{ id: string; title: string }>(`/lessons/${lessonId}`);
  const course = courseId
    ? await api<CourseDetail>(`/courses/${courseId}`).catch(() => null)
    : null;
  const flat = course?.modules.flatMap((m) => m.lessons) ?? [];
  const next = flat[flat.findIndex((l) => l.id === lessonId) + 1];

  const player = new LessonPlayer(lessonId);
  const nextBox = el('div', { class: 'next-up', attrs: { hidden: '', role: 'status' } });
  player.root.append(nextBox);

  let timer: number | undefined;
  player.onEnded = () => {
    if (!next) return;
    let left = 5;
    const render = () => {
      nextBox.replaceChildren(
        el('strong', { text: `Próxima aula em ${left}s` }),
        el('span', { text: next.title }),
        el('button', {
          class: 'btn',
          text: 'Ir agora',
          attrs: { type: 'button' },
          on: { click: () => go(`#/lesson/${next.id}?course=${courseId}`) },
        }),
        el('button', {
          class: 'btn secondary',
          text: 'Cancelar',
          attrs: { type: 'button' },
          on: {
            click: () => {
              clearInterval(timer);
              nextBox.hidden = true;
            },
          },
        }),
      );
    };
    nextBox.hidden = false;
    render();
    timer = window.setInterval(() => {
      left -= 1;
      if (left <= 0) {
        clearInterval(timer);
        go(`#/lesson/${next.id}?course=${courseId}`);
      } else render();
    }, 1000);
  };

  const tabs = el('div', { class: 'tabs', attrs: { role: 'tablist' } });
  const body = el('div', { class: 'tab-body' });
  const side = el('aside', { class: 'side' }, tabs, body);
  const layout = el(
    'div',
    { class: 'lesson-layout' },
    el('div', { class: 'stage' }, player.root),
    side,
  );

  cleanup = () => {
    clearInterval(timer);
    player.destroy();
  };

  try {
    const data = await player.start();
    const transcript = new TranscriptPanel(lessonId, player);
    const notes = new NotesPanel(lessonId, player);
    const chapters = new ChaptersPanel(data.chapters, player);
    player.onTimeUpdate = (t) => {
      transcript.update(t);
      chapters.update(t);
    };
    const panels: [string, HTMLElement][] = [
      ['Transcrição', transcript.root],
      ['Anotações', notes.root],
      ['Capítulos', chapters.root],
    ];
    const show = (i: number) => {
      body.replaceChildren(panels[i][1]);
      [...tabs.children].forEach((t, j) => t.setAttribute('aria-selected', String(i === j)));
    };
    panels.forEach(([name], i) =>
      tabs.append(
        el('button', {
          class: 'tab',
          text: name,
          attrs: { type: 'button', role: 'tab' },
          on: { click: () => show(i) },
        }),
      ),
    );
    show(0);
  } catch {
    /* o player já mostrou o motivo na própria tela */
  }
  return shell(lesson.title, layout, courseId ? `#/course/${courseId}` : '#/');
}

// ---------- roteador ----------

async function route(): Promise<void> {
  cleanup?.();
  cleanup = null;
  const [path, query = ''] = location.hash.slice(1).split('?');
  const params = new URLSearchParams(query);

  if (path === '/login') return void app.replaceChildren(loginPage());
  if (!isLoggedIn()) return go('#/login');

  app.replaceChildren(el('p', { class: 'loading', text: 'Carregando…' }));
  try {
    const lesson = /^\/lesson\/([0-9a-f-]{36})$/.exec(path);
    const course = /^\/course\/([0-9a-f-]{36})$/.exec(path);
    app.replaceChildren(
      lesson
        ? await lessonPage(lesson[1], params.get('course'))
        : course
          ? await coursePage(course[1])
          : path === '/library'
            ? await libraryPage()
            : path === '/analytics'
              ? await analyticsPage()
              : path === '/me'
                ? await myAreaPage()
                : await homePage(),
    );
  } catch (e) {
    app.replaceChildren(
      shell(
        'Ops',
        el('p', { class: 'error', text: e instanceof ApiError ? e.message : 'Erro inesperado' }),
        '#/',
      ),
    );
  }
}

window.addEventListener('hashchange', () => void route());
void route();
