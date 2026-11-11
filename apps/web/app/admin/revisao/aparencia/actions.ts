'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { esquecer } from '@/lib/cache/relatorio-cache'
import { BLOCOS_HOME_PADRAO, MENU_ALUNO, type AparenciaInput } from '@/lib/admin/revisao/aparencia-tipos'

const HEX = /^#[0-9a-f]{6}$/i
/** URL de imagem aceita: https://… ou caminho absoluto do próprio app (nunca javascript:/data:). */
const urlOk = (v: string | null) => v == null || /^(https:\/\/|\/)[^\s"'<>]*$/i.test(v)

/** Salva logo, ícone, imagem de login, cores, menu do aluno e ordem dos blocos da Início em `tenants.tema`. */
export async function salvarAparenciaRevisaoAction(input: AparenciaInput): Promise<{ ok: boolean; error?: string }> {
  const access = await getCurrentAccess()
  if (!access.tenantId || !accessCan(access, 'configuracoes:manage')) return { ok: false, error: 'Sem permissão.' }

  const cor = (v: string | null) => (v == null || v === '' ? null : HEX.test(v) ? v.toLowerCase() : undefined)
  const cp = cor(input.corPrimaria), ca = cor(input.corAccent)
  if (cp === undefined || ca === undefined) return { ok: false, error: 'Cor inválida. Use o formato #RRGGBB.' }
  for (const u of [input.logoUrl, input.faviconUrl, input.loginImagemUrl]) if (!urlOk(u)) return { ok: false, error: 'Endereço de imagem inválido.' }

  const validos = new Set(MENU_ALUNO.map((m) => m.href))
  const ocultos = [...new Set(input.ocultos.filter((h) => validos.has(h)))]
  if (ocultos.length >= MENU_ALUNO.length) return { ok: false, error: 'Deixe pelo menos um item visível no menu do aluno.' }
  const ids: string[] = BLOCOS_HOME_PADRAO.map((b) => b.id)
  const blocos = [...new Set([...input.blocos.filter((b) => ids.includes(b)), ...ids])]

  const svc = createAdminClient()
  const { data: atual } = await svc.from('simulado_tenants').select('tema').eq('id', access.tenantId).maybeSingle()
  const antes = ((atual as { tema?: Record<string, any> } | null)?.tema ?? {}) as Record<string, any>
  const tema: Record<string, any> = { ...antes }

  // Imagem: null/'' remove a chave; URL define. Cor: null remove (volta ao padrão do sistema).
  const set = (k: string, v: string | null) => { if (v) tema[k] = v; else delete tema[k] }
  set('logo_url', input.logoUrl || null)
  set('favicon', input.faviconUrl || null)
  set('cor_primaria', cp)
  set('cor_accent', ca)
  const login = { ...((antes.login as Record<string, unknown>) ?? {}) }
  if (input.loginImagemUrl) { login.fundoImagem = input.loginImagemUrl; login.fundo = 'imagem' }
  else { delete login.fundoImagem; if (login.fundo === 'imagem') login.fundo = 'gradiente' }
  tema.login = login
  tema.menu_aluno = { ...((antes.menu_aluno as Record<string, unknown>) ?? {}), ocultos }
  tema.home_blocos = blocos

  const { error } = await svc.from('simulado_tenants').update({ tema }).eq('id', access.tenantId)
  if (error) return { ok: false, error: `Não foi possível salvar: ${error.message}` }

  const pick = (t: Record<string, any>) => ({ logo_url: t.logo_url ?? null, favicon: t.favicon ?? null, cor_primaria: t.cor_primaria ?? null, cor_accent: t.cor_accent ?? null, login_fundo_imagem: t.login?.fundoImagem ?? null, menu_aluno_ocultos: t.menu_aluno?.ocultos ?? [], home_blocos: t.home_blocos ?? null })
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_tenants', entidadeId: access.tenantId, tenantId: access.tenantId, antes: { aparencia: pick(antes) }, depois: { aparencia: pick(tema) } })

  await esquecer(`portal-tenant:${access.tenantId}`).catch(() => {}) // tema/menu do portal do aluno (cache 120s)
  revalidatePath('/', 'layout')
  revalidatePath('/admin/revisao/aparencia')
  return { ok: true }
}
