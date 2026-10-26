// Config por tipo da PÁGINA DE GERENCIAMENTO DO CONTEÚDO (handoff 03b §3 + objeto TYPES do protótipo
// `Entregas.dc.html`). Fonte ÚNICA que dirige a página `/admin/biblioteca/conteudo/[id]/gerenciar`
// (uma página que se adapta ao tipo). Complementa `tipos-conteudo.ts` (selo/sigla/permissões base).
// PURO (sem server-only) → client e server. NÃO inventar valores: tudo vem da matriz §3 da spec.

import type { KindConteudo } from '@/lib/biblioteca/tipos-conteudo'

export interface AcaoTopo { label: string; acao: string } // acao: identificador do handler (editor/exportar-pdf/substituir/ocr/...).
export interface ConfigRow {
  tipo: 'perm' | 'sw' | 'op'
  id: string
  titulo: string
  sub?: string
  /** para 'op': opções [valor,label]; valor default em `padrao`. */
  opcoes?: [string, string][]
  padrao?: string | boolean
}
export interface GestaoTipo {
  kind: KindConteudo
  /** Rótulo do topo, ex.: "DOCUMENTO DOCX", "VIDEOAULA MP4". */ rotuloTopo: string
  ext: string
  /** Ações do topo (além de Copiar link e Ver como aluno/Pré-visualizar). */ acoesTopo: AcaoTopo[]
  /** DOCX/PDF/PPT/XLS = 'aluno' (Ver como aluno); vídeo/áudio = 'previa' (Pré-visualizar → Fonte e link). */
  verAluno: 'aluno' | 'previa'
  /** Legenda das letras de permissão (spec §5). */ legendaPerms: string
  /** 5 KPIs (Visão geral). */ kpis: [string, string, string, string, string]
  /** 4 hints dos KPIs 2–5. */ hints: [string, string, string, string]
  /** Título + 5 etapas do funil. */ funilTitulo: string; funil: [string, string, string, string, string]
  /** 3 colunas específicas da tabela Alunos. */ colsAlunos: [string, string, string]
  /** Rótulo do botão "+1" por aluno. */ maisUm: string
  /** Aba de análise por unidade. */ abaTipo: { tab: string; titulo: string; sub: string }
  /** Verbos do registro de acessos (spec §3). */ verbos: { abrir: string; baixar: string; grifar: string; bloqueio: string }
  /** Bloco de configuração específico do tipo. */ configBloco: { titulo: string; sub: string; rows: ConfigRow[] }
  /** Texto da migração de marcações entre versões. */ migracao: string
  /** Rótulo do limite (downloads vs aparelhos offline). */ rotuloLimite: string
}

const PERM_ROWS_PADRAO: ConfigRow = { tipo: 'perm', id: 'perm', titulo: 'Permissões padrão de novas entregas', sub: 'Usado em entregas avulsas e individuais' }

