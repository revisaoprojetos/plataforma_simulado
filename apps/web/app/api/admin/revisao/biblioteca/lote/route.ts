import { NextRequest, NextResponse } from 'next/server'
import { checkPermission, getCurrentAccess } from '@/lib/auth/permissions'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAllByIn } from '@/lib/supabase/fetch-all'
import { registrarAudit } from '@/lib/audit'
import { CAMPOS_META, normalizarMetadados, validarCampoMeta, type CampoMeta } from '@/lib/conteudo/metadados'
import { limparCacheGestao } from '@/lib/admin-revisao/biblioteca-gestao'

export const dynamic = 'force-dynamic'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX = 500

// BIBLIOTECA (gestão) — edição EM MASSA de metadados (Disciplina, Assunto específico, Tribunais, Informativo, Ano, Estado de
// origem, Selos). Não existia equivalente no legado (lá só por planilha). Mesma validação/normalização da planilha
// (lib/conteudo/metadados). Campo vazio = mantém; "-" = apaga. Visibilidade/mover/excluir/arquivar REUSAM as actions do legado.
export async function POST(req: NextRequest) {
  if (!(await checkPermission('configuracoes:update'))) return NextResponse.json({ ok: false, error: 'Sem permissão.' }, { status: 403 })
  const access = await getCurrentAccess()
  if (!access.tenantId) return NextResponse.json({ ok: false, error: 'Tenant não resolvido.' }, { status: 400 })
  const b = await req.json().catch(() => ({}))
  if (b?.acao !== 'metadados') return NextResponse.json({ ok: false, error: 'Ação inválida.' }, { status: 400 })
  const ids: string[] = Array.isArray(b.ids) ? [...new Set<string>(b.ids.filter((x: unknown): x is string => typeof x === 'string' && UUID.test(x)))] : []
  if (!ids.length) return NextResponse.json({ ok: false, error: 'Selecione ao menos um conteúdo.' }, { status: 400 })
  if (ids.length > MAX) return NextResponse.json({ ok: false, error: `Máximo de ${MAX} conteúdos por vez.` }, { status: 400 })
  const valores = (b.valores && typeof b.valores === 'object' ? b.valores : {}) as Record<string, unknown>
  const aplicar: { k: CampoMeta; valor: string | number | null }[] = []
  for (const c of CAMPOS_META) {
    const bruto = String(valores[c.k] ?? '').trim()
    if (!bruto) continue
    if (bruto === '-') { aplicar.push({ k: c.k, valor: null }); continue }
    const v = validarCampoMeta(c.k, bruto)
    if (!v.ok) return NextResponse.json({ ok: false, error: v.erro }, { status: 400 })
    aplicar.push({ k: c.k, valor: v.valor })
  }
  if (!aplicar.length) return NextResponse.json({ ok: false, error: 'Preencha ao menos um campo (ou "-" para apagar).' }, { status: 400 })

  const svc = createAdminClient()
  const tenantId = access.tenantId
  const atuais = (await fetchAllByIn<any>(ids, (c) => svc.from('simulado_conteudo_documentos').select('id, metadados').eq('tenant_id', tenantId).eq('deletado', false).in('id', c).order('id', { ascending: true }), { chunk: 80 })) ?? []
  const agora = new Date().toISOString()
  let atualizados = 0
  for (let i = 0; i < atuais.length; i += 20) {
    const res = await Promise.all(atuais.slice(i, i + 20).map((d) => {
      const novo: Record<string, unknown> = { ...normalizarMetadados(d.metadados) }
      for (const a of aplicar) { if (a.valor === null) delete novo[a.k]; else novo[a.k] = a.valor }
      return svc.from('simulado_conteudo_documentos').update({ metadados: normalizarMetadados(novo), atualizado_em: agora }).eq('tenant_id', tenantId).eq('id', d.id)
    }))
    const falha = res.find((r: any) => r.error)
    if (falha) return NextResponse.json({ ok: false, error: String((falha as any).error.message || 'Falha ao gravar.'), atualizados }, { status: 500 })
    atualizados += res.length
  }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_conteudo_documentos', entidadeId: null, atorId: access.userId ?? null, tenantId, depois: { edicao_em_massa_metadados: aplicar.map((a) => a.k), documentos: atualizados } }).catch(() => {})
  limparCacheGestao(tenantId)
  return NextResponse.json({ ok: true, atualizados })
}
