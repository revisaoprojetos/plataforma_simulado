// Caderno OneNote (aluno) — tipos e constantes compartilhados da casca.
// Campos novos da API (nivel, criado_em, atualizado_em, fundo, regua, ordenacao) são OPCIONAIS: tolera a ausência.

import type { Estado as AutosaveEstado } from '@/lib/aluno/notebook-autosave'
import { PALETA_FUNDO, type OrdenarPor, type Regua } from '@/lib/aluno/notebook-tipos'

export type Secao = {
  id: string; nome: string; cor?: string | null; ordem: number; tipo: string; qtd_paginas: number
  ordenar_por?: Ordenacao | null
}
export type Pagina = {
  id: string; secao_id: string; titulo: string; tipo_pagina?: string; ordem: number
  nivel?: number | null; criado_em?: string | null; atualizado_em?: string | null
  fundo?: string | null; regua?: string | null
}
export type Arvore = { notebook?: { id: string; titulo: string }; secoes: Secao[]; paginas: Pagina[] }
export type Selecao = { tipo: 'pagina'; id: string } | { tipo: 'auto'; secaoId: string; auto: 'erros' | 'favoritos' } | null

export type Ordenacao = OrdenarPor
export const ROTULO_ORDENACAO: Record<Ordenacao, string> = {
  manual: 'Manual', criacao: 'Data de criação', modificacao: 'Última modificação', titulo: 'Título',
}

export const ehAuto = (s: Pick<Secao, 'tipo'>) => s.tipo === 'auto_erros' || s.tipo === 'auto_favoritos'

/** Paleta fixa de seção (identidade da seção: dado, não tema). `texto` = cor legível sobre a cor cheia. */
export const PALETA_SECAO = [
  { chave: 'roxo', nome: 'Roxo', cor: '#7b4bc4', texto: '#ffffff' },
  { chave: 'azul', nome: 'Azul', cor: '#2f6fd1', texto: '#ffffff' },
  { chave: 'ciano', nome: 'Ciano', cor: '#1b9aaa', texto: '#ffffff' },
  { chave: 'verde', nome: 'Verde', cor: '#2f9e5b', texto: '#ffffff' },
  { chave: 'lima', nome: 'Lima', cor: '#8bc34a', texto: '#1b2a05' },
  { chave: 'amarelo', nome: 'Amarelo', cor: '#f1c232', texto: '#2b2200' },
  { chave: 'laranja', nome: 'Laranja', cor: '#f08a24', texto: '#2b1500' },
  { chave: 'vermelho', nome: 'Vermelho', cor: '#d64545', texto: '#ffffff' },
  { chave: 'rosa', nome: 'Rosa', cor: '#d9549a', texto: '#ffffff' },
  { chave: 'magenta', nome: 'Magenta', cor: '#a8329c', texto: '#ffffff' },
  { chave: 'marrom', nome: 'Marrom', cor: '#8d6249', texto: '#ffffff' },
  { chave: 'grafite', nome: 'Grafite', cor: '#5f6b7a', texto: '#ffffff' },
  { chave: 'indigo', nome: 'Índigo', cor: '#4a55c4', texto: '#ffffff' },
  { chave: 'turquesa', nome: 'Turquesa', cor: '#26a69a', texto: '#ffffff' },
  { chave: 'salmao', nome: 'Salmão', cor: '#ef7f6c', texto: '#2b0d08' },
  { chave: 'oliva', nome: 'Oliva', cor: '#7d8a2e', texto: '#ffffff' },
] as const
export type CorSecao = (typeof PALETA_SECAO)[number]

/** Cor da seção: chave guardada ou, se ausente/desconhecida, uma cor automática estável pela posição. */
export function corDaSecao(s: Pick<Secao, 'cor'>, indice: number): CorSecao {
  return PALETA_SECAO.find((c) => c.chave === s.cor) ?? PALETA_SECAO[((indice % PALETA_SECAO.length) + PALETA_SECAO.length) % PALETA_SECAO.length]
}
/** Próxima cor automática para uma seção nova (a menos usada). */
export function proximaCorSecao(secoes: Secao[]): string {
  const uso = new Map<string, number>(PALETA_SECAO.map((c) => [c.chave, 0]))
  secoes.forEach((s, i) => { const k = corDaSecao(s, i).chave; uso.set(k, (uso.get(k) ?? 0) + 1) })
  return [...uso.entries()].sort((a, b) => a[1] - b[1])[0][0]
}

/** Cores de página: chaves de PALETA_FUNDO (servidor) -> token CSS `--nb-fundo-<chave>` (definido em onenote-app.tsx a partir dos tokens do tema). */
export const CORES_PAGINA = [{ chave: 'padrao', rotulo: 'Automático' }, ...PALETA_FUNDO] as const
export const tokenFundo = (chave?: string | null): string | null => (chave && PALETA_FUNDO.some((c) => c.chave === chave) ? `var(--nb-fundo-${chave})` : null)

/** Linhas de régua / grade: chaves de REGUAS (servidor); passo em px. `nenhuma` = null no servidor. */
export const REGUAS_UI: { chave: Regua | 'nenhuma'; nome: string; passo: number; grade: boolean }[] = [
  { chave: 'nenhuma', nome: 'Sem linhas', passo: 0, grade: false },
  { chave: 'estreita', nome: 'Régua estreita', passo: 22, grade: false },
  { chave: 'media', nome: 'Régua média', passo: 28, grade: false },
  { chave: 'larga', nome: 'Régua larga', passo: 36, grade: false },
  { chave: 'extra', nome: 'Régua extra larga', passo: 48, grade: false },
  { chave: 'grade_p', nome: 'Grade pequena', passo: 16, grade: true },
  { chave: 'grade_m', nome: 'Grade média', passo: 24, grade: true },
  { chave: 'grade_g', nome: 'Grade grande', passo: 32, grade: true },
]

export type EstadoSalvo = {
  fase: AutosaveEstado['fase']
  online: boolean; semPersistencia: boolean; retry: () => void
}

export const FONTE_UI = "'Segoe UI', system-ui, -apple-system, 'Plus Jakarta Sans', sans-serif"

export { novoUuid as uuid } from '@/lib/aluno/notebook-uuid'

/** "segunda-feira, 23 de novembro de 2026  14:32" */
export function dataHoraPagina(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date()
  if (Number.isNaN(d.getTime())) return ''
  const data = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' })
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
  return `${data}  ${hora}`
}

export type AutosaveApi = { flush: () => Promise<void>; setVersaoBase: (versao: number) => void }

/** Opções da variante OneNote dos corpos de página (editor-pagina / corpo-folha). */
export type OpcoesOneNote = {
  variante?: 'padrao' | 'onenote'
  criadoEm?: string | null
  onEstado?: (e: EstadoSalvo) => void
  onEditor?: (ed: import('@tiptap/react').Editor | null) => void
  /** Expõe o autosave da página aberta (flush + setVersaoBase) para a casca atualizar a versão-base sem remontar o editor. */
  onAutosave?: (api: AutosaveApi | null) => void
}

/** Layout responsivo: mobile <768, tablet 768-1023, desktop >=1024. */
export type ModoTela = 'mobile' | 'tablet' | 'desktop'
