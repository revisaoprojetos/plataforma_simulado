import { NextResponse, type NextRequest } from 'next/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { lerOpcoesPersonalizacao, normalizarPerfilAdesivos } from '@/lib/aluno/personalizacao'
import { carimbosGanhosDoAluno } from '@/lib/leitura/carimbos'

export const dynamic = 'force-dynamic'

/**
 * Salva a personalização do perfil do aluno (avatar, fundo do card, cores, adesivos de decoração).
 * Escopado ao estudante da sessão (sem IDOR) e validado contra as opções liberadas pelo admin / os
 * adesivos que o aluno GANHOU. Atualização PARCIAL: só toca os campos presentes no corpo.
 */
export async function POST(req: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  let body: Record<string, unknown> = {}
  try { body = (await req.json()) ?? {} } catch { /* corpo vazio */ }
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k)
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null)

  const svc = createAdminClient()
  const { data: temaRow } = await svc.from('simulado_tenants').select('tema').eq('id', sessao.tenantId).maybeSingle()
  const op = lerOpcoesPersonalizacao(temaRow?.tema)
  const coresTexto = new Set([...op.cores, '#ffffff', '#000000'])

  const patch: Record<string, unknown> = {}
  if (has('avatar')) {
    const avatar = str(body.avatar)
    if (avatar && !op.avatares.includes(avatar)) return NextResponse.json({ error: 'Avatar indisponível' }, { status: 400 })
    patch.avatar = avatar
  }
  if (has('perfilCapa')) {
    const perfilCapa = str(body.perfilCapa)
    if (perfilCapa && !op.fundos.includes(perfilCapa) && !op.cores.includes(perfilCapa)) return NextResponse.json({ error: 'Fundo indisponível' }, { status: 400 })
    patch.perfil_capa = perfilCapa
  }
  if (has('perfilTexto')) {
    const perfilTexto = str(body.perfilTexto)
    if (perfilTexto && !coresTexto.has(perfilTexto)) return NextResponse.json({ error: 'Cor de texto indisponível' }, { status: 400 })
    patch.perfil_texto = perfilTexto
  }
  if (has('avatarCor')) {
    const avatarCor = str(body.avatarCor)
    if (avatarCor && !op.cores.includes(avatarCor)) return NextResponse.json({ error: 'Cor indisponível' }, { status: 400 })
    patch.perfil_avatar_cor = avatarCor
  }
  if (has('perfilAdesivos')) {
    // Só os adesivos que o aluno realmente GANHOU (por carimboId); URL resolvida no server.
    const ganhos = await carimbosGanhosDoAluno(svc, sessao.tenantId, sessao.estudanteId)
    const urlPorId = new Map(ganhos.filter((g) => g.def.url).map((g) => [g.def.id, g.def.url as string]))
    patch.perfil_adesivos = normalizarPerfilAdesivos(body.perfilAdesivos)
      .filter((a) => urlPorId.has(a.carimboId))
      .map((a) => ({ ...a, url: urlPorId.get(a.carimboId)! }))
  }
  if (!Object.keys(patch).length) return NextResponse.json({ ok: true })

  // Tolerância à migração: se a coluna nova faltar, remove-a do patch e tenta de novo.
  const tentar = async (p: Record<string, unknown>) => (await svc.from('simulado_estudantes').update(p).eq('id', sessao.estudanteId).eq('tenant_id', sessao.tenantId)).error as { message?: string } | null
  let error = await tentar(patch)
  for (const col of ['perfil_adesivos', 'perfil_texto', 'perfil_avatar_cor']) {
    if (error && new RegExp(col, 'i').test(String(error.message ?? '')) && col in patch) { delete patch[col]; error = Object.keys(patch).length ? await tentar(patch) : null }
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
