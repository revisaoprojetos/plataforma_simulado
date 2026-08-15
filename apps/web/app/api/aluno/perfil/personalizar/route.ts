import { NextResponse, type NextRequest } from 'next/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { lerOpcoesPersonalizacao } from '@/lib/aluno/personalizacao'

export const dynamic = 'force-dynamic'

/**
 * Salva a personalização do perfil do aluno (avatar + fundo do card). Escopado ao estudante da
 * sessão assinada (sem IDOR) e validado contra as opções liberadas pelo admin (sem URL arbitrária).
 */
export async function POST(req: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  let body: { avatar?: unknown; perfilCapa?: unknown; perfilTexto?: unknown; avatarCor?: unknown } = {}
  try { body = await req.json() } catch { /* corpo vazio */ }
  const avatar = typeof body.avatar === 'string' && body.avatar ? body.avatar : null
  const perfilCapa = typeof body.perfilCapa === 'string' && body.perfilCapa ? body.perfilCapa : null
  const perfilTexto = typeof body.perfilTexto === 'string' && body.perfilTexto ? body.perfilTexto : null
  const avatarCor = typeof body.avatarCor === 'string' && body.avatarCor ? body.avatarCor : null

  const svc = createAdminClient()
  const { data: temaRow } = await svc.from('simulado_tenants').select('tema').eq('id', sessao.tenantId).maybeSingle()
  const op = lerOpcoesPersonalizacao(temaRow?.tema)
  if (avatar && !op.avatares.includes(avatar)) return NextResponse.json({ error: 'Avatar indisponível' }, { status: 400 })
  if (perfilCapa && !op.fundos.includes(perfilCapa) && !op.cores.includes(perfilCapa)) return NextResponse.json({ error: 'Fundo indisponível' }, { status: 400 })
  const coresTexto = new Set([...op.cores, '#ffffff', '#000000'])
  if (perfilTexto && !coresTexto.has(perfilTexto)) return NextResponse.json({ error: 'Cor de texto indisponível' }, { status: 400 })
  if (avatarCor && !op.cores.includes(avatarCor)) return NextResponse.json({ error: 'Cor indisponível' }, { status: 400 })

  const patch = { avatar, perfil_capa: perfilCapa, perfil_texto: perfilTexto, perfil_avatar_cor: avatarCor }
  let error: { message?: string } | null = null
  ;({ error } = await svc.from('simulado_estudantes').update(patch).eq('id', sessao.estudanteId).eq('tenant_id', sessao.tenantId))
  // Colunas novas podem não existir ainda (migração não reaplicada) → salva só o básico.
  if (error && /perfil_texto|perfil_avatar_cor/i.test(String(error.message ?? ''))) {
    ;({ error } = await svc.from('simulado_estudantes').update({ avatar, perfil_capa: perfilCapa }).eq('id', sessao.estudanteId).eq('tenant_id', sessao.tenantId))
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
