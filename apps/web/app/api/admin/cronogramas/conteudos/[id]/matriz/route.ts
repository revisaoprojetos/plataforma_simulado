import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkPermission, getCurrentAccess } from '@/lib/auth/permissions'
import { createAdminClient } from '@/lib/supabase/server'
import { registrarAudit } from '@/lib/audit'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { UUID_META_RE } from '@/lib/cronograma/meta-valida'
import { RegrasOverrideSchema } from '@/lib/conteudo/classificacao/esquema'
import { POR_PAGINA_MATRIZ, SITUACOES_MATRIZ, type SituacaoLinhaMatriz } from '@/lib/cronograma/matriz-gerador-tipos'
import {
  carregarMatriz, definirVisibilidade, gravarLinks, gravarSelecoes, invalidarMatriz, lerConjunto, limparSelecoes, listarDocsSeletor,
  listarPartesSeletor, vincularPelaSugestao, type ResultadoGravacao,
} from '@/lib/cronograma/matriz-gerador-server'

// MATRIZ DE AULAS do Gerador (admin › Cronogramas › Conteúdos › [conjunto]). Rota de API (server actions são rejeitadas em domínio custom).
//  GET  (sem acao)            → matriz paginada (page, pp, q, tipo, cls, sit, sort, dir)
//  GET  ?acao=documentos      → seletor de documento da Biblioteca (tipo, aula, q, disciplina, classificacao, page)
//  GET  ?acao=partes          → partes do documento (documentoId)
//  GET  ?acao=gestao          → disciplinas e plataformas (filtros de links) do tenant
//  PUT  { operacao: selecionar | limpar | visibilidade | sugerir | links | disciplina_criar | conjunto_disciplina | plataforma_criar | plataforma_renomear }
// Tenant-safe (todas as leituras/escritas filtram por tenant e validam o conjunto), auditada, invalida os caches do cronograma.
export const dynamic = 'force-dynamic'

const resp = (b: Record<string, unknown>, status = 200) => NextResponse.json(b, { status, headers: { 'Cache-Control': 'no-store' } })
const inteiro = (v: string | null, pad: number, min: number, max: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : pad }

async function guarda(perm: string) {
  if (!(await checkPermission(perm))) return null
  const a = await getCurrentAccess()
  return a.tenantId ? { tenantId: a.tenantId, atorId: a.userId ?? null } : null
}

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  const g = await guarda('cronogramas:view')
  if (!g) return resp({ ok: false, message: 'Sem permissão.' }, 403)
  const { id } = await params
  if (!UUID_META_RE.test(id)) return resp({ ok: false, message: 'Conjunto inválido.' }, 400)
  const svc = createAdminClient()
  const conjunto = await lerConjunto(svc, g.tenantId, id)
  if (!conjunto) return resp({ ok: false, message: 'Conjunto não encontrado.' }, 404)
  const sp = req.nextUrl.searchParams
  const acao = sp.get('acao')

  try {
    if (acao === 'documentos') {
      const tipo = (sp.get('tipo') ?? '').slice(0, 60)
      if (!tipo) return resp({ ok: false, message: 'Informe a seção.' }, 400)
      const r = await listarDocsSeletor(svc, g.tenantId, conjunto, {
        tipo, aula: (sp.get('aula') ?? '').slice(0, 40), q: (sp.get('q') ?? '').slice(0, 120),
        disciplina: sp.get('disciplina') === 'todas' ? 'todas' : 'conjunto',
        classificacao: sp.get('classificacao') === 'todas' ? 'todas' : 'coluna',
        page: inteiro(sp.get('page'), 1, 1, 10_000), pp: inteiro(sp.get('pp'), 8, 4, 25),
      })
      return resp({ ok: true, ...r })
    }
    if (acao === 'partes') {
      const documentoId = sp.get('documentoId') ?? ''
      if (!UUID_META_RE.test(documentoId)) return resp({ ok: false, message: 'Documento inválido.' }, 400)
      const r = await listarPartesSeletor(g.tenantId, documentoId)
      return r.ok ? resp({ ok: true, partes: r.partes }) : resp({ ok: true, partes: [], aviso: r.error })
    }
    if (acao === 'gestao') {
      const [disciplinas, plataformas, conjuntos] = await Promise.all([
        fetchAll<{ id: string; nome: string }>(() => svc.from('simulado_disciplinas').select('id, nome').eq('tenant_id', g.tenantId).order('nome').order('id') as never),
        fetchAll<{ id: string; nome: string; slug: string; ativo: boolean | null }>(() => svc.from('simulado_cronograma_plataformas').select('id, nome, slug, ativo').eq('tenant_id', g.tenantId).order('ordem').order('nome').order('id') as never),
        fetchAll<{ disciplina_id: string | null }>(() => svc.from('simulado_cronograma_conjuntos').select('disciplina_id').eq('tenant_id', g.tenantId).eq('deletado', false).order('id') as never),
      ])
      const uso = new Map<string, number>()
      for (const c of conjuntos) if (c.disciplina_id) uso.set(c.disciplina_id, (uso.get(c.disciplina_id) ?? 0) + 1)
      return resp({
        ok: true, conjunto: { id: conjunto.id, disciplina: conjunto.disciplina, disciplina_id: conjunto.disciplina_id },
        disciplinas: disciplinas.map((d) => ({ ...d, conjuntos: uso.get(d.id) ?? 0 })),
        plataformas: plataformas.filter((p) => p.slug !== 'pdf' && p.slug !== 'video').map((p) => ({ id: p.id, nome: p.nome, slug: p.slug, ativo: p.ativo !== false })),
      })
    }
    const sit = sp.get('sit') as SituacaoLinhaMatriz | null
    const pp = Number(sp.get('pp'))
    const dados = await carregarMatriz(svc, g.tenantId, conjunto, {
      page: inteiro(sp.get('page'), 1, 1, 10_000),
      pp: (POR_PAGINA_MATRIZ as readonly number[]).includes(pp) ? pp : 10,
      q: (sp.get('q') ?? '').slice(0, 120), tipo: (sp.get('tipo') ?? '').slice(0, 60), cls: (sp.get('cls') ?? '').slice(0, 60),
      sit: sit && (SITUACOES_MATRIZ as readonly string[]).includes(sit) ? sit : '',
      sort: sp.get('sort') === 'situacao' ? 'situacao' : 'aula', dir: sp.get('dir') === 'desc' ? 'desc' : 'asc',
    })
    return resp({ ok: true, ...dados })
  } catch (e) {
    return resp({ ok: false, message: (e as Error).message || 'Falha ao carregar a matriz.' }, 500)
  }
}

