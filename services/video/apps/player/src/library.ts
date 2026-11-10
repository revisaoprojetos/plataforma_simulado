import { ApiError, api } from './api';
import { el, fmtTime } from './dom';
import { SubtitlesPanel } from './subtitles';
import { uploadVideo, UploadHandle } from './upload';

interface Lesson {
  id: string;
  title: string;
  status: string;
  videoId: string | null;
}
interface CourseDetail {
  id: string;
  title: string;
  modules: { id: string; title: string; lessons: Lesson[] }[];
}
interface VideoInfo {
  status: 'uploading' | 'uploaded' | 'queued' | 'processing' | 'ready' | 'failed';
  originalName: string;
  sizeBytes: number | string;
  durationS: number | null;
  error: string | null;
}

const STATUS: Record<VideoInfo['status'], string> = {
  uploading: 'Enviando…',
  uploaded: 'Enviado (fora da fila)',
  queued: 'Na fila',
  processing: 'Processando',
  ready: 'Pronto',
  failed: 'Falhou',
};
const ACTIVE = new Set<VideoInfo['status']>(['uploading', 'queued', 'processing']);
const POLL_MS = 3000;

const mib = (n: number | string) => `${(Number(n) / 1048576).toFixed(1)} MiB`;

/** Só professor e admin gerenciam vídeos. */
export async function canManageVideos(): Promise<boolean> {
  const me = await api<{ role: string }>('/me');
  return me.role === 'admin' || me.role === 'professor';
}

class LessonRow {
  readonly root: HTMLElement;
  private info: VideoInfo | null = null;
  private upload: UploadHandle | null = null;
  private readonly meta = el('small', { class: 'muted' });
  private readonly badge = el('span', { class: 'badge' });
  private readonly actions = el('div', { class: 'row-actions' });
  private readonly bar = el('progress', { attrs: { max: '100', value: '0', hidden: '' } });
  private readonly msg = el('small', { class: 'error', attrs: { role: 'alert' } });

  constructor(
    private readonly lesson: Lesson,
    private readonly courseId: string,
    private readonly onChange: () => void,
  ) {
    this.root = el(
      'li',
      { class: 'lib-row' },
      el(
        'div',
        { class: 'lib-title' },
        el('strong', { text: lesson.title }),
        this.badge,
        this.meta,
      ),
      this.bar,
      this.msg,
      this.actions,
      new SubtitlesPanel(lesson.id).root,
    );
  }

  get active(): boolean {
    return !!this.info && ACTIVE.has(this.info.status) && !this.upload;
  }

  async refresh(): Promise<void> {
    this.info = this.lesson.videoId
      ? await api<VideoInfo>(`/videos/${this.lesson.videoId}`).catch(() => null)
      : null;
    this.render();
  }

  private render(): void {
    const v = this.info;
    this.badge.textContent = v ? STATUS[v.status] : 'Sem vídeo';
    this.badge.dataset.status = v?.status ?? 'none';
    this.meta.textContent = v
      ? [v.originalName, mib(v.sizeBytes), v.durationS ? fmtTime(v.durationS) : null]
          .filter(Boolean)
          .join(' · ')
      : '';
    if (v?.status === 'failed' && v.error) this.msg.textContent = v.error;
    else if (!this.upload) this.msg.textContent = '';

    const uploading = !!this.upload;
    const buttons: (HTMLElement | null)[] = [];
    if (uploading) {
      buttons.push(this.button('Cancelar envio', () => this.upload?.cancel(), true));
    } else {
      const input = el('input', {
        attrs: { type: 'file', accept: 'video/*,.mkv', hidden: '', 'aria-label': 'Escolher vídeo' },
      });
      input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (file) void this.send(file);
      });
      buttons.push(
        input,
        this.button(v ? 'Trocar vídeo' : 'Enviar vídeo', () => input.click()),
      );
      if (v?.status === 'ready') {
        buttons.push(
          el('a', {
            class: 'btn',
            text: '▶ Assistir',
            attrs: { href: `#/lesson/${this.lesson.id}?course=${this.courseId}` },
          }),
        );
      }
      if (v && ['failed', 'uploaded', 'ready'].includes(v.status)) {
        buttons.push(this.button('Reprocessar', () => void this.reprocess(), true));
      }
      if (v && v.status !== 'processing') {
        buttons.push(this.button('Excluir vídeo', () => void this.remove(), true));
      }
    }
    this.actions.replaceChildren(...(buttons.filter(Boolean) as HTMLElement[]));
  }

  private button(text: string, onClick: () => void, secondary = false): HTMLButtonElement {
    return el('button', {
      class: secondary ? 'btn secondary' : 'btn',
      text,
      attrs: { type: 'button' },
      on: { click: onClick },
    });
  }

  private async send(file: File): Promise<void> {
    this.msg.textContent = '';
    this.bar.hidden = false;
    this.bar.value = 0;
    this.upload = uploadVideo(this.lesson.id, file, (sent, total) => {
      this.bar.value = Math.round((sent / total) * 100);
      this.badge.textContent = `Enviando ${this.bar.value}%`;
    });
    this.badge.dataset.status = 'uploading';
    this.render();
    try {
      this.lesson.videoId = await this.upload.promise;
    } catch (e) {
      this.msg.textContent = (e as Error).message;
      this.lesson.videoId = null;
    } finally {
      this.upload = null;
      this.bar.hidden = true;
    }
    await this.refresh();
  }

  private async reprocess(): Promise<void> {
    await this.run(() => api(`/videos/${this.lesson.videoId}/reprocess`, { method: 'POST' }));
  }

  private async remove(): Promise<void> {
    if (!confirm(`Excluir o vídeo da aula "${this.lesson.title}"? Isso apaga os arquivos.`)) return;
    await this.run(async () => {
      await api(`/videos/${this.lesson.videoId}`, { method: 'DELETE' });
      this.lesson.videoId = null;
    });
  }

  private async run(fn: () => Promise<unknown>): Promise<void> {
    this.msg.textContent = '';
    try {
      await fn();
    } catch (e) {
      this.msg.textContent = e instanceof ApiError ? e.message : 'Falha na operação';
    }
    await this.refresh();
    this.onChange();
  }
}

