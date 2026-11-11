// BLOCOS da PÁGINA do extensivo (construtor na aba Vitrine do Estúdio). Módulo PURO (sem server-only):
// tipos + normalização + `completarBlocos`, usados pelo editor (cliente) E pelo loader do aluno (servidor),
// garantindo que "o que o admin vê" = "o que o aluno vê".
//
// Persistência: tudo em simulado_produto_secoes (tabela e colunas JÁ existentes; `tipo` é text sem CHECK):
//   progresso  → card "Seu progresso / Continuar"            config {}
//   cronograma → bloco "Plano de estudo"                     config {formato, titulo, texto, cronograma_id}
//   modulos    → seção (prateleira) de módulos               config {modulo_ids[], formato, restantes, recolhivel, recolhida, agrupar_prefixo}
//   banner / carrossel → como sempre.
// `ativo=false` oculta o bloco. Sem nenhuma linha nova a página fica EXATAMENTE como antes (ver completarBlocos).
import type { VitrineLayout } from './tipos'

export type TipoBloco = 'banner' | 'carrossel' | 'progresso' | 'cronograma' | 'modulos'
export const TIPOS_NOVOS: TipoBloco[] = ['progresso', 'cronograma', 'modulos']
export const ehTipoNovo = (t: string) => TIPOS_NOVOS.includes(t as TipoBloco)

export type FormatoSecaoModulos = 'herdar' | 'grade' | 'carrossel' | 'lista' | 'trilha'
export const FORMATOS_SECAO: { v: FormatoSecaoModulos; label: string }[] = [
  { v: 'herdar', label: 'Padrão do produto' },
  { v: 'grade', label: 'Grade de cards' },
  { v: 'carrossel', label: 'Carrossel' },
  { v: 'lista', label: 'Lista' },
  { v: 'trilha', label: 'Trilha' },
]
export const formatoParaLayout = (f: FormatoSecaoModulos | undefined, padrao: VitrineLayout): VitrineLayout =>
  f === 'grade' ? 'grade' : f === 'carrossel' ? 'netflix' : f === 'lista' ? 'lista' : f === 'trilha' ? 'trilha' : padrao

export interface ConfigModulos {
  modulo_ids: string[]; formato: FormatoSecaoModulos; restantes: boolean
  recolhivel: boolean; recolhida: boolean; agrupar_prefixo: boolean
}
/** Variações visuais do bloco "Plano de estudo". */
export type VariacaoCronograma = 'card' | 'faixa' | 'lista' | 'semana'
export const VARIACOES_CRONOGRAMA: { v: VariacaoCronograma; label: string }[] = [
  { v: 'card', label: 'Card compacto' },
  { v: 'faixa', label: 'Faixa larga (banner)' },
  { v: 'lista', label: 'Lista de próximas metas' },
  { v: 'semana', label: 'Destaque da semana' },
]
export interface ConfigCronograma {
  variacao: VariacaoCronograma
  titulo: string; subtitulo: string; texto_botao: string
  mostrar_metas: boolean; mostrar_progresso: boolean; mostrar_atrasadas: boolean; mostrar_hoje: boolean; mostrar_botao: boolean
  qtd_metas: number            // 1..5
  cronograma_id: string | null // modelo do catálogo (fluxo padrão); no Adaptativo vale o plano fixado
}

export const TITULO_CRONOGRAMA_PADRAO = 'Plano de estudo'
export const TITULO_MODULOS_PADRAO = 'Módulos do curso'
export const TITULO_OUTROS_PADRAO = 'Outros módulos'

export function normConfigModulos(c: any): ConfigModulos {
  const x = c && typeof c === 'object' ? c : {}
  const ids: string[] = Array.isArray(x.modulo_ids) ? [...new Set<string>(x.modulo_ids.filter((i: unknown) => typeof i === 'string'))] : []
  const f: FormatoSecaoModulos = FORMATOS_SECAO.some((o) => o.v === x.formato) ? x.formato : 'herdar'
  return { modulo_ids: ids, formato: f, restantes: !!x.restantes, recolhivel: !!x.recolhivel, recolhida: !!x.recolhida, agrupar_prefixo: !!x.agrupar_prefixo }
}
export function normConfigCronograma(c: any): ConfigCronograma {
  const x = c && typeof c === 'object' ? c : {}
  const chamadaLegada = x.formato === 'chamada' // formato antigo "só chamada com botão"
  const bool = (v: unknown, pad: boolean) => (typeof v === 'boolean' ? v : pad)
  const q = Math.round(Number(x.qtd_metas)); 
  return {
    variacao: VARIACOES_CRONOGRAMA.some((o) => o.v === x.variacao) ? x.variacao : 'card',
    titulo: typeof x.titulo === 'string' ? x.titulo.slice(0, 120) : '',
    subtitulo: typeof x.subtitulo === 'string' ? x.subtitulo.slice(0, 200) : (typeof x.texto === 'string' ? x.texto.slice(0, 200) : ''),
    texto_botao: typeof x.texto_botao === 'string' ? x.texto_botao.slice(0, 40) : '',
    mostrar_metas: bool(x.mostrar_metas, !chamadaLegada), mostrar_progresso: bool(x.mostrar_progresso, !chamadaLegada),
    mostrar_atrasadas: bool(x.mostrar_atrasadas, !chamadaLegada), mostrar_hoje: bool(x.mostrar_hoje, !chamadaLegada),
    mostrar_botao: bool(x.mostrar_botao, true),
    qtd_metas: q >= 1 && q <= 5 ? q : 3,
    cronograma_id: typeof x.cronograma_id === 'string' && x.cronograma_id ? x.cronograma_id : null,
  }
}

/** Linha mínima de bloco (mesmo formato no editor e no servidor). */
export interface LinhaBloco { tipo: string; nome: string | null; ativo: boolean; config: any }

/**
 * Completa a lista ordenada de blocos com os blocos IMPLÍCITOS que a página sempre teve:
 *  • sem "progresso" → um no INÍCIO;
 *  • sem nenhuma seção de módulos → uma seção "Módulos do curso" (recebe todos, agrupa por prefixo, formato do produto)
 *    logo antes do primeiro banner/carrossel (ou no fim) — a ordem de antes: progresso → módulos → vitrine.
 * Produto sem blocos novos ⇒ resultado idêntico ao layout antigo.
 */
export function completarBlocos<T extends LinhaBloco>(linhas: T[], novo: (tipo: 'progresso' | 'modulos') => T): T[] {
  const out = [...linhas]
  if (!out.some((l) => l.tipo === 'modulos')) {
    const i = out.findIndex((l) => l.tipo === 'banner' || l.tipo === 'carrossel')
    out.splice(i < 0 ? out.length : i, 0, novo('modulos'))
  }
  if (!out.some((l) => l.tipo === 'progresso')) out.unshift(novo('progresso'))
  return out
}
export const configModulosImplicita = (): ConfigModulos => ({ modulo_ids: [], formato: 'herdar', restantes: true, recolhivel: false, recolhida: false, agrupar_prefixo: true })