const Aula = z.string().max(40)
const Tipo = z.string().min(1).max(60)
const Uuid = z.string().regex(UUID_META_RE)
const Lote = { aulas: z.array(Aula).min(1).max(300), tipos: z.array(Tipo).max(30).optional() }

const Corpo = z.discriminatedUnion('operacao', [
  z.object({
    operacao: z.literal('selecionar'),
    itens: z.array(z.object({
      aula: Aula, tipo: Tipo, documentoId: Uuid, parteId: Uuid.nullable().optional(),
      rotuloAluno: z.string().max(160).nullable().optional(), visivelAluno: z.boolean().optional(),
      regrasOverride: RegrasOverrideSchema.optional(),
    })).min(1).max(300),
  }),
  z.object({ operacao: z.literal('limpar'), ...Lote }),
  z.object({ operacao: z.literal('visibilidade'), visivel: z.boolean(), ...Lote }),
  z.object({ operacao: z.literal('sugerir'), ...Lote }),
  z.object({ operacao: z.literal('links'), aulaId: Uuid, itens: z.array(z.object({ plataformaId: Uuid, url: z.string().max(2000) })).min(1).max(30) }),
  z.object({ operacao: z.literal('disciplina_criar'), nome: z.string().min(2).max(120) }),
  z.object({ operacao: z.literal('conjunto_disciplina'), disciplinaId: Uuid }),
  z.object({ operacao: z.literal('plataforma_criar'), nome: z.string().min(2).max(60) }),
  z.object({ operacao: z.literal('plataforma_renomear'), id: Uuid, nome: z.string().min(2).max(60) }),
])

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
const slugDe = (s: string) => semAcento(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)

