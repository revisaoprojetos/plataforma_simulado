import { ApiError, api, download } from './api';
import { barList, dailyChart, retentionChart } from './charts';
import { el, fmtTime } from './dom';
import { studentReport } from './student';

interface CourseReport {
  courseId: string;
  title: string;
  enrolledStudents: number;
  activeStudents: number;
  totalWatchedS: number;
  avgProgressPercent: number;
  studentsCompleted: number;
  completionRate: number;
  highlights: {
    lowestCompletion: { lessonId: string; title: string; completionRate: number } | null;
    mostWatched: { lessonId: string; title: string; watchedS: number } | null;
  };
  lessons: {
    lessonId: string;
    title: string;
    module: string;
    status: string;
    views: number;
    uniqueViewers: number;
    watchedS: number;
    startedStudents: number;
    completions: number;
    completionRate: number;
    avgPercentWatched: number;
  }[];
}

interface LessonReport {
  title: string;
  durationS: number | null;
  views: number;
  uniqueViewers: number;
  watchedS: number;
  avgWatchedPerViewerS: number;
  enrolledStudents: number;
  startedStudents: number;
  notStartedStudents: number;
  completions: number;
  completionRate: number;
  avgPercentWatched: number;
  daily: { day: string; views: number }[];
  retention: { bucketSeconds: number; points: { bucketS: number; viewers: number }[] };
  dropoffs: { atS: number; fromViewers: number; toViewers: number; lostViewers: number }[];
  playbackRates: { rate: number; watchedS: number; percent: number }[];
  qualities: { quality: string; watchedS: number; percent: number }[];
  devices: { device: string; sessions: number; watchedS: number; percent: number }[];
}

interface InactiveReport {
  count: number;
  students: {
    userId: string;
    name: string;
    email: string;
    lastActivityAt: string | null;
    daysInactive: number | null;
    completedLessons: number;
    totalLessons: number;
    progressPercent: number;
  }[];
}

/** 3725 → "1 h 2 min"; 125 → "2 min"; 40 → "40 s". */
export function fmtDuration(seconds: number): string {
  const s = Math.round(seconds);
  if (s >= 3600) return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
  if (s >= 60) return `${Math.floor(s / 60)} min`;
  return `${s} s`;
}

const pct = (ratio: number) => `${(ratio * 100).toFixed(1).replace('.0', '')}%`;

const kpi = (label: string, value: string, hint?: string) =>
  el(
    'div',
    { class: 'kpi' },
    el('span', { class: 'kpi-value', text: value }),
    el('span', { class: 'kpi-label', text: label }),
    hint ? el('small', { class: 'muted', text: hint }) : null,
  );

