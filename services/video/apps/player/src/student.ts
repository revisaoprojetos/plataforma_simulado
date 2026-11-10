import { ApiError, api } from './api';
import { el, fmtTime } from './dom';

interface StudentReport {
  userId: string;
  name: string;
  email?: string;
  coursesEnrolled: number;
  lessonsCompleted: number;
  totalWatchedS: number;
  lastActivityAt: string | null;
  courses: { courseId: string; title: string; totalLessons: number; completedLessons: number }[];
}
interface CourseProgress {
  percent: number;
  lessons: {
    lessonId: string;
    title: string;
    percent: number;
    completed: boolean;
    lastPos: number;
  }[];
}

const hours = (s: number) =>
  s >= 3600 ? `${(s / 3600).toFixed(1)} h` : `${Math.round(s / 60)} min`;

const stat = (label: string, value: string) =>
  el(
    'div',
    { class: 'kpi' },
    el('span', { class: 'kpi-value', text: value }),
    el('span', { class: 'kpi-label', text: label }),
  );

/**
 * Resumo e progresso de UM aluno. `target` = "me" (o próprio aluno) ou o id de um aluno
 * (professor dono do curso / admin). Serve a tela do aluno e a visão "Por aluno" do analytics.
 */
export async function studentReport(
  target: 'me' | string,
  linkLessons: boolean,
): Promise<HTMLElement> {
  try {
    const r = await api<StudentReport>(`/analytics/students/${target}`);
    const q = target === 'me' ? '' : `?userId=${target}`;
    const progress = await Promise.all(
      r.courses.map((c) => api<CourseProgress>(`/courses/${c.courseId}/progress${q}`)),
    );
    return el(
      'div',
      { class: 'student' },
      el('h2', { text: r.name }),
      r.email && target !== 'me' ? el('p', { class: 'muted', text: r.email }) : null,
      el(
        'div',
        { class: 'kpis' },
        stat('Cursos', String(r.coursesEnrolled)),
        stat('Aulas concluídas', String(r.lessonsCompleted)),
        stat('Tempo assistido', hours(r.totalWatchedS)),
        stat(
          'Última atividade',
          r.lastActivityAt ? new Date(r.lastActivityAt).toLocaleDateString('pt-BR') : '—',
        ),
      ),
      ...(r.courses.length
        ? r.courses.map((c, i) => courseBlock(c, progress[i], linkLessons))
        : [el('p', { class: 'empty', text: 'Nenhum curso matriculado.' })]),
    );
  } catch (e) {
    return el('p', {
      class: 'error',
      text: e instanceof ApiError ? e.message : 'Falha ao carregar',
    });
  }
}

function courseBlock(
  c: StudentReport['courses'][number],
  p: CourseProgress,
  linkLessons: boolean,
): HTMLElement {
  return el(
    'section',
    { class: 'module' },
    el('h3', { text: c.title }),
    el(
      'div',
      { class: 'course-progress' },
      el('progress', {
        attrs: { max: '100', value: String(p.percent), 'aria-label': `Progresso em ${c.title}` },
      }),
      el('span', { text: `${p.percent}% · ${c.completedLessons} de ${c.totalLessons} aulas` }),
    ),
    el(
      'ul',
      { class: 'lessons' },
      ...p.lessons.map((l) => {
        const label = el(
          'span',
          { class: 'lesson-line' },
          el('span', { text: `${l.completed ? '✓ ' : ''}${l.title}` }),
          el('small', {
            text: l.completed
              ? 'concluída'
              : l.percent > 0
                ? `${Math.round(l.percent)}% · parou em ${fmtTime(l.lastPos)}`
                : 'não começou',
          }),
        );
        return el(
          'li',
          {},
          linkLessons
            ? el('a', { attrs: { href: `#/lesson/${l.lessonId}?course=${c.courseId}` } }, label)
            : label,
        );
      }),
    ),
  );
}

/** Tela do aluno (MVP): meu resumo, meus cursos com progresso e "continuar de onde parei". */
export async function myAreaContent(): Promise<HTMLElement> {
  const [cw, report] = await Promise.all([
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
    studentReport('me', true),
  ]);
  const root = el('div', { class: 'my-area' });
  if (cw.length) {
    const c = cw[0];
    root.append(
      el(
        'a',
        {
          class: 'card link-card resume',
          attrs: { href: `#/lesson/${c.lessonId}?course=${c.courseId}` },
        },
        el('small', { text: 'Continuar de onde parei' }),
        el('strong', { text: c.lessonTitle }),
        el('span', {
          text: `${c.courseTitle} · parou em ${fmtTime(c.lastPos)} (${Math.round(c.percent)}%)`,
        }),
      ),
    );
  }
  root.append(report);
  return root;
}
