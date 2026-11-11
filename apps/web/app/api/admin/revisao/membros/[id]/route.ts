import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { esquecer, chaveRelatorio } from '@/lib/cache/relatorio-cache'
import { NADA } from '@/lib/admin-revisao/cs'
import { isUuid, limparCachesCs } from '@/lib/admin-revisao/cs-server'
import { carregarFicha, limparFicha } from '@/lib/admin-revisao/membro-ficha'
import { FICHA_ABAS, type FichaAba } from '@/lib/admin-revisao/ficha-tipos'
import { alternarBloqueioAction, liberarAcessoAction, removerMembroAction, tirarDoGrupoAction } from '@/app/admin/revisao/membros/actions'
import { editarEstudanteAction } from '@/app/admin/estudantes/actions'
import { ehCpfMascarado } from '@/lib/privacidade/cpf'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }

// GET /api/admin/revisao/membros/[id]?aba=resumo|cadastro|acessos|plano|desempenho|leitura|atendimento|historico
export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const access = await getCurrentAccess()
  if (!accessCan(access, 'estudantes:view')) return NextResponse.json({ error: 'sem_permissao' }, { status: 403 })
  if (!isUuid(id)) return NextResponse.json({ error: 'id_invalido' }, { status: 400 })
  const aba = (new URL(req.url).searchParams.get('aba') ?? 'resumo') as FichaAba
  if (!FICHA_ABAS.some((a) => a.id === aba)) return NextResponse.json({ error: 'aba_invalida' }, { status: 400 })
  try {
    const dados = await carregarFicha(access.tenantId ?? NADA, id, aba)
    if (dados == null) return NextResponse.json({ error: 'nao_encontrado' }, { status: 404 })
    return NextResponse.json({ aba, dados })
  } catch (e: any) {
    return NextResponse.json({ error: 'falha', message: String(e?.message ?? e).slice(0, 200) }, { status: 500 })
  }
}

const EMAIL = /^\S+@\S+\.\S+$/
const dig = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')

// POST: { acao: 'bloqueio' | 'tirar' | 'liberar' | 'remover' | 'editar', ... } — cada ação faz seu checkPermission.
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ ok: false, error: 'Aluno inválido.' }, { status: 400 })
  const b = await req.json().catch(() => ({}))
  const access = await getCurrentAccess()
  const t = access.tenantId ?? NADA
  let r: { ok?: boolean; error?: string; [k: string]: unknown }
  switch (b?.acao) {
    case 'bloqueio': r = await alternarBloqueioAction(id); break
    case 'tirar': r = await tirarDoGrupoAction(id, String(b.grupoId ?? '')); break
    case 'liberar': r = await liberarAcessoAction(id, String(b.grupoId ?? '')); break
    case 'remover': r = await removerMembroAction(id); break
    case 'editar': {
      if (!accessCan(access, 'estudantes:update')) return NextResponse.json({ ok: false, error: 'Você não tem permissão para editar.' }, { status: 403 })
      const nome = String(b.nome ?? '').trim(), email = String(b.email ?? '').trim()
      const cpf = b.cpf == null ? undefined : String(b.cpf).trim()
      const tel = String(b.telefone ?? '').trim(), nasc = String(b.dataNascimento ?? '').trim()
      if (nome.length < 2) return NextResponse.json({ ok: false, error: 'Informe o nome.' })
      if (!EMAIL.test(email)) return NextResponse.json({ ok: false, error: 'Confira o e-mail.' })
      if (cpf && !ehCpfMascarado(cpf) && dig(cpf).length !== 11) return NextResponse.json({ ok: false, error: 'CPF deve ter 11 dígitos.' })
      if (tel && (dig(tel).length < 8 || dig(tel).length > 15)) return NextResponse.json({ ok: false, error: 'Telefone inválido (8 a 15 dígitos).' })
      if (nasc && !/^\d{4}-\d{2}-\d{2}$/.test(nasc)) return NextResponse.json({ ok: false, error: 'Data de nascimento inválida.' })
      const cls = String(b.classificacao ?? '')
      if (cls && !['normal', 'passaporte', 'vitalicio'].includes(cls)) return NextResponse.json({ ok: false, error: 'Classificação inválida.' })
      const e = await editarEstudanteAction(id, { nome, email, cpf, telefone: tel || null, data_nascimento: nasc || null, classificacao: cls || null, matricula_externa: String(b.matriculaExterna ?? '').trim() || null })
      r = 'error' in e && e.error ? { ok: false, error: e.error } : { ok: true }
      break
    }
    default: return NextResponse.json({ ok: false, error: 'Ação inválida.' }, { status: 400 })
  }
  if (r.ok) { await limparFicha(t, id); await limparCachesCs(t); await esquecer(chaveRelatorio(t, 'estudantes-kpis')) }
  return NextResponse.json(r)
}
