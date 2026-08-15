import { REACOES_MASCOTE } from '@/components/mascote/mascote'

/** Opções liberadas pelo admin (tema.personalizacao_aluno) que o aluno pode escolher. */
export type OpcoesPersonalizacao = { avatares: string[]; fundos: string[]; cores: string[] }
/** Escolha atual do estudante. `perfilCapa` = fundo do card (URL de imagem OU cor #hex);
 * `perfilTexto` = cor de destaque (texto/barra/anel); `avatarCor` = cor atrás da capivara. */
export type PersonalizacaoEstudante = { avatar: string | null; perfilCapa: string | null; perfilTexto: string | null; avatarCor: string | null }

/** Todas as poses da capivara como URLs — catálogo base para o admin liberar. */
export const AVATARES_MASCOTE = REACOES_MASCOTE.map((r) => `/mascote/${r.id}.png`)

/** Paleta pronta de cores de fundo — já disponível por default (o admin pode ajustar/estender). */
export const CORES_PADRAO = [
  '#6d28d9', '#7c3aed', '#4f46e5', '#2563eb', '#0ea5e9', '#0891b2',
  '#059669', '#16a34a', '#ca8a04', '#f59e0b', '#ea580c', '#dc2626',
  '#e11d48', '#db2777', '#9333ea', '#334155', '#0f172a', '#64748b',
]

/** O fundo escolhido é uma cor (#hex) e não uma imagem? */
export const ehCorFundo = (v?: string | null): boolean => !!v && v.trim().startsWith('#')

/**
 * Lê as opções liberadas pelo admin. Default (nunca configurado): todas as poses da capivara como
 * avatares e a paleta pronta de cores; nenhum fundo de imagem (o admin adiciona/puxa do sistema).
 */
export function lerOpcoesPersonalizacao(tema: any): OpcoesPersonalizacao {
  const p = (tema?.personalizacao_aluno ?? {}) as Partial<OpcoesPersonalizacao>
  const limpar = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x) : [])
  return {
    avatares: Array.isArray(p.avatares) ? limpar(p.avatares) : AVATARES_MASCOTE,
    fundos: limpar(p.fundos),
    // Cores não são "configuração": a paleta pronta está SEMPRE disponível (+ eventuais extras salvos).
    cores: [...new Set([...CORES_PADRAO, ...limpar(p.cores)])],
  }
}

/**
 * Leitura TOLERANTE do avatar/capa do estudante — não quebra se a migração
 * (colunas avatar/perfil_capa) ainda não tiver sido aplicada.
 */
export async function lerPersonalizacaoEstudante(svc: any, estudanteId: string): Promise<PersonalizacaoEstudante> {
  const vazio = { avatar: null, perfilCapa: null, perfilTexto: null, avatarCor: null }
  try {
    const r = await svc.from('simulado_estudantes').select('avatar, perfil_capa, perfil_texto, perfil_avatar_cor').eq('id', estudanteId).maybeSingle()
    if (!r.error) return r.data ? { avatar: r.data.avatar ?? null, perfilCapa: r.data.perfil_capa ?? null, perfilTexto: r.data.perfil_texto ?? null, avatarCor: r.data.perfil_avatar_cor ?? null } : vazio
    // Colunas novas podem não existir ainda (migração não reaplicada) → lê só o básico.
    const r2 = await svc.from('simulado_estudantes').select('avatar, perfil_capa').eq('id', estudanteId).maybeSingle()
    if (r2.error || !r2.data) return vazio
    return { avatar: r2.data.avatar ?? null, perfilCapa: r2.data.perfil_capa ?? null, perfilTexto: null, avatarCor: null }
  } catch { return vazio }
}