/** Tela de analytics: escolhe curso e período, mostra KPIs, ranking de aulas, inativos e o detalhe de uma aula. */
export async function analyticsContent(): Promise<HTMLElement> {
  const courses = (await api<{ data: { id: string; title: string }[] }>('/courses?limit=50')).data;
  const root = el('div', { class: 'analytics' });
  if (!courses.length) {
    root.append(el('p', { class: 'empty', text: 'Nenhum curso para analisar.' }));
    return root;
  }

  const select = el('select', { attrs: { 'aria-label': 'Curso' } });
  courses.forEach((c) => select.append(el('option', { text: c.title, attrs: { value: c.id } })));
  const from = el('input', { attrs: { type: 'date', 'aria-label': 'De' } });
  const to = el('input', { attrs: { type: 'date', 'aria-label': 'Até' } });
  const out = el('div', { class: 'report' });
  const err = el('p', { class: 'error', attrs: { role: 'alert' } });

  const period = () => {
    const q = new URLSearchParams();
    if (from.value) q.set('from', from.value);
    if (to.value) q.set('to', to.value);
    return q.toString();
  };
  const withQuery = (path: string, extra = '') => {
    const q = [period(), extra].filter(Boolean).join('&');
    return q ? `${path}?${q}` : path;
  };

  async function loadCourse(): Promise<void> {
    err.textContent = '';
    out.replaceChildren(el('p', { class: 'loading', text: 'Calculando…' }));
    try {
      const id = select.value;
      const [r, inactive] = await Promise.all([
        api<CourseReport>(withQuery(`/analytics/courses/${id}`)),
        api<InactiveReport>(`/analytics/courses/${id}/inactive?days=14`),
      ]);
      const detail = el('section', { class: 'lesson-detail', attrs: { 'aria-live': 'polite' } });

      const rows = r.lessons.map((l) =>
        el(
          'tr',
          {},
          el(
            'td',
            {},
            el('strong', { text: l.title }),
            el('small', { class: 'muted', text: ` ${l.module}` }),
          ),
          el('td', { text: l.status === 'published' ? 'Publicada' : 'Rascunho' }),
          el('td', { class: 'num', text: String(l.views) }),
          el('td', { class: 'num', text: String(l.uniqueViewers) }),
          el('td', { class: 'num', text: fmtDuration(l.watchedS) }),
          el('td', { class: 'num', text: `${l.completions}/${l.startedStudents}` }),
          el('td', { class: 'num', text: pct(l.completionRate) }),
          el('td', { class: 'num', text: `${Math.round(l.avgPercentWatched)}%` }),
          el(
            'td',
            {},
            el('button', {
              class: 'link',
              text: 'Detalhar',
              attrs: { type: 'button', 'aria-label': `Detalhar ${l.title}` },
              on: { click: () => void loadLesson(l.lessonId, detail) },
            }),
          ),
        ),
      );
      const head = [
        'Aula',
        'Estado',
        'Views',
        'Únicos',
        'Tempo',
        'Concluíram',
        'Conclusão',
        'Média',
        '',
      ];
      const csv = (label: string, path: string, name: string) =>
        el('button', {
          class: 'btn secondary',
          text: label,
          attrs: { type: 'button' },
          on: {
            click: () =>
              void download(`${path}${path.includes('?') ? '&' : '?'}delimiter=%3B`, name).catch(
                (e: Error) => (err.textContent = e.message),
              ),
          },
        });

      out.replaceChildren(
        el(
          'div',
          { class: 'kpis' },
          kpi('Alunos matriculados', String(r.enrolledStudents)),
          kpi('Ativos no período', String(r.activeStudents)),
          kpi('Tempo assistido', fmtDuration(r.totalWatchedS)),
          kpi('Progresso médio', `${Math.round(r.avgProgressPercent)}%`),
          kpi('Concluíram o curso', String(r.studentsCompleted), pct(r.completionRate)),
        ),
        el(
          'p',
          { class: 'muted' },
          r.highlights.mostWatched
            ? `Mais assistida: ${r.highlights.mostWatched.title} (${fmtDuration(r.highlights.mostWatched.watchedS)}). `
            : '',
          r.highlights.lowestCompletion
            ? `Menor conclusão: ${r.highlights.lowestCompletion.title} (${pct(r.highlights.lowestCompletion.completionRate)}).`
            : '',
        ),
        el(
          'div',
          { class: 'lib-head' },
          el('h2', { text: 'Aulas' }),
          csv(
            'Exportar ranking (CSV)',
            withQuery(`/analytics/courses/${id}/export.csv`),
            'ranking-aulas.csv',
          ),
        ),
        el(
          'div',
          { class: 'table-wrap' },
          el(
            'table',
            { class: 'table' },
            el(
              'thead',
              {},
              el('tr', {}, ...head.map((h) => el('th', { text: h, attrs: { scope: 'col' } }))),
            ),
            el('tbody', {}, ...rows),
          ),
        ),
        detail,
        inactiveSection(id, inactive, err),
      );
    } catch (e) {
      out.replaceChildren();
      err.textContent = e instanceof ApiError ? e.message : 'Falha ao carregar o relatório';
    }
  }

  async function loadLesson(lessonId: string, target: HTMLElement): Promise<void> {
    target.replaceChildren(el('p', { class: 'loading', text: 'Carregando a aula…' }));
    try {
      const l = await api<LessonReport>(withQuery(`/analytics/lessons/${lessonId}`));
      const peak = Math.max(0, ...l.retention.points.map((p) => p.viewers));
      target.replaceChildren(
        el('h2', { text: `Aula: ${l.title}` }),
        el(
          'div',
          { class: 'kpis' },
          kpi('Visualizações', String(l.views), `${l.uniqueViewers} alunos únicos`),
          kpi(
            'Tempo assistido',
            fmtDuration(l.watchedS),
            `${fmtDuration(l.avgWatchedPerViewerS)} por aluno`,
          ),
          kpi(
            'Começaram',
            String(l.startedStudents),
            `${l.notStartedStudents} ainda não começaram`,
          ),
          kpi('Concluíram', String(l.completions), pct(l.completionRate)),
          kpi(
            'Assistido em média',
            `${Math.round(l.avgPercentWatched)}%`,
            l.durationS ? `de ${fmtTime(l.durationS)}` : undefined,
          ),
        ),
        el('h3', { text: 'Retenção (alunos por trecho de 5 s)' }),
        peak
          ? retentionChart(
              l.retention.points,
              l.retention.bucketSeconds,
              `Retenção da aula ${l.title}`,
            )
          : el('p', { class: 'muted', text: 'Ainda não há visualizações para desenhar a curva.' }),
        el('h3', { text: 'Onde mais param de assistir' }),
        l.dropoffs.length
          ? el(
              'ul',
              { class: 'plain' },
              ...l.dropoffs.map((d) =>
                el('li', {
                  text: `Em ${fmtTime(d.atS)}: caem de ${d.fromViewers} para ${d.toViewers} (−${d.lostViewers}).`,
                }),
              ),
            )
          : el('p', { class: 'muted', text: 'Sem quedas relevantes.' }),
        el('h3', { text: 'Visualizações por dia' }),
        dailyChart(l.daily, `Visualizações por dia da aula ${l.title}`),
        el(
          'div',
          { class: 'cols' },
          el(
            'div',
            {},
            el('h3', { text: 'Velocidade' }),
            barList(
              l.playbackRates.map((r) => ({
                label: `${r.rate}×`,
                percent: r.percent,
                detail: `${r.percent}%`,
              })),
            ),
          ),
          el(
            'div',
            {},
            el('h3', { text: 'Qualidade' }),
            barList(
              l.qualities.map((q) => ({
                label: q.quality,
                percent: q.percent,
                detail: `${q.percent}%`,
              })),
            ),
          ),
          el(
            'div',
            {},
            el('h3', { text: 'Dispositivo' }),
            barList(
              l.devices.map((d) => ({
                label: d.device,
                percent: d.percent,
                detail: `${d.percent}% · ${d.sessions} sessões`,
              })),
            ),
          ),
        ),
        el('button', {
          class: 'btn secondary',
          text: 'Exportar retenção (CSV)',
          attrs: { type: 'button' },
          on: {
            click: () =>
              void download(
                `/analytics/lessons/${lessonId}/export.csv?delimiter=%3B`,
                'retencao.csv',
              ),
          },
        }),
      );
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      target.replaceChildren(
        el('p', {
          class: 'error',
          text: e instanceof ApiError ? e.message : 'Falha ao carregar a aula',
        }),
      );
    }
  }

  root.append(
    el(
      'div',
      { class: 'filters' },
      el('label', {}, 'Curso ', select),
      el('label', {}, 'De ', from),
      el('label', {}, 'Até ', to),
      el('button', {
        class: 'btn',
        text: 'Atualizar',
        attrs: { type: 'button' },
        on: { click: () => void loadCourse() },
      }),
    ),
    el('p', {
      class: 'muted',
      text: 'Sem datas: últimos 30 dias. Retenção e conclusão consideram todo o histórico.',
    }),
    err,
    out,
    studentSearch(),
  );
  select.addEventListener('change', () => void loadCourse());
  await loadCourse();
  return root;
}

