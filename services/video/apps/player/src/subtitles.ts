import { ApiError, api } from './api';
import { el } from './dom';

/**
 * Aceita .srt trocando o formato para WebVTT (a API só recebe WebVTT): vírgula vira ponto nos
 * tempos, some a numeração dos blocos e entra o cabeçalho. Um .vtt passa sem alteração.
 */
export function srtToVtt(text: string): string {
  const noBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const clean = noBom.replace(/\r\n?/g, '\n');
  if (clean.trimStart().startsWith('WEBVTT')) return clean;
  const lines = clean
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
    .split('\n')
    .filter((line, i, all) => !(/^\d+$/.test(line.trim()) && /-->/.test(all[i + 1] ?? '')));
  return `WEBVTT\n\n${lines.join('\n').trim()}\n`;
}

const LANG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;

/** Legendas de uma aula: lista os idiomas, envia .vtt/.srt (gera a transcrição) e apaga. */
export class SubtitlesPanel {
  readonly root: HTMLDetailsElement;
  private readonly summary = el('summary', { text: 'Legendas' });
  private readonly list = el('ul', { class: 'sub-list' });
  private readonly msg = el('small', { attrs: { role: 'status' } });

  constructor(private readonly lessonId: string) {
    const lang = el('input', {
      attrs: { value: 'pt-BR', size: '7', 'aria-label': 'Idioma da legenda', maxlength: '12' },
    });
    const file = el('input', {
      attrs: {
        type: 'file',
        accept: '.vtt,.srt,text/vtt',
        hidden: '',
        'aria-label': 'Arquivo de legenda',
      },
    });
    file.addEventListener('change', () => {
      const f = file.files?.[0];
      file.value = '';
      if (f) void this.send(lang.value.trim(), f);
    });
    const form = el(
      'div',
      { class: 'sub-form' },
      el('label', {}, 'Idioma ', lang),
      file,
      el('button', {
        class: 'btn secondary',
        text: 'Enviar legenda (.vtt ou .srt)',
        attrs: { type: 'button' },
        on: { click: () => file.click() },
      }),
    );
    this.root = el(
      'details',
      { class: 'subtitles' },
      this.summary,
      this.list,
      form,
      this.msg,
    ) as HTMLDetailsElement;
    this.root.addEventListener('toggle', () => {
      if (this.root.open) void this.load();
    });
    void this.load();
  }

  private async load(): Promise<void> {
    const langs = await api<{ lang: string }[]>(`/lessons/${this.lessonId}/subtitles`).catch(
      () => [],
    );
    this.summary.textContent = `Legendas (${langs.length})`;
    this.list.replaceChildren(
      ...(langs.length
        ? langs.map(({ lang }) =>
            el(
              'li',
              {},
              el('strong', { text: lang }),
              el('button', {
                class: 'link danger',
                text: 'Excluir',
                attrs: { type: 'button', 'aria-label': `Excluir legenda ${lang}` },
                on: { click: () => void this.remove(lang) },
              }),
            ),
          )
        : [el('li', { class: 'muted', text: 'Nenhuma legenda enviada.' })]),
    );
  }

  private say(text: string, error = false): void {
    this.msg.textContent = text;
    this.msg.className = error ? 'error' : 'ok';
  }

  private async send(lang: string, file: File): Promise<void> {
    if (!LANG.test(lang)) return this.say('Idioma inválido (ex.: pt-BR, en, es).', true);
    try {
      const content = srtToVtt(await file.text());
      await api(`/lessons/${this.lessonId}/subtitles`, { method: 'POST', body: { lang, content } });
      this.say(`Legenda ${lang} enviada; a transcrição foi gerada a partir dela.`);
      await this.load();
    } catch (e) {
      this.say(e instanceof ApiError ? e.message : 'Falha ao enviar a legenda', true);
    }
  }

  private async remove(lang: string): Promise<void> {
    if (!confirm(`Excluir a legenda ${lang} e a transcrição dela?`)) return;
    try {
      await api(`/lessons/${this.lessonId}/subtitles/${encodeURIComponent(lang)}`, {
        method: 'DELETE',
      });
      this.say(`Legenda ${lang} excluída.`);
      await this.load();
    } catch (e) {
      this.say(e instanceof ApiError ? e.message : 'Falha ao excluir', true);
    }
  }
}
