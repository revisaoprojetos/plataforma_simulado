import Hls from 'hls.js';
import { API_URL, ApiError, api } from './api';
import { clamp, el, fmtTime, safeStorage } from './dom';

export interface PlaybackData {
  sessionId: string;
  playbackToken: string;
  expiresIn: number;
  manifestUrl: string;
  spriteVttUrl: string;
  posterUrl: string;
  durationS: number | null;
  watermark: { text: string };
  resumeAt: number;
  subtitles: { lang: string; url: string }[];
  chapters: { startS: number; title: string }[];
}

interface SpriteCue {
  start: number;
  end: number;
  x: number;
  y: number;
  w: number;
  h: number;
  url: string;
}

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const HEARTBEAT_MS = 10_000;
const store = safeStorage();

/** Troca o `t=` de uma URL do HLS pelo token mais recente (o token renova a cada ~4 min). */
const withToken = (url: string, token: string) =>
  url.replace(/([?&])t=[^&]*/, `$1t=${encodeURIComponent(token)}`);

/**
 * Player de referência: HLS (hls.js) com controles próprios, legendas, velocidade, qualidade,
 * preview na timeline, capítulos, marca d'água e rastreamento de progresso (heartbeat).
 */
export class LessonPlayer {
  readonly root: HTMLElement;
  readonly video: HTMLVideoElement;

  onTimeUpdate: (t: number) => void = () => undefined;
  onEnded: () => void = () => undefined;

  private hls?: Hls;
  private data!: PlaybackData;
  private token = '';
  private seq = 0;
  private lastBeat = 0;
  private timers: number[] = [];
  private sprite: SpriteCue[] = [];
  private captionUrl?: string;
  private ended = false;
  private destroyed = false;

  // elementos
  private playBtn!: HTMLButtonElement;
  private timeLabel!: HTMLElement;
  private seekEl!: HTMLElement;
  private seekPlayed!: HTMLElement;
  private seekBuffered!: HTMLElement;
  private seekTip!: HTMLElement;
  private chapterLabel!: HTMLElement;
  private speedBtn!: HTMLButtonElement;
  private qualityBtn!: HTMLButtonElement;
  private captionsBtn!: HTMLButtonElement;
  private errorBox!: HTMLElement;
  private watermark!: HTMLElement;
  private volume!: HTMLInputElement;

  constructor(private readonly lessonId: string) {
    this.video = el('video', {
      class: 'video',
      attrs: { playsinline: '', crossorigin: 'anonymous', 'aria-label': 'Vídeo da aula' },
    });
    this.root = this.build();
  }

  // ---------- ciclo de vida ----------

  async start(): Promise<PlaybackData> {
    try {
      this.data = await api<PlaybackData>(`/lessons/${this.lessonId}/playback`, {
        method: 'POST',
        body: {},
      });
    } catch (e) {
      this.fail(
        e instanceof ApiError && e.status === 409
          ? e.message
          : e instanceof ApiError
            ? e.message
            : 'Não foi possível iniciar a reprodução',
      );
      throw e;
    }
    this.token = this.data.playbackToken;
    this.watermark.textContent = this.data.watermark.text;
    this.video.poster = this.data.posterUrl;
    this.renderChapterMarks();
    this.attach();
    this.loadSprite().catch(() => undefined);
    this.applyStoredPreferences();

    this.timers.push(window.setInterval(() => this.heartbeat(), HEARTBEAT_MS));
    this.timers.push(window.setInterval(() => this.moveWatermark(), 15_000));
    this.scheduleRenew();
    window.addEventListener('pagehide', this.onPageHide);
    return this.data;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.heartbeat(true);
    this.endSession();
    this.timers.forEach((t) => {
      clearInterval(t);
      clearTimeout(t);
    });
    window.removeEventListener('pagehide', this.onPageHide);
    this.hls?.destroy();
    if (this.captionUrl) URL.revokeObjectURL(this.captionUrl);
    this.video.removeAttribute('src');
    this.video.load();
  }