/** Busca um aluno por nome ou e-mail (a lista é paginada: cabe em empresas com milhares de alunos). */
function studentSearch(): HTMLElement {
  const input = el('input', {
    attrs: { type: 'search', placeholder: 'Nome ou e-mail do aluno', 'aria-label': 'Buscar aluno' },
  });
  const results = el('ul', { class: 'student-results' });
  const detail = el('div', { class: 'student-detail', attrs: { 'aria-live': 'polite' } });
  let page = 1;

  async function search(): Promise<void> {
    try {
      const r = await api<{
        data: { id: string; name: string; email: string; role: string }[];
        total: number;
      }>(`/users?limit=10&page=${page}&q=${encodeURIComponent(input.value.trim())}`);
      const students = r.data.filter((u) => u.role === 'aluno');
      results.replaceChildren(
        ...(students.length
          ? students.map((u) =>
              el(
                'li',
                {},
                el('button', {
                  class: 'link',
                  text: `${u.name} · ${u.email}`,
                  attrs: { type: 'button' },
                  on: {
                    click: async () => {
                      detail.replaceChildren(el('p', { class: 'loading', text: 'Carregando…' }));
                      detail.replaceChildren(await studentReport(u.id, false));
                    },
                  },
                }),
              ),
            )
          : [el('li', { class: 'muted', text: 'Nenhum aluno encontrado.' })]),
        el(
          'li',
          { class: 'pager' },
          el('button', {
            class: 'link',
            text: '← anteriores',
            attrs: { type: 'button', ...(page === 1 && { disabled: '' }) },
            on: { click: () => ((page -= 1), void search()) },
          }),
          el('small', { class: 'muted', text: ` ${r.total} usuários · página ${page} ` }),
          el('button', {
            class: 'link',
            text: 'próximos →',
            attrs: { type: 'button', ...(page * 10 >= r.total && { disabled: '' }) },
            on: { click: () => ((page += 1), void search()) },
          }),
        ),
      );
    } catch (e) {
      results.replaceChildren(
        el('li', { class: 'error', text: e instanceof ApiError ? e.message : 'Falha na busca' }),
      );
    }
  }
  input.addEventListener('input', () => {
    page = 1;
    void search();
  });
  void search();
  return el(
    'section',
    { class: 'by-student' },
    el('h2', { text: 'Por aluno' }),
    input,
    results,
    detail,
  );
}

