import { REACOES_MASCOTE } from '@/components/mascote/mascote'

/** Opções liberadas pelo admin (tema.personalizacao_aluno) que o aluno pode escolher. */
export type OpcoesPersonalizacao = { avatares: string[]; fundos: string[]; cores: string[] }
/** Adesivo (carimbo ganho) posicionado como decoração no header do perfil. x/y e TAMANHO em % da
 *  LARGURA do card (escala-invariante → a prévia bate com o perfil real); rotação em graus. */
export type PerfilAdesivo = { carimboId: string; url: string; x: number; y: number; tamanho: number; rotacao: number }

/** Escolha atual do estudante. `perfilCapa` = fundo do card (URL de imagem OU cor #hex);
 * `perfilTexto` = cor de destaque (texto/barra/anel); `avatarCor` = cor atrás da capivara;
 * `adesivos` = carimbos ganhos posicionados como decoração sobre a imagem do card. */
export type PersonalizacaoEstudante = { avatar: string | null; perfilCapa: string | null; perfilTexto: string | null; avatarCor: string | null; adesivos: PerfilAdesivo[] }

const cl = (v: number, min: number, max: number, def: number) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def)
/** Normaliza a lista de adesivos do perfil (tolerante a formatos parciais). */
export function normalizarPerfilAdesivos(raw: unknown): PerfilAdesivo[] {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, 24).map((r: any) => ({
    carimboId: typeof r?.carimboId === 'string' ? r.carimboId : '',
    url: typeof r?.url === 'string' ? r.url : '',
    x: cl(Number(r?.x), 0, 100, 50),
    y: cl(Number(r?.y), 0, 100, 50),
    tamanho: cl(Number(r?.tamanho), 4, 40, 14), // % da largura do card
    rotacao: cl(Number(r?.rotacao), -180, 180, 0),
  })).filter((a) => a.url)
}

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
  const vazio: PersonalizacaoEstudante = { avatar: null, perfilCapa: null, perfilTexto: null, avatarCor: null, adesivos: [] }
  try {
    const r = await svc.from('simulado_estudantes').select('avatar, perfil_capa, perfil_texto, perfil_avatar_cor, perfil_adesivos').eq('id', estudanteId).maybeSingle()
    if (!r.error) return r.data ? { avatar: r.data.avatar ?? null, perfilCapa: r.data.perfil_capa ?? null, perfilTexto: r.data.perfil_texto ?? null, avatarCor: r.data.perfil_avatar_cor ?? null, adesivos: normalizarPerfilAdesivos(r.data.perfil_adesivos) } : vazio
    // Colunas novas podem não existir ainda (migração não reaplicada) → cai para menos colunas.
    const r2 = await svc.from('simulado_estudantes').select('avatar, perfil_capa, perfil_texto, perfil_avatar_cor').eq('id', estudanteId).maybeSingle()
    if (!r2.error) return r2.data ? { avatar: r2.data.avatar ?? null, perfilCapa: r2.data.perfil_capa ?? null, perfilTexto: r2.data.perfil_texto ?? null, avatarCor: r2.data.perfil_avatar_cor ?? null, adesivos: [] } : vazio
    const r3 = await svc.from('simulado_estudantes').select('avatar, perfil_capa').eq('id', estudanteId).maybeSingle()
    if (r3.error || !r3.data) return vazio
    return { avatar: r3.data.avatar ?? null, perfilCapa: r3.data.perfil_capa ?? null, perfilTexto: null, avatarCor: null, adesivos: [] }
  } catch { return vazio }
}
