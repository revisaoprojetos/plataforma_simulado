import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAllByIn } from '@/lib/supabase/fetch-all'
import { resolverCfgCurseduca } from '@/lib/curseduca/cfg'
import { listarMembrosDoGrupo } from '@/lib/curseduca/client'

export type ReconItem = { email: string; nome: string | null; grupos: number[] }
export type ReconResultado = {
  ok: boolean
  error?: string
  totalCurseduca: number
  totalPlataforma: number
  faltantes: ReconItem[]
  porGrupo: { gid: number; curseduca: number; erro?: string }[]
  geradoEm: string
}

/**
 * RECONCILIAÇÃO Curseduca × plataforma: para os grupos configurados na sync, lista os membros na
 * Curseduca e confere quais NÃO existem como estudante na plataforma (por e-mail principal ou
 * secundário). Retorna o total de cada lado + a LISTA das diferenças — a comprovação pedida
 * ("diferença precisa chegar a zero"). Somente LEITURA: não cria/remove nada.
 */
export async function reconciliarCurseduca(tenantId: string, geradoEm: string): Promise<ReconResultado> {
  const vazio: ReconResultado = { ok: false, totalCurseduca: 0, totalPlataforma: 0, faltantes: [], porGrupo: [], geradoEm }
  const cfg = await resolverCfgCurseduca(tenantId)
  if (!cfg) return { ...vazio, error: 'Credenciais Curseduca não configuradas para este tenant.' }

  const svc = createAdminClient()
  // Grupos a conferir = união dos grupos das regras de sync ativas.
  const { data: regras } = await svc.from('simulado_curseduca_sync').select('grupos').eq('tenant_id', tenantId).eq('ativo', true)
  const gids = [...new Set(((regras ?? []) as any[]).flatMap((r) => (Array.isArray(r.grupos) ? r.grupos : [])).map((g: any) => Number(g)).filter((n: number) => Number.isFinite(n)))]
  if (!gids.length) return { ...vazio, error: 'Nenhum grupo configurado na sync (simulado_curseduca_sync.grupos).' }

  // 1) Membros na Curseduca (dedup por e-mail; guarda em quais grupos aparece).
  const porEmail = new Map<string, ReconItem>()
  const porGrupo: { gid: number; curseduca: number; erro?: string }[] = []
  for (const gid of gids) {
    try {
      const membros = await listarMembrosDoGrupo(cfg, gid)
      let n = 0
      for (const m of membros) {
        const email = (m.email ?? '').trim().toLowerCase()
        if (!email) continue
        n++
        const it = porEmail.get(email) ?? { email, nome: m.nome ?? null, grupos: [] }
        if (!it.grupos.includes(gid)) it.grupos.push(gid)
        porEmail.set(email, it)
      }
      porGrupo.push({ gid, curseduca: n })
    } catch (e: any) {
      porGrupo.push({ gid, curseduca: 0, erro: String(e?.message ?? e).slice(0, 160) })
    }
  }
  const emails = [...porEmail.keys()]
  if (!emails.length) return { ...vazio, ok: true, totalCurseduca: 0, totalPlataforma: 0, porGrupo }

  // 2) Quais existem na plataforma (e-mail principal OU secundário), deletado=false.
  const achados = new Set<string>()
  const ests = await fetchAllByIn<{ email: string | null }>(emails, (chunk) =>
    svc.from('simulado_estudantes').select('email').eq('tenant_id', tenantId).eq('deletado', false).in('email', chunk).order('id'))
  for (const e of ests) { const em = (e.email ?? '').trim().toLowerCase(); if (em) achados.add(em) }
  // Secundários: overlaps por chunk (best-effort; coluna pode não existir em bancos antigos).
  for (let i = 0; i < emails.length; i += 80) {
    const chunk = emails.slice(i, i + 80)
    const { data, error } = await svc.from('simulado_estudantes').select('emails_secundarios').eq('tenant_id', tenantId).eq('deletado', false).overlaps('emails_secundarios', chunk)
    if (error) break // coluna ausente → ignora esta etapa
    for (const row of (data ?? []) as any[]) for (const s of (row.emails_secundarios ?? [])) { const em = String(s).trim().toLowerCase(); if (em) achados.add(em) }
  }

  const faltantes = [...porEmail.values()].filter((it) => !achados.has(it.email)).sort((a, b) => (a.nome ?? a.email).localeCompare(b.nome ?? b.email, 'pt-BR'))
  const totalPlataforma = emails.filter((em) => achados.has(em)).length
  return { ok: true, totalCurseduca: emails.length, totalPlataforma, faltantes, porGrupo, geradoEm }
}