/** Tela de desenvolvimento: lista aulas com o estado do vídeo, envia, acompanha o processamento e abre o player. */
export async function libraryContent(): Promise<{ root: HTMLElement; destroy: () => void }> {
  const root = el('div', { class: 'library' });
  const rows: LessonRow[] = [];

  async function load(): Promise<void> {
    const list = await api<{ data: { id: string; title: string }[] }>('/courses?limit=50');
    const courses = await Promise.all(list.data.map((c) => api<CourseDetail>(`/courses/${c.id}`)));
    rows.length = 0;
    const sections: HTMLElement[] = [];
    for (const course of courses) {
      const block = el('section', { class: 'module' }, el('h2', { text: course.title }));
      for (const mod of course.modules) {
        const ul = el('ul', { class: 'lib-list' });
        for (const lesson of mod.lessons) {
          const row = new LessonRow(lesson, course.id, () => void 0);
          rows.push(row);
          ul.append(row.root);
        }
        block.append(el('h3', { class: 'muted', text: mod.title }), ul, newLessonForm(mod.id));
      }
      sections.push(block);
    }
    root.replaceChildren(
      el(
        'div',
        { class: 'lib-head' },
        el('p', {
          class: 'muted',
          text: 'Envie o vídeo de uma aula; o worker converte para HLS e a aula fica pronta para assistir.',
        }),
        el('button', {
          class: 'btn secondary',
          text: 'Atualizar',
          attrs: { type: 'button' },
          on: { click: () => void load() },
        }),
      ),
      ...(sections.length ? sections : [el('p', { class: 'empty', text: 'Nenhum curso.' })]),
    );
    await Promise.all(rows.map((r) => r.refresh()));
  }

  function newLessonForm(moduleId: string): HTMLElement {
    const input = el('input', {
      attrs: {
        placeholder: 'Título da nova aula',
        'aria-label': 'Título da nova aula',
        maxlength: '200',
      },
    });
    const err = el('small', { class: 'error', attrs: { role: 'alert' } });
    const form = el(
      'form',
      { class: 'new-lesson' },
      input,
      el('button', { class: 'btn secondary', text: '+ Nova aula', attrs: { type: 'submit' } }),
      err,
    );
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!input.value.trim()) return;
      try {
        await api(`/modules/${moduleId}/lessons`, {
          method: 'POST',
          body: { title: input.value.trim(), status: 'published' },
        });
        await load();
      } catch (ex) {
        err.textContent = ex instanceof ApiError ? ex.message : 'Falha ao criar a aula';
      }
    });
    return form;
  }

  await load();
  // Acompanha o processamento sem recarregar a tela.
  const timer = window.setInterval(() => {
    rows.filter((r) => r.active).forEach((r) => void r.refresh());
  }, POLL_MS);
  return { root, destroy: () => clearInterval(timer) };
}