  seek(t: number): void {
    const d = this.video.duration || this.data?.durationS || 0;
    this.video.currentTime = clamp(t, 0, d);
  }

  get duration(): number {
    return this.video.duration || this.data?.durationS || 0;
  }

  // ---------- HLS ----------

  private attach(): void {
    const src = API_URL + this.data.manifestUrl;
    const resume = () => {
      if (this.data.resumeAt > 0) this.video.currentTime = this.data.resumeAt;
    };
    if (Hls.isSupported()) {
      this.hls = new Hls({
        // Toda requisição à API usa o token atual, mesmo as feitas minutos depois do início.
        xhrSetup: (xhr, url) => {
          if (url.includes('/v1/hls/')) xhr.open('GET', withToken(url, this.token), true);
        },
      });
      this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
        resume();
        this.refreshQualityLabel();
      });
      this.hls.on(Hls.Events.LEVEL_SWITCHED, () => this.refreshQualityLabel());
      this.hls.on(Hls.Events.ERROR, (_e, err) => {
        if (err.fatal) this.fail('Falha ao carregar o vídeo. Tente novamente.');
      });
      this.hls.loadSource(src);
      this.hls.attachMedia(this.video);
    } else {
      // Safari reproduz HLS nativamente.
      this.video.src = src;
      this.video.addEventListener('loadedmetadata', resume, { once: true });
    }
  }

  // ---------- sessão: heartbeat, renovação e encerramento ----------

  /** Informa onde o aluno está; o servidor decide o que conta como "assistido". */
  private heartbeat(force = false): void {
    if (!this.token || (!force && this.video.paused)) return;
    const now = Date.now();
    if (now - this.lastBeat < 700) return; // o servidor ignora batimentos < 500 ms
    this.lastBeat = now;
    void fetch(`${API_URL}/v1/progress/heartbeat`, {
      method: 'POST',
      keepalive: true,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.token}` },
      body: JSON.stringify({
        seq: ++this.seq,
        position: this.video.currentTime,
        rate: this.video.playbackRate,
        quality: this.currentQuality(),
        device: 'web',
      }),
    }).catch(() => undefined);
  }

  private scheduleRenew(): void {
    const ms = Math.max(30_000, this.data.expiresIn * 800);
    this.timers.push(window.setTimeout(() => void this.renew(), ms));
  }

  private async renew(): Promise<void> {
    if (this.destroyed) return;
    try {
      const res = await fetch(`${API_URL}/v1/playback/renew`, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.token}` },
      });
      if (!res.ok) throw new ApiError(res.status, 'sessão encerrada');
      this.token = ((await res.json()) as PlaybackData).playbackToken;
      this.scheduleRenew();
    } catch {
      this.video.pause();
      this.fail('Sua sessão de reprodução foi encerrada. Recarregue a página para continuar.');
    }
  }

  private endSession(): void {
    if (this.token) {
      navigator.sendBeacon(`${API_URL}/v1/playback/end?t=${encodeURIComponent(this.token)}`);
      this.token = '';
    }
  }

  private readonly onPageHide = () => {
    this.heartbeat(true);
    this.endSession();
  };

  // ---------- interface ----------

  private build(): HTMLElement {
    const v = this.video;
    this.errorBox = el('div', { class: 'player-error', attrs: { role: 'alert', hidden: '' } });
    this.watermark = el('div', { class: 'watermark', attrs: { 'aria-hidden': 'true' } });
    this.playBtn = this.button('Reproduzir', '▶', () => this.togglePlay());
    this.timeLabel = el('span', { class: 'time', text: '0:00 / 0:00' });
    this.chapterLabel = el('span', { class: 'chapter-label' });

    this.seekPlayed = el('div', { class: 'seek-played' });
    this.seekBuffered = el('div', { class: 'seek-buffered' });
    this.seekTip = el('div', { class: 'seek-tip', attrs: { hidden: '' } });
    this.seekEl = el(
      'div',
      {
        class: 'seek',
        attrs: {
          role: 'slider',
          tabindex: '0',
          'aria-label': 'Posição do vídeo',
          'aria-valuemin': '0',
          'aria-valuenow': '0',
        },
      },
      this.seekBuffered,
      this.seekPlayed,
      this.seekTip,
    );
    this.wireSeek();

    this.volume = el('input', {
      class: 'volume',
      attrs: { type: 'range', min: '0', max: '1', step: '0.05', 'aria-label': 'Volume' },
    });
    this.volume.value = store.get('gv.volume') ?? '1';
    this.volume.addEventListener('input', () => {
      v.volume = Number(this.volume.value);
      v.muted = v.volume === 0;
      store.set('gv.volume', this.volume.value);
    });
    const muteBtn = this.button('Silenciar', '🔊', () => (v.muted = !v.muted));
    v.addEventListener('volumechange', () => {
      muteBtn.textContent = v.muted || v.volume === 0 ? '🔇' : '🔊';
      muteBtn.setAttribute('aria-label', v.muted ? 'Ativar som' : 'Silenciar');
    });

    this.speedBtn = this.button('Velocidade', '1×', () => undefined);
    const speedMenu = this.menu(this.speedBtn, 'Velocidade de reprodução', () =>
      RATES.map((r) => ({
        id: String(r),
        label: `${r}×`,
        checked: v.playbackRate === r,
        select: () => this.setRate(r),
      })),
    );

    this.qualityBtn = this.button('Qualidade', 'Auto', () => undefined);
    const qualityMenu = this.menu(this.qualityBtn, 'Qualidade do vídeo', () => {
      const levels = (this.hls?.levels ?? [])
        .map((l, i) => ({ i, h: l.height }))
        .sort((a, b) => b.h - a.h);
      return [
        {
          id: 'auto',
          label: 'Auto',
          checked: (this.hls?.autoLevelEnabled ?? true) === true,
          select: () => {
            if (this.hls) this.hls.currentLevel = -1;
            this.refreshQualityLabel();
          },
        },
        ...levels.map(({ i, h }) => ({
          id: `${h}p`,
          label: `${h}p`,
          checked: this.hls?.autoLevelEnabled === false && this.hls.currentLevel === i,
          select: () => {
            if (this.hls) this.hls.currentLevel = i;
            this.refreshQualityLabel();
          },
        })),
      ];
    });

    this.captionsBtn = this.button('Legendas', 'CC', () => undefined);
    const captionsMenu = this.menu(this.captionsBtn, 'Legendas', () => [
      {
        id: 'off',
        label: 'Desativadas',
        checked: !this.captionUrl,
        select: () => void this.setCaption(null),
      },
      ...(this.data?.subtitles ?? []).map((s) => ({
        id: s.lang,
        label: s.lang,
        checked: this.activeCaptionLang === s.lang,
        select: () => void this.setCaption(s.lang),
      })),
    ]);

    const fsBtn = this.button('Tela cheia', '⛶', () => this.toggleFullscreen());

    const controls = el(
      'div',
      { class: 'controls' },
      this.seekEl,
      el(
        'div',
        { class: 'controls-row' },
        this.playBtn,
        muteBtn,
        this.volume,
        this.timeLabel,
        this.chapterLabel,
        el('span', { class: 'spacer' }),
        speedMenu,
        qualityMenu,
        captionsMenu,
        fsBtn,
      ),
    );

    v.addEventListener('click', () => this.togglePlay());
    v.addEventListener('play', () => {
      this.ended = false;
      this.syncPlayBtn();
      this.heartbeat();
    });
    v.addEventListener('pause', () => {
      this.syncPlayBtn();
      this.heartbeat(true);
    });
    v.addEventListener('seeked', () => this.heartbeat(true));
    v.addEventListener('ended', () => {
      this.ended = true;
      this.syncPlayBtn();
      this.heartbeat(true);
      this.onEnded();
    });
    v.addEventListener('timeupdate', () => this.renderTime());
    v.addEventListener('progress', () => this.renderBuffered());
    v.addEventListener('durationchange', () => this.renderTime());
    v.addEventListener('ratechange', () => {
      this.speedBtn.textContent = `${v.playbackRate}×`;
    });

    const root = el(
      'div',
      { class: 'player', attrs: { tabindex: '0', 'aria-label': 'Player de vídeo' } },
      v,
      this.watermark,
      this.errorBox,
      controls,
    );
    root.addEventListener('keydown', (e) => this.onKey(e));
    return root;
  }

  private button(label: string, text: string, onClick: () => void): HTMLButtonElement {
    return el('button', {
      class: 'ctl',
      text,
      attrs: { type: 'button', 'aria-label': label, title: label },
      on: { click: onClick },
    });
  }

  /** Botão que abre uma lista de opções exclusivas (role=menuitemradio). */
  private menu(
    button: HTMLButtonElement,
    label: string,
    items: () => { id: string; label: string; checked: boolean; select: () => void }[],
  ): HTMLElement {
    const list = el('div', {
      class: 'menu',
      attrs: { role: 'menu', 'aria-label': label, hidden: '' },
    });
    const close = () => {
      list.hidden = true;
      button.setAttribute('aria-expanded', 'false');
    };
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = list.hidden;
      document.dispatchEvent(new Event('gv:close-menus'));
      if (!open) return;
      list.replaceChildren(
        ...items().map((it) =>
          el('button', {
            class: 'menu-item',
            text: it.label,
            attrs: {
              type: 'button',
              role: 'menuitemradio',
              'aria-checked': String(it.checked),
              'data-id': it.id,
            },
            on: {
              click: (ev) => {
                ev.stopPropagation();
                it.select();
                close();
              },
            },
          }),
        ),
      );
      list.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      list.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    });
    document.addEventListener('gv:close-menus', close);
    document.addEventListener('click', close);
    list.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        close();
        button.focus();
        e.stopPropagation();
      }
    });
    return el('div', { class: 'menu-wrap' }, button, list);
  }

  // ---------- controles ----------

  private togglePlay(): void {
    if (this.video.paused || this.video.ended) {
      if (this.video.ended) this.video.currentTime = 0;
      void this.video.play().catch(() => undefined);
    } else this.video.pause();
  }

  private syncPlayBtn(): void {
    const paused = this.video.paused || this.ended;
    this.playBtn.textContent = paused ? '▶' : '⏸';
    this.playBtn.setAttribute('aria-label', paused ? 'Reproduzir' : 'Pausar');
    this.playBtn.title = paused ? 'Reproduzir' : 'Pausar';
  }

  private setRate(rate: number): void {
    this.video.playbackRate = rate;
    store.set('gv.rate', String(rate));
  }

  private toggleFullscreen(): void {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void this.root.requestFullscreen?.();
  }

  private onKey(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    if (target.matches('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey) return;
    const v = this.video;
    const handled = (fn: () => void) => {
      e.preventDefault();
      fn();
    };
    switch (e.key) {
      case ' ':
        if (target.matches('button')) return; // espaço em botão = clique
        return handled(() => this.togglePlay());
      case 'k':
        return handled(() => this.togglePlay());
      case 'j':
        return handled(() => this.seek(v.currentTime - 10));
      case 'l':
        return handled(() => this.seek(v.currentTime + 10));
      case 'ArrowLeft':
        return handled(() => this.seek(v.currentTime - 5));
      case 'ArrowRight':
        return handled(() => this.seek(v.currentTime + 5));
      case 'ArrowUp':
        return handled(() => this.setVolume(v.volume + 0.1));
      case 'ArrowDown':
        return handled(() => this.setVolume(v.volume - 0.1));
      case 'm':
        return handled(() => (v.muted = !v.muted));
      case 'f':
        return handled(() => this.toggleFullscreen());
      case 'c':
        return handled(() => void this.toggleCaptions());
      case '>':
        return handled(() => this.stepRate(1));
      case '<':
        return handled(() => this.stepRate(-1));
      default:
        if (/^[0-9]$/.test(e.key)) handled(() => this.seek((this.duration * Number(e.key)) / 10));
    }
  }

  private setVolume(vol: number): void {
    this.video.volume = clamp(vol, 0, 1);
    this.video.muted = false;
    this.volume.value = String(this.video.volume);
    store.set('gv.volume', this.volume.value);
  }

  private stepRate(dir: 1 | -1): void {
    const i = RATES.findIndex((r) => r >= this.video.playbackRate - 1e-6);
    this.setRate(RATES[clamp((i < 0 ? RATES.indexOf(1) : i) + dir, 0, RATES.length - 1)]);
  }

  // ---------- barra de progresso, preview e capítulos ----------

  private wireSeek(): void {
    const timeAt = (clientX: number) => {
      const r = this.seekEl.getBoundingClientRect();
      return clamp((clientX - r.left) / r.width, 0, 1) * this.duration;
    };
    let dragging = false;
    this.seekEl.addEventListener('pointerdown', (e) => {
      dragging = true;
      this.seekEl.setPointerCapture(e.pointerId);
      this.seek(timeAt(e.clientX));
    });
    this.seekEl.addEventListener('pointermove', (e) => {
      this.showTip(timeAt(e.clientX), e.clientX);
      if (dragging) this.seek(timeAt(e.clientX));
    });
    this.seekEl.addEventListener('pointerup', () => (dragging = false));
    this.seekEl.addEventListener('pointerleave', () => (this.seekTip.hidden = true));
    this.seekEl.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowLeft' ? -5 : e.key === 'ArrowRight' ? 5 : 0;
      if (!step) return;
      e.preventDefault();
      e.stopPropagation();
      this.seek(this.video.currentTime + step);
    });
  }

  private showTip(t: number, clientX: number): void {
    const r = this.seekEl.getBoundingClientRect();
    const cue = this.sprite.find((c) => t >= c.start && t < c.end);
    const chapter = this.chapterAt(t);
    this.seekTip.replaceChildren(
      ...(cue
        ? [
            el('div', {
              class: 'seek-thumb',
              attrs: {
                style: `width:${cue.w}px;height:${cue.h}px;background:url(${cue.url}) -${cue.x}px -${cue.y}px`,
              },
            }),
          ]
        : []),
      el('div', { text: chapter ? `${fmtTime(t)} · ${chapter.title}` : fmtTime(t) }),
    );
    this.seekTip.hidden = false;
    this.seekTip.style.left = `${clamp(clientX - r.left, 80, r.width - 80)}px`;
  }

  private renderTime(): void {
    const d = this.duration;
    const t = this.video.currentTime;
    this.timeLabel.textContent = `${fmtTime(t)} / ${fmtTime(d)}`;
    this.seekPlayed.style.width = d ? `${(t / d) * 100}%` : '0';
    this.seekEl.setAttribute('aria-valuenow', String(Math.floor(t)));
    this.seekEl.setAttribute('aria-valuemax', String(Math.floor(d)));
    this.seekEl.setAttribute('aria-valuetext', `${fmtTime(t)} de ${fmtTime(d)}`);
    this.chapterLabel.textContent = this.chapterAt(t)?.title ?? '';
    this.onTimeUpdate(t);
  }

  private renderBuffered(): void {
    const b = this.video.buffered;
    const d = this.duration;
    if (!b.length || !d) return;
    this.seekBuffered.style.width = `${(b.end(b.length - 1) / d) * 100}%`;
  }

  private chapterAt(t: number) {
    const list = this.data?.chapters ?? [];
    return [...list].reverse().find((c) => t >= c.startS);
  }

  private renderChapterMarks(): void {
    const d = this.data.durationS;
    if (!d) return;
    for (const c of this.data.chapters.filter((c) => c.startS > 0)) {
      this.seekEl.append(
        el('span', { class: 'chapter-mark', attrs: { style: `left:${(c.startS / d) * 100}%` } }),
      );
    }
  }

  /** Lê o sprite.vtt (já com URL assinada) para mostrar a miniatura sob o mouse. */
  private async loadSprite(): Promise<void> {
    const res = await fetch(API_URL + this.data.spriteVttUrl);
    if (!res.ok) return;
    const text = await res.text();
    const time = (s: string) => {
      const p = s.split(':').map(Number);
      return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
    };
    const re =
      /(\d+:\d+:\d+\.\d+|\d+:\d+\.\d+) --> (\d+:\d+:\d+\.\d+|\d+:\d+\.\d+)\s*\n(\S+)#xywh=(\d+),(\d+),(\d+),(\d+)/g;
    for (const m of text.matchAll(re)) {
      this.sprite.push({
        start: time(m[1]),
        end: time(m[2]),
        url: m[3],
        x: Number(m[4]),
        y: Number(m[5]),
        w: Number(m[6]),
        h: Number(m[7]),
      });
    }
  }

  // ---------- qualidade ----------

  private currentQuality(): string | undefined {
    const level = this.hls?.levels[this.hls.currentLevel];
    return level ? `${level.height}p` : undefined;
  }

  private refreshQualityLabel(): void {
    const auto = this.hls?.autoLevelEnabled !== false;
    const q = this.currentQuality();
    this.qualityBtn.textContent = auto ? (q ? `Auto (${q})` : 'Auto') : (q ?? 'Auto');
  }

  // ---------- legendas ----------

  private get activeCaptionLang(): string | null {
    return this.video.querySelector('track')?.srclang ?? null;
  }

  /** Baixa o .vtt com o token ATUAL e o injeta como faixa (evita URL de legenda com token vencido). */
  async setCaption(lang: string | null): Promise<void> {
    this.video.querySelectorAll('track').forEach((t) => t.remove());
    if (this.captionUrl) URL.revokeObjectURL(this.captionUrl);
    this.captionUrl = undefined;
    store.set('gv.caption', lang ?? '');
    this.captionsBtn.setAttribute('aria-pressed', String(lang !== null));
    const sub = this.data.subtitles.find((s) => s.lang === lang);
    if (!sub) return;

    const res = await fetch(API_URL + withToken(sub.url, this.token));
    if (!res.ok) return;
    this.captionUrl = URL.createObjectURL(new Blob([await res.text()], { type: 'text/vtt' }));
    const track = el('track', {
      attrs: { kind: 'subtitles', srclang: sub.lang, label: sub.lang, src: this.captionUrl },
    });
    this.video.append(track);
    track.track.mode = 'showing';
  }

  private async toggleCaptions(): Promise<void> {
    if (this.captionUrl) return this.setCaption(null);
    const first = store.get('gv.caption') || this.data.subtitles[0]?.lang;
    if (first) await this.setCaption(first);
  }

  private applyStoredPreferences(): void {
    const rate = Number(store.get('gv.rate'));
    if (RATES.includes(rate)) this.video.playbackRate = rate;
    this.video.volume = Number(this.volume.value);
    const cap = store.get('gv.caption');
    if (cap && this.data.subtitles.some((s) => s.lang === cap)) void this.setCaption(cap);
  }

  // ---------- marca d'água e erros ----------

  /** Reposiciona o texto de tempos em tempos (dificulta recortar a marca de uma gravação). */
  private moveWatermark(): void {
    this.watermark.style.top = `${10 + Math.random() * 70}%`;
    this.watermark.style.left = `${5 + Math.random() * 55}%`;
  }

  private fail(message: string): void {
    this.errorBox.textContent = message;
    this.errorBox.hidden = false;
  }
}
