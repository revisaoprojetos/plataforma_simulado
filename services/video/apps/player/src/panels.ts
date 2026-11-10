import { api } from './api';
import { el, fmtTime } from './dom';
import type { LessonPlayer, PlaybackData } from './player';

interface Segment {
  startS: number;
  endS: number;
  text: string;
}

interface Note {
  id: string;
  atS: number;
  text: string;
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** Transcrição sincronizada: destaca a fala atual, clique leva ao instante, busca filtra. */
export class TranscriptPanel {
  readonly root: HTMLElement;
  private segments: Segment[] = [];
  private rows: HTMLElement[] = [];
  private active = -1;
  private listEl: HTMLElement;
  private langSel: HTMLSelectElement;
  private query = '';

  constructor(
    private readonly lessonId: string,
    private readonly player: LessonPlayer,
  ) {
    this.langSel = el('select', { attrs: { 'aria-label': 'Idioma da transcrição' } });
    this.langSel.addEventListener('change', () => void this.load(this.langSel.value));
    const search = el('input', {
      attrs: {
        type: 'search',
        placeholder: 'Buscar na transcrição',
        'aria-label': 'Buscar na transcrição',
      },
    });
    search.addEventListener('input', () => {
      this.query = norm(search.value.trim());
      this.render();
    });
    this.listEl = el('ol', { class: 'transcript', attrs: { 'aria-label': 'Transcrição' } });
    this.root = el(
      'div',
      { class: 'panel' },
      el('div', { class: 'panel-tools' }, search, this.langSel),
      this.listEl,
    );
    void this.load();
  }

  private async load(lang?: string): Promise<void> {
    const q = lang ? `?lang=${encodeURIComponent(lang)}` : '';
    type Transcript = { lang: string | null; languages: string[]; segments: Segment[] };
    let t = await api<Transcript>(`/lessons/${this.lessonId}/transcript${q}`);
    if (!lang) {
      // Sem escolha explícita: prefere a legenda que o aluno usa, depois o idioma do navegador.
      const wanted = [
        localStorage.getItem('gv.caption'),
        navigator.language,
        navigator.language.split('-')[0],
      ];
      const pick = wanted.find((w) => w && t.languages.includes(w));
      if (pick && pick !== t.lang) {
        t = await api<Transcript>(
          `/lessons/${this.lessonId}/transcript?lang=${encodeURIComponent(pick)}`,
        );
      }
    }
    this.segments = t.segments;
    this.langSel.replaceChildren(
      ...t.languages.map((l) => el('option', { text: l, attrs: { value: l } })),
    );
    if (t.lang) this.langSel.value = t.lang;
    this.langSel.hidden = t.languages.length < 2;
    this.render();
  }

  private render(): void {
    this.active = -1;
    const shown = this.segments.filter((s) => !this.query || norm(s.text).includes(this.query));
    this.rows = shown.map((s) =>
      el(
        'li',
        { class: 'segment', attrs: { 'data-start': String(s.startS) } },
        el(
          'button',
          {
            class: 'segment-btn',
            attrs: { type: 'button', 'data-testid': 'transcript-segment' },
            on: {
              click: () => {
                this.player.seek(s.startS);
                void this.player.video.play().catch(() => undefined);
              },
            },
          },
          el('span', { class: 'segment-time', text: fmtTime(s.startS) }),
          el('span', { text: s.text }),
        ),
      ),
    );
    this.listEl.replaceChildren(
      ...(this.rows.length
        ? this.rows
        : [
            el('li', {
              class: 'empty',
              text: this.segments.length ? 'Nada encontrado.' : 'Esta aula não tem transcrição.',
            }),
          ]),
    );
    this.update(this.player.video.currentTime);
  }

  /** Marca a fala em andamento e a mantém visível. */
  update(t: number): void {
    let idx = -1;
    this.rows.forEach((row, i) => {
      if (Number(row.dataset.start) <= t) idx = i;
    });
    if (idx === this.active) return;
    this.rows[this.active]?.classList.remove('current');
    this.rows[idx]?.classList.add('current');
    this.rows[idx]?.scrollIntoView({ block: 'nearest' });
    this.active = idx;
  }
}

/** Anotações privadas do aluno, presas a um instante do vídeo. */
export class NotesPanel {
  readonly root: HTMLElement;
  private listEl: HTMLElement;
  private input: HTMLTextAreaElement;
  private addBtn: HTMLButtonElement;