export const GESTAO_TIPOS: Record<KindConteudo, GestaoTipo> = {
  docx: {
    kind: 'docx', rotuloTopo: 'DOCUMENTO DOCX', ext: 'DOCX', verAluno: 'aluno',
    acoesTopo: [{ label: 'Abrir no editor', acao: 'editor' }, { label: 'Exportar PDF', acao: 'exportar-pdf' }],
    legendaPerms: 'L = ler na plataforma · B = baixar · G = grifar e anotar.',
    kpis: ['Abriram', 'Visualizações', 'Downloads', 'Tempo médio', 'Concluíram'],
    hints: ['por aluno que abriu', 'alunos baixaram', 'no leitor, por aluno', 'leram até o fim'],
    funilTitulo: 'Funil de leitura deste conteúdo', funil: ['Liberado', 'Abriram', 'Leram 50%+', 'Concluíram', 'Baixaram'],
    colsAlunos: ['Visual.', 'Downloads', 'Leitura'], maisUm: '+1 download',
    abaTipo: { tab: 'Páginas', titulo: 'Até onde os alunos leram', sub: '% dos alunos que chegaram em cada página · grifos por página' },
    verbos: { abrir: 'Abriu no leitor', baixar: 'Baixou DOCX', grifar: 'Grifou trechos', bloqueio: 'Tentou imprimir' },
    configBloco: { titulo: 'Documento', sub: 'Leitura e download do DOCX', rows: [PERM_ROWS_PADRAO,
      { tipo: 'op', id: 'formato_dl', titulo: 'Formato do download', sub: 'gerado com marca d’água', opcoes: [['pdf', 'PDF'], ['docx', 'DOCX'], ['ambos', 'Os dois']], padrao: 'ambos' },
      { tipo: 'sw', id: 'grifos', titulo: 'Grifos e anotações', sub: 'Grifos de cor e notas no Caderno do aluno', padrao: true },
      { tipo: 'sw', id: 'sync_editor', titulo: 'Sincronizar com o editor', sub: 'Ao salvar no editor, gera uma nova versão em rascunho', padrao: true },
      { tipo: 'sw', id: 'offline', titulo: 'Leitura offline no app', sub: 'Arquivo criptografado, expira junto com o acesso', padrao: true }] },
    migracao: 'Migrar grifos para a nova versão', rotuloLimite: 'Limite de downloads por aluno',
  },
  pdf: {
    kind: 'pdf', rotuloTopo: 'ARQUIVO PDF', ext: 'PDF', verAluno: 'aluno',
    acoesTopo: [{ label: 'Substituir PDF', acao: 'substituir' }, { label: 'Reprocessar OCR', acao: 'ocr' }],
    legendaPerms: 'L = ler · B = baixar o PDF · G = grifar e anotar sobre o PDF.',
    kpis: ['Abriram', 'Visualizações', 'Downloads', 'Tempo médio', 'Concluíram'],
    hints: ['por aluno que abriu', 'alunos baixaram', 'no leitor de PDF', 'leram até o fim'],
    funilTitulo: 'Funil de leitura do PDF', funil: ['Liberado', 'Abriram', 'Leram 50%+', 'Concluíram', 'Baixaram'],
    colsAlunos: ['Visual.', 'Downloads', 'Leitura'], maisUm: '+1 download',
    abaTipo: { tab: 'Páginas', titulo: 'Até onde os alunos leram', sub: '% dos alunos que chegaram em cada página · grifos por página' },
    verbos: { abrir: 'Abriu o PDF', baixar: 'Baixou PDF', grifar: 'Grifou trechos', bloqueio: 'Tentou imprimir' },
    configBloco: { titulo: 'PDF', sub: 'Leitura, OCR e download', rows: [PERM_ROWS_PADRAO,
      { tipo: 'sw', id: 'ocr', titulo: 'Texto pesquisável (OCR)', sub: 'Permite busca e grifo em páginas escaneadas', padrao: true },
      { tipo: 'op', id: 'arq_dl', titulo: 'Arquivo do download', sub: 'o original não sai da plataforma sem marca', opcoes: [['marca', 'Com marca d’água'], ['orig', 'Original']], padrao: 'marca' },
      { tipo: 'sw', id: 'caneta', titulo: 'Anotação à mão (caneta)', sub: 'No app em tablet', padrao: true },
      { tipo: 'sw', id: 'offline', titulo: 'Leitura offline no app', sub: 'Arquivo criptografado, expira junto com o acesso', padrao: true }] },
    migracao: 'Reposicionar grifos no novo PDF', rotuloLimite: 'Limite de downloads por aluno',
  },
  pptx: {
    kind: 'pptx', rotuloTopo: 'APRESENTAÇÃO POWERPOINT', ext: 'PPTX', verAluno: 'aluno',
    acoesTopo: [{ label: 'Substituir PPTX', acao: 'substituir' }, { label: 'Gerar PDF dos slides', acao: 'pdf-slides' }],
    legendaPerms: 'L = ver os slides · B = baixar (PDF ou PPTX) · G = grifar e anotar nos slides.',
    kpis: ['Abriram', 'Visualizações', 'Downloads', 'Tempo médio', 'Viram todos os slides'],
    hints: ['por aluno que abriu', 'alunos baixaram', 'na apresentação', 'chegaram ao último slide'],
    funilTitulo: 'Funil da apresentação', funil: ['Liberado', 'Abriram', 'Viram 50%+', 'Viram todos', 'Baixaram'],
    colsAlunos: ['Visual.', 'Downloads', 'Slides'], maisUm: '+1 download',
    abaTipo: { tab: 'Slides', titulo: 'Até onde os alunos foram', sub: '% dos alunos que chegaram em cada slide · tempo médio no slide' },
    verbos: { abrir: 'Abriu a apresentação', baixar: 'Baixou PDF dos slides', grifar: 'Anotou slides', bloqueio: 'Tentou imprimir' },
    configBloco: { titulo: 'Apresentação', sub: 'Exibição dos slides e download', rows: [PERM_ROWS_PADRAO,
      { tipo: 'op', id: 'modo', titulo: 'Modo de exibição', sub: 'como o aluno navega', opcoes: [['slides', 'Slide a slide'], ['rolagem', 'Rolagem']], padrao: 'slides' },
      { tipo: 'sw', id: 'notas', titulo: 'Mostrar anotações do apresentador', sub: 'Abaixo de cada slide', padrao: false },
      { tipo: 'sw', id: 'animacoes', titulo: 'Manter animações e transições', sub: 'No navegador; no app os slides aparecem montados', padrao: true },
      { tipo: 'op', id: 'formato_dl', titulo: 'Formato do download', sub: 'com marca d’água', opcoes: [['pdf', 'PDF'], ['pptx', 'PPTX'], ['ambos', 'Os dois']], padrao: 'pdf' }] },
    migracao: 'Manter anotações por slide', rotuloLimite: 'Limite de downloads por aluno',
  },
  xlsx: {
    kind: 'xlsx', rotuloTopo: 'PLANILHA EXCEL', ext: 'XLSX', verAluno: 'aluno',
    acoesTopo: [{ label: 'Substituir XLSX', acao: 'substituir' }, { label: 'Editar abas visíveis', acao: 'abas' }],
    legendaPerms: 'V = ver na plataforma · B = baixar · E = editar uma cópia própria (não altera o original).',
    kpis: ['Abriram', 'Visualizações', 'Downloads', 'Tempo médio', 'Editaram a cópia'],
    hints: ['por aluno que abriu', 'alunos baixaram', 'na planilha', 'preencheram os exercícios'],
    funilTitulo: 'Funil da planilha', funil: ['Liberado', 'Abriram', 'Viram 2+ abas', 'Editaram cópia', 'Baixaram'],
    colsAlunos: ['Visual.', 'Downloads', 'Abas vistas'], maisUm: '+1 download',
    abaTipo: { tab: 'Abas', titulo: 'Uso de cada aba', sub: '% dos alunos que abriram cada aba · células editadas na cópia' },
    verbos: { abrir: 'Abriu a planilha', baixar: 'Baixou XLSX', grifar: 'Editou a cópia', bloqueio: 'Tentou copiar o gabarito' },
    configBloco: { titulo: 'Planilha', sub: 'Abas, fórmulas e cópia do aluno', rows: [PERM_ROWS_PADRAO,
      { tipo: 'op', id: 'abas', titulo: 'Abas visíveis', sub: 'as demais ficam só para a equipe', opcoes: [['todas', 'Todas'], ['sem_gabarito', 'Sem “Gabarito”']], padrao: 'sem_gabarito' },
      { tipo: 'sw', id: 'formulas', titulo: 'Mostrar fórmulas', sub: 'O aluno vê como o cálculo foi feito', padrao: true },
      { tipo: 'sw', id: 'copia', titulo: 'Cópia própria editável', sub: 'Cada aluno tem a sua, salva na conta', padrao: true },
      { tipo: 'op', id: 'formato_dl', titulo: 'Formato do download', sub: 'com marca d’água', opcoes: [['xlsx', 'XLSX'], ['csv', 'CSV'], ['pdf', 'PDF']], padrao: 'xlsx' }] },
    migracao: 'Levar a cópia do aluno para a nova versão', rotuloLimite: 'Limite de downloads por aluno',
  },
  video: {
    kind: 'video', rotuloTopo: 'VIDEOAULA MP4', ext: 'MP4', verAluno: 'previa',
    acoesTopo: [{ label: 'Editar capítulos', acao: 'capitulos' }, { label: 'Editar legendas', acao: 'legendas' }],
    legendaPerms: 'A = assistir na plataforma · O = salvar offline no app · M = criar marcadores e notas no tempo do vídeo.',
    kpis: ['Deram play', 'Sessões', 'Salvos offline', 'Tempo médio assistido', 'Assistiram até o fim'],
    hints: ['sessões por aluno', 'alunos salvaram offline', 'do vídeo', 'chegaram ao fim'],
    funilTitulo: 'Funil da videoaula', funil: ['Liberado', 'Deram play', 'Assistiram 50%+', 'Até o fim', 'Salvaram offline'],
    colsAlunos: ['Sessões', 'Offline', 'Assistido'], maisUm: '+1 aparelho offline',
    abaTipo: { tab: 'Retenção', titulo: 'Retenção ao longo do vídeo', sub: '% dos alunos assistindo em cada trecho de 4 min · marcadores no trecho' },
    verbos: { abrir: 'Assistiu', baixar: 'Salvou offline no app', grifar: 'Criou marcadores', bloqueio: 'Tentou gravar a tela' },
    configBloco: { titulo: 'Reprodução', sub: 'Player, qualidade e acessibilidade', rows: [PERM_ROWS_PADRAO,
      { tipo: 'op', id: 'qualidade', titulo: 'Qualidade máxima', sub: 'conforme a conexão do aluno', opcoes: [['720', '720p'], ['1080', '1080p']], padrao: '1080' },
      { tipo: 'op', id: 'velocidade', titulo: 'Velocidade máxima', sub: 'no player', opcoes: [['15', '1,5×'], ['2', '2×'], ['3', '3×']], padrao: '2' },
      { tipo: 'sw', id: 'legendas', titulo: 'Legendas em português', sub: 'Geradas e revisadas · aparecem por padrão', padrao: true },
      { tipo: 'sw', id: 'capitulos', titulo: 'Capítulos e transcrição', sub: 'Capítulos · transcrição pesquisável', padrao: true }] },
    migracao: 'Manter marcadores na nova versão', rotuloLimite: 'Limite de aparelhos offline',
  },
  audio: {
    kind: 'audio', rotuloTopo: 'ÁUDIO MP3', ext: 'MP3', verAluno: 'previa',
    acoesTopo: [{ label: 'Editar transcrição', acao: 'transcricao' }, { label: 'Substituir áudio', acao: 'substituir' }],
    legendaPerms: 'O = ouvir na plataforma · B = baixar MP3 · M = criar marcadores.',
    kpis: ['Deram play', 'Sessões', 'Downloads', 'Tempo médio ouvido', 'Ouviram até o fim'],
    hints: ['sessões por aluno', 'alunos baixaram', 'do áudio', 'chegaram ao fim'],
    funilTitulo: 'Funil do áudio', funil: ['Liberado', 'Deram play', 'Ouviram 50%+', 'Até o fim', 'Baixaram'],
    colsAlunos: ['Sessões', 'Downloads', 'Ouvido'], maisUm: '+1 download',
    abaTipo: { tab: 'Retenção', titulo: 'Retenção ao longo do áudio', sub: '% dos alunos ouvindo em cada trecho · marcadores no trecho' },
    verbos: { abrir: 'Ouviu', baixar: 'Baixou MP3', grifar: 'Criou marcadores', bloqueio: 'Tentou abrir o link direto' },
    configBloco: { titulo: 'Áudio', sub: 'Reprodução e transcrição', rows: [PERM_ROWS_PADRAO,
      { tipo: 'op', id: 'velocidade', titulo: 'Velocidade máxima', sub: 'no player', opcoes: [['15', '1,5×'], ['2', '2×'], ['3', '3×']], padrao: '2' },
      { tipo: 'sw', id: 'fundo', titulo: 'Ouvir em segundo plano', sub: 'Continua tocando com o app minimizado', padrao: true },
      { tipo: 'sw', id: 'transcricao', titulo: 'Transcrição pesquisável', sub: 'Texto sincronizado com o áudio', padrao: true },
      { tipo: 'op', id: 'formato_dl', titulo: 'Download', sub: 'com marca sonora', opcoes: [['mp3', 'MP3'], ['so_offline', 'Só offline no app'], ['nao', 'Não']], padrao: 'mp3' }] },
    migracao: 'Manter marcadores na nova versão', rotuloLimite: 'Limite de downloads por aluno',
  },
}

export function gestaoDe(kind: string | null | undefined): GestaoTipo {
  return GESTAO_TIPOS[(kind as KindConteudo)] ?? GESTAO_TIPOS.docx
}
