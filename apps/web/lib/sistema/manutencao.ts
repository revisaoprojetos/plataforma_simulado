import { createAdminClient } from '@/lib/supabase/server'

/** Configuração de manutenção da PLATAFORMA (bloqueia o portal do aluno, não o simulado em andamento). */
export type ManutencaoSistema = {
  ativo: boolean
  inicio: string | null // ISO
  fim: string | null // ISO
  avisos: number[] // minutos ANTES do início p/ notificar o aluno (ex.: [10, 5, 1])
  titulo: string
  mensagem: string
}

export const MANUTENCAO_DEFAULT: ManutencaoSistema = {
  ativo: false,
  inicio: null,
  fim: null,
  avisos: [10, 5, 1],
  titulo: 'Plataforma em manutenção',
  mensagem: 'Estamos realizando uma manutenção rápida para melhorar sua experiência. Já já voltamos — obrigado pela paciência!',
}

/** Higieniza qualquer objeto cru vindo do banco para o formato canônico. */
export function normalizarManutencao(raw: unknown): ManutencaoSistema {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  let avisos = Array.isArray(r.avisos)
    ? (r.avisos as unknown[]).map((n) => Math.round(Number(n))).filter((n) => Number.isFinite(n) && n > 0 && n <= 1440)
    : [...MANUTENCAO_DEFAULT.avisos]
  avisos = [...new Set(avisos)].sort((a, b) => b - a)
  if (!avisos.length) avisos = [...MANUTENCAO_DEFAULT.avisos]
  const str = (v: unknown, fb: string) => (typeof v === 'string' && v.trim() ? v : fb)
  return {
    ativo: !!r.ativo,
    inicio: typeof r.inicio === 'string' && r.inicio ? r.inicio : null,
    fim: typeof r.fim === 'string' && r.fim ? r.fim : null,
    avisos,
    titulo: str(r.titulo, MANUTENCAO_DEFAULT.titulo),
    mensagem: str(r.mensagem, MANUTENCAO_DEFAULT.mensagem),
  }
}

/** Está em manutenção AGORA? (ativo + dentro da janela; janela "aberta" se início/fim ausentes). */
export function emManutencaoAgora(m: ManutencaoSistema, nowMs = Date.now()): boolean {
  if (!m.ativo) return false
  const ini = m.inicio ? Date.parse(m.inicio) : NaN
  const fim = m.fim ? Date.parse(m.fim) : NaN
  if (!Number.isNaN(ini) && nowMs < ini) return false
  if (!Number.isNaN(fim) && nowMs > fim) return false
  return true
}

/**
 * Lê a config de manutenção do tenant ativo. Seleciona só o caminho jsonb
 * (`tema->manutencao_sistema`) para NÃO puxar os logos base64 do tema.
 * Fail-open: qualquer erro → default (não em manutenção) para nunca trancar
 * a plataforma por um bug de leitura.
 */
export async function getManutencaoSistema(): Promise<ManutencaoSistema> {
  try {
    const svc = createAdminClient()
    const { data } = await svc
      .from('simulado_tenants')
      .select('m:tema->manutencao_sistema')
      .eq('ativo', true)
      .limit(1)
      .single()
    return normalizarManutencao((data as { m?: unknown } | null)?.m)
  } catch {
    return MANUTENCAO_DEFAULT
  }
}