export async function PUT(req: NextRequest, { params }: Ctx) {
  const g = await guarda('cronogramas:update')
  if (!g) return resp({ ok: false, message: 'Sem permissão.' }, 403)
  const { id } = await params
  if (!UUID_META_RE.test(id)) return resp({ ok: false, message: 'Conjunto inválido.' }, 400)
  let bruto: unknown
  try { bruto = await req.json() } catch { return resp({ ok: false, message: 'Corpo inválido.' }, 400) }
  const p = Corpo.safeParse(bruto)
  if (!p.success) return resp({ ok: false, message: p.error.issues[0]?.message ? `Dados inválidos: ${p.error.issues[0].path.join('.')} — ${p.error.issues[0].message}` : 'Dados inválidos.' }, 400)
  const svc = createAdminClient()
  const conjunto = await lerConjunto(svc, g.tenantId, id)
  if (!conjunto) return resp({ ok: false, message: 'Conjunto não encontrado.' }, 404)
  const c = { svc, tenantId: g.tenantId, atorId: g.atorId, conjunto }
  const b = p.data
  const fim = (r: ResultadoGravacao) => (r.ok ? resp({ ...r }) : resp({ ok: false, message: r.error }, r.status))

  try {
    switch (b.operacao) {
      case 'selecionar': return fim(await gravarSelecoes(c, b.itens))
      case 'limpar': return fim(await limparSelecoes(c, b.aulas, b.tipos))
      case 'visibilidade': return fim(await definirVisibilidade(c, b.aulas, b.visivel, b.tipos))
      case 'sugerir': return fim(await vincularPelaSugestao(c, b.aulas, b.tipos))
      case 'links': return fim(await gravarLinks(c, b.aulaId, b.itens))
      case 'disciplina_criar': {
        const nome = b.nome.trim().replace(/\s+/g, ' ')
        const ex = await fetchAll<{ id: string; nome: string }>(() => svc.from('simulado_disciplinas').select('id, nome').eq('tenant_id', g.tenantId).order('id') as never)
        const achada = ex.find((d) => semAcento(d.nome) === semAcento(nome))
        if (achada) return resp({ ok: true, id: achada.id, nome: achada.nome, existente: true })
        const { data, error } = await svc.from('simulado_disciplinas').insert({ tenant_id: g.tenantId, nome }).select('id, nome').single()
        if (error) return resp({ ok: false, message: error.message }, 500)
        await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_disciplinas', entidadeId: (data as { id: string }).id, depois: { nome, origem: 'matriz-gerador' } as never, atorId: g.atorId, tenantId: g.tenantId })
        return resp({ ok: true, ...(data as object) })
      }
      case 'conjunto_disciplina': {
        const { data: d } = await svc.from('simulado_disciplinas').select('id, nome').eq('id', b.disciplinaId).eq('tenant_id', g.tenantId).maybeSingle()
        if (!d) return resp({ ok: false, message: 'Disciplina não encontrada.' }, 404)
        const { error } = await svc.from('simulado_cronograma_conjuntos').update({ disciplina: (d as { nome: string }).nome, disciplina_id: b.disciplinaId, atualizado_em: new Date().toISOString() }).eq('id', id).eq('tenant_id', g.tenantId)
        if (error) return resp({ ok: false, message: error.message }, 500)
        await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_cronograma_conjuntos', entidadeId: id, antes: { disciplina: conjunto.disciplina } as never, depois: { disciplina: (d as { nome: string }).nome } as never, atorId: g.atorId, tenantId: g.tenantId })
        await invalidarMatriz(g.tenantId)
        return resp({ ok: true, nome: (d as { nome: string }).nome })
      }
      case 'plataforma_criar': {
        const nome = b.nome.trim()
        const slug = slugDe(nome)
        if (!slug) return resp({ ok: false, message: 'O nome precisa ter ao menos uma letra ou número.' }, 400)
        const { data: ult } = await svc.from('simulado_cronograma_plataformas').select('ordem').eq('tenant_id', g.tenantId).order('ordem', { ascending: false }).limit(1).maybeSingle()
        const { data, error } = await svc.from('simulado_cronograma_plataformas').insert({ tenant_id: g.tenantId, nome, slug, ordem: ((ult as { ordem?: number } | null)?.ordem ?? -1) + 1 }).select('id, nome, slug').single()
        if (error) return resp({ ok: false, message: /duplicate|unique/i.test(error.message) ? 'Já existe uma plataforma com esse nome.' : error.message }, 409)
        await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_cronograma_plataformas', entidadeId: (data as { id: string }).id, depois: { nome, slug } as never, atorId: g.atorId, tenantId: g.tenantId })
        return resp({ ok: true, ...(data as object) })
      }
      case 'plataforma_renomear': {
        const nome = b.nome.trim()
        const { error } = await svc.from('simulado_cronograma_plataformas').update({ nome, atualizado_em: new Date().toISOString() }).eq('id', b.id).eq('tenant_id', g.tenantId)
        if (error) return resp({ ok: false, message: /duplicate|unique/i.test(error.message) ? 'Já existe uma plataforma com esse nome.' : error.message }, 409)
        await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_cronograma_plataformas', entidadeId: b.id, depois: { nome } as never, atorId: g.atorId, tenantId: g.tenantId })
        return resp({ ok: true })
      }
    }
  } catch (e) {
    return resp({ ok: false, message: (e as Error).message || 'Falha ao gravar.' }, 500)
  }
}