function inactiveSection(courseId: string, r: InactiveReport, err: HTMLElement): HTMLElement {
  return el(
    'section',
    { class: 'inactive' },
    el(
      'div',
      { class: 'lib-head' },
      el('h2', { text: `Alunos sem atividade há 14 dias (${r.count})` }),
      el('button', {
        class: 'btn secondary',
        text: 'Exportar (CSV)',
        attrs: { type: 'button' },
        on: {
          click: () =>
            void download(
              `/analytics/courses/${courseId}/inactive/export.csv?days=14&delimiter=%3B`,
              'alunos-inativos.csv',
            ).catch((e: Error) => (err.textContent = e.message)),
        },
      }),
    ),
    r.count
      ? el(
          'div',
          { class: 'table-wrap' },
          el(
            'table',
            { class: 'table' },
            el(
              'thead',
              {},
              el(
                'tr',
                {},
                ...['Aluno', 'E-mail', 'Última atividade', 'Progresso'].map((h) =>
                  el('th', { text: h, attrs: { scope: 'col' } }),
                ),
              ),
            ),
            el(
              'tbody',
              {},
              ...r.students.map((s) =>
                el(
                  'tr',
                  {},
                  el('td', { text: s.name }),
                  el('td', { text: s.email }),
                  el('td', {
                    text: s.daysInactive === null ? 'Nunca começou' : `há ${s.daysInactive} dia(s)`,
                  }),
                  el('td', {
                    class: 'num',
                    text: `${s.completedLessons}/${s.totalLessons} (${Math.round(s.progressPercent)}%)`,
                  }),
                ),
              ),
            ),
          ),
        )
      : el('p', { class: 'muted', text: 'Todos os matriculados estiveram ativos.' }),
  );
}
