// FONTE ÚNICA dos tipos de conteúdo da Biblioteca/redrive (o objeto "TYPES" da spec do handoff,
// `01-conceitos-e-regras.md §2/§5/§8` + `Entregas.dc.html`). Dirige selos, cards, menu "Novo", upload,
// permissões por tipo e (fases posteriores) o visualizador do aluno. PURO (sem server-only) → usável
// no client e no server. Cores dos selos = tokens FIXOS por tipo em globals.css (`--sel-*`).

export type KindConteudo = 'docx' | 'pdf' | 'pptx' | 'xlsx' | 'video' | 'audio'

export interface PermissaoLabels {
  /** chave técnica `ler` */ ler: { letra: string; rotulo: string }
  /** chave técnica `baixar` */ baixar: { letra: string; rotulo: string }
  /** chave técnica `grifar` */ grifar: { letra: string; rotulo: string }
}

export interface TipoConteudo {
  kind: KindConteudo
  /** Sigla curta no selo do card. */ sigla: string
  /** Rótulo humano (pt-BR). */ label: string
  /** Sufixo do token CSS do selo: usa `var(--sel-<slug>)` / `var(--sel-<slug>-bg)`. */ seloSlug: string
  /** Editável na plataforma (só DOCX tem "Abrir no editor"). */ editavel: boolean
  /** Pode vir de link externo (YouTube/Vimeo/Spotify…) além de upload. */ fonteExterna: boolean
  /** Visualizador do aluno (componente por tipo; `leitor` = iframe DOCX/PDF já existente). */
  visualizador: 'leitor' | 'pdf' | 'slides' | 'planilha' | 'video' | 'audio'
  /** Unidade de progresso/conclusão. */ unidadeProgresso: 'pagina' | 'slide' | 'aba' | 'segundo'
  /** Extensões aceitas no upload (minúsculas, com ponto). */ extensoes: string[]
  /** MIME types aceitos (prefixos casam por `startsWith`). */ mimes: string[]
  /** Rótulos das 3 chaves de permissão (variam por tipo — spec §5). */ permissoes: PermissaoLabels
}

export const TIPOS_CONTEUDO: Record<KindConteudo, TipoConteudo> = {
  docx: {
    kind: 'docx', sigla: 'DOC', label: 'Documento', seloSlug: 'docx',
    editavel: true, fonteExterna: false, visualizador: 'leitor', unidadeProgresso: 'pagina',
    extensoes: ['.docx'], mimes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    permissoes: { ler: { letra: 'L', rotulo: 'Ler na plataforma' }, baixar: { letra: 'B', rotulo: 'Baixar (PDF/DOCX)' }, grifar: { letra: 'G', rotulo: 'Grifar e anotar' } },
  },
  pdf: {
    kind: 'pdf', sigla: 'PDF', label: 'PDF',
    seloSlug: 'pdf', editavel: false, fonteExterna: false, visualizador: 'pdf', unidadeProgresso: 'pagina',
    extensoes: ['.pdf'], mimes: ['application/pdf'],
    permissoes: { ler: { letra: 'L', rotulo: 'Ler' }, baixar: { letra: 'B', rotulo: 'Baixar o PDF' }, grifar: { letra: 'G', rotulo: 'Grifar e anotar' } },
  },
  pptx: {
    kind: 'pptx', sigla: 'PPT', label: 'Apresentação',
    seloSlug: 'pptx', editavel: false, fonteExterna: false, visualizador: 'slides', unidadeProgresso: 'slide',
    extensoes: ['.pptx', '.ppt'], mimes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.ms-powerpoint'],
    permissoes: { ler: { letra: 'L', rotulo: 'Ver os slides' }, baixar: { letra: 'B', rotulo: 'Baixar (PDF ou PPTX)' }, grifar: { letra: 'G', rotulo: 'Anotar nos slides' } },
  },
  xlsx: {
    kind: 'xlsx', sigla: 'XLS', label: 'Planilha',
    seloSlug: 'xlsx', editavel: false, fonteExterna: false, visualizador: 'planilha', unidadeProgresso: 'aba',
    extensoes: ['.xlsx', '.xls'], mimes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'],
    permissoes: { ler: { letra: 'V', rotulo: 'Ver' }, baixar: { letra: 'B', rotulo: 'Baixar' }, grifar: { letra: 'E', rotulo: 'Editar cópia própria' } },
  },
  video: {
    kind: 'video', sigla: 'VID', label: 'Vídeo',
    seloSlug: 'video', editavel: false, fonteExterna: true, visualizador: 'video', unidadeProgresso: 'segundo',
    extensoes: ['.mp4', '.webm', '.mov', '.m4v'], mimes: ['video/'],
    permissoes: { ler: { letra: 'A', rotulo: 'Assistir' }, baixar: { letra: 'O', rotulo: 'Salvar offline no app' }, grifar: { letra: 'M', rotulo: 'Marcadores e notas' } },
  },
  audio: {
    kind: 'audio', sigla: 'MP3', label: 'Áudio',
    seloSlug: 'audio', editavel: false, fonteExterna: true, visualizador: 'audio', unidadeProgresso: 'segundo',
    extensoes: ['.mp3', '.m4a', '.wav', '.ogg'], mimes: ['audio/'],
    permissoes: { ler: { letra: 'O', rotulo: 'Ouvir' }, baixar: { letra: 'B', rotulo: 'Baixar MP3' }, grifar: { letra: 'M', rotulo: 'Marcadores' } },
  },
}

export const ORDEM_TIPOS: KindConteudo[] = ['docx', 'pdf', 'pptx', 'xlsx', 'video', 'audio']

/** Detecta o `kind` por nome de arquivo e/ou MIME. null = tipo não suportado. */
export function kindPorArquivo(nome: string, mime?: string): KindConteudo | null {
  const n = (nome || '').toLowerCase()
  const m = (mime || '').toLowerCase()
  for (const kind of ORDEM_TIPOS) {
    const t = TIPOS_CONTEUDO[kind]
    if (t.extensoes.some((e) => n.endsWith(e))) return kind
    if (m && t.mimes.some((pref) => m.startsWith(pref))) return kind
  }
  // .htm/.html são ingeridos como documento (viram HTML estruturado → leitor).
  if (n.endsWith('.html') || n.endsWith('.htm') || m.startsWith('text/html')) return 'docx'
  return null
}

/** Estilo inline do selo (usa os tokens fixos `--sel-*`). Ex.: `<span style={seloStyle('pdf')}>PDF</span>`. */
export function seloStyle(kind: KindConteudo): { color: string; background: string } {
  const slug = TIPOS_CONTEUDO[kind].seloSlug
  return { color: `var(--sel-${slug})`, background: `var(--sel-${slug}-bg)` }
}

/** Metadados do tipo (fallback seguro p/ docx se vier algo desconhecido). */
export function tipoDe(kind: string | null | undefined): TipoConteudo {
  return TIPOS_CONTEUDO[(kind as KindConteudo)] ?? TIPOS_CONTEUDO.docx
}
