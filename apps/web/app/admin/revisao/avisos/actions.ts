'use server'
// CS › Avisos e pop-ups — versão enxuta (faixa / banner / destaques / pop-up) sobre `simulado_banners`.
// O editor rico (recorte, degradê, estilo do pop-up) continua em /admin/configuracoes/banners.
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { registrarAudit } from '@/lib/audit'
import { hospedarBase64 } from '@/lib/storage/hospedar-base64'
import { brtLocalParaIso } from '@/lib/brt'
import { esquecer } from '@/lib/cache/relatorio-cache'
import { guardCs, isUuid } from '@/lib/admin-revisao/cs-server'
import { AVISO_LOCAIS } from '@/lib/admin-revisao/cs-tipos'

type R = { ok: boolean; error?: string; id?: string }
const MAX_IMG = 3_000_000 // ~3 MB de base64

async function limpar(tenantId: string) {
  await esquecer(`home-banners:${tenantId}`) // cache de 120 s dos banners do Início
  revalidatePath('/admin/revisao/avisos')
  revalidatePath('/admin/configuracoes/banners')
}

export async function criarAvisoAction(i: { titulo: string; local: string; grupoId?: string | null; ate?: string | null; imagem?: string | null }): Promise<R> {
  const g = await guardCs('configuracoes:manage'); if (!g.ok) return g
  const titulo = (i.titulo ?? '').trim()
  if (!titulo) return { ok: false, error: 'Escreva o texto do aviso.' }
  if (titulo.length > 200) return { ok: false, error: 'Texto muito longo (máx. 200).' }
  const loc = AVISO_LOCAIS.find((l) => l.k === i.local)
  if (!loc) return { ok: false, error: 'Escolha onde o aviso aparece.' }
  if (i.grupoId && !isUuid(i.grupoId)) return { ok: false, error: 'Grupo inválido.' }
  if (i.ate && !/^\d{4}-\d{2}-\d{2}$/.test(i.ate)) return { ok: false, error: 'Data inválida.' }
  if (i.imagem && (!i.imagem.startsWith('data:image/') || i.imagem.length > MAX_IMG)) return { ok: false, error: 'Imagem inválida ou maior que 2 MB.' }
  const svc = createAdminClient()
  const ate = i.ate ? brtLocalParaIso(`${i.ate}T23:59`) : null
  const imagem = i.imagem ? await hospedarBase64(i.imagem, svc, { tenantId: g.tenantId }) : null
  const base = { tenant_id: g.tenantId, tipo: loc.tipo, titulo, imagem_url: imagem, ativo: true, ordem: 0 }
  let r = await svc.from('simulado_banners').insert({ ...base, local: loc.k, grupo_id: i.grupoId || null, ate }).select('id').single()
  let degradado = false
  if (r.error && /column|schema cache/i.test(r.error.message)) {
    // migração pendente: grava só o que a tabela antiga entende (sem local/grupo/data) — e avisa.
    r = await svc.from('simulado_banners').insert(base).select('id').single(); degradado = true
  }
  if (r.error) return { ok: false, error: r.error.message }
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_banners', entidadeId: r.data.id, depois: { titulo, local: loc.k, grupo_id: i.grupoId ?? null, ate: i.ate ?? null } })
  await limpar(g.tenantId)
  return { ok: true, id: r.data.id, error: degradado ? 'Aviso publicado, mas "para quem" e "sai do ar" só valem após aplicar a migração 20261112040000.' : undefined }
}

export async function alternarAvisoAction(id: string, ativo: boolean): Promise<R> {
  const g = await guardCs('configuracoes:manage'); if (!g.ok) return g
  if (!isUuid(id)) return { ok: false, error: 'Aviso inválido.' }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_banners').update({ ativo: !!ativo, atualizado_em: new Date().toISOString() }).eq('tenant_id', g.tenantId).eq('id', id)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: ativo ? 'LIBERAR' : 'BLOQUEAR', entidade: 'simulado_banners', entidadeId: id, depois: { ativo: !!ativo } })
  await limpar(g.tenantId)
  return { ok: true }
}

export async function excluirAvisoAction(id: string): Promise<R> {
  const g = await guardCs('configuracoes:manage'); if (!g.ok) return g
  if (!isUuid(id)) return { ok: false, error: 'Aviso inválido.' }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_banners').delete().eq('tenant_id', g.tenantId).eq('id', id)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_banners', entidadeId: id })
  await limpar(g.tenantId)
  return { ok: true }
}