  constructor(
    private readonly lessonId: string,
    private readonly player: LessonPlayer,
  ) {
    this.input = el('textarea', {
      attrs: {
        rows: '3',
        placeholder: 'Escreva uma anotação…',
        'aria-label': 'Nova anotação',
        maxlength: '2000',
      },
    });
    this.addBtn = el('button', {
      class: 'btn',
      attrs: { type: 'button' },
      on: { click: () => void this.add() },
    });
    this.listEl = el('ul', { class: 'notes', attrs: { 'aria-label': 'Minhas anotações' } });
    this.root = el(
      'div',
      { class: 'panel' },
      el('div', { class: 'note-form' }, this.input, this.addBtn),
      this.listEl,
    );
    this.player.video.addEventListener('timeupdate', () => this.labelButton());
    this.labelButton();
    void this.load();
  }

  private labelButton(): void {
    this.addBtn.textContent = `Anotar em ${fmtTime(this.player.video.currentTime)}`;
  }

  private async load(): Promise<void> {
    this.render(await api<Note[]>(`/lessons/${this.lessonId}/notes`));
  }

  private async add(): Promise<void> {
    const text = this.input.value.trim();
    if (!text) return;
    await api(`/lessons/${this.lessonId}/notes`, {
      method: 'POST',
      body: { atS: Math.floor(this.player.video.currentTime), text },
    });
    this.input.value = '';
    await this.load();
  }

  private render(notes: Note[]): void {
    this.listEl.replaceChildren(
      ...(notes.length
        ? notes.map((n) =>
            el(
              'li',
              { class: 'note', attrs: { 'data-testid': 'note' } },
              el('button', {
                class: 'note-time',
                text: fmtTime(n.atS),
                attrs: { type: 'button', 'aria-label': `Ir para ${fmtTime(n.atS)}` },
                on: { click: () => this.player.seek(n.atS) },
              }),
              el('span', { class: 'note-text', text: n.text }),
              el('button', {
                class: 'link',
                text: 'Editar',
                attrs: { type: 'button' },
                on: {
                  click: async () => {
                    const text = prompt('Editar anotação', n.text)?.trim();
                    if (text) {
                      await api(`/notes/${n.id}`, { method: 'PATCH', body: { text } });
                      await this.load();
                    }
                  },
                },
              }),
              el('button', {
                class: 'link danger',
                text: 'Excluir',
                attrs: { type: 'button' },
                on: {
                  click: async () => {
                    await api(`/notes/${n.id}`, { method: 'DELETE' });
                    await this.load();
                  },
                },
              }),
            ),
          )
        : [el('li', { class: 'empty', text: 'Você ainda não fez anotações nesta aula.' })]),
    );
  }
}

/** Capítulos da aula; o atual fica em destaque. */
export class ChaptersPanel {
  readonly root: HTMLElement;
  private rows: HTMLElement[] = [];
  private starts: number[];

  constructor(chapters: PlaybackData['chapters'], player: LessonPlayer) {
    this.starts = chapters.map((c) => c.startS);
    this.rows = chapters.map((c) =>
      el(
        'li',
        {},
        el(
          'button',
          {
            class: 'segment-btn',
            attrs: { type: 'button', 'data-testid': 'chapter' },
            on: { click: () => player.seek(c.startS) },
          },
          el('span', { class: 'segment-time', text: fmtTime(c.startS) }),
          el('span', { text: c.title }),
        ),
      ),
    );
    this.root = el(
      'div',
      { class: 'panel' },
      el(
        'ol',
        { class: 'transcript', attrs: { 'aria-label': 'Capítulos' } },
        ...(this.rows.length
          ? this.rows
          : [el('li', { class: 'empty', text: 'Esta aula não tem capítulos.' })]),
      ),
    );
  }

  update(t: number): void {
    let idx = -1;
    this.starts.forEach((s, i) => {
      if (s <= t) idx = i;
    });
    this.rows.forEach((r, i) => r.classList.toggle('current', i === idx));
  }
}
