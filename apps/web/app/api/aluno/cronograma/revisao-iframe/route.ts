import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { montarEmissao } from '@/lib/cronograma/montar-emissao'
import { lerProgressoReencaixado, progressoDaEmissao } from '@/lib/cronograma/progresso-emissao'
import { montarConfig } from '@/lib/cronograma/visao-emissao'
import { montarPayloadRevisaoIframe } from '@/lib/cronograma/revisao-iframe'
import { formatBrt, hojeBrtISO } from '@/lib/brt'
import type { MetaParaConteudo } from '@/lib/cronograma/conteudo-meta'
import { lerProgressoMetas, resolverConteudoDasMetas, type DocDaMeta } from '@/lib/cronograma/meta-extras-server'

// GET /api/aluno/cronograma/revisao-iframe?emissaoId=<uuid>
// Carrega o plano FIXO do cronograma Revisão (grade congelada + checks + notas) no formato que o iframe do
// Cronograma Adaptativo consome em modo `revisao-fixo` (ver lib/cronograma/revisao-iframe.ts). SOMENTE LEITURA:
// marcar/desmarcar e anotar continuam em /api/aluno/cronograma/check e /nota (que validam o dono da emissão).
// Rota de API (não server action): server actions são rejeitadas em domínio custom / iframe Curseduca.
//
// Desempenho: a sessão é resolvida UMA vez (antes abrirEmissao/listarChecks/listarNotas repetiam sessão + leitura da
// emissão); checks/notas/progresso/conteúdo correm em paralelo; metas/links/questões e o conteúdo por meta vêm de
// cache curto compartilhado. Logs `[revisao-iframe] etapa=… ms` (sem dado pessoal) para medir em produção/dev.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const NO_CACHE = 'private, no-cache, must-revalidate'

export async function GET(req: NextRequest) {
  const t0 = Date.now()
  const etapas: string[] = []
  const medir = (etapa: string, ms: number) => { etapas.push(`${etapa}=${ms}`); console.info(`[revisao-iframe] etapa=${etapa} ${ms} ms`) }
  const cron = async <T,>(etapa: string, p: Promise<T>): Promise<T> => { const t = Date.now(); try { return await p } finally { medir(etapa, Date.now() - t) } }

  const sessao = await cron('sessao', getSessaoAluno())
  if (!sessao) return NextResponse.json({ ok: false, message: 'Não autenticado.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  const emissaoId = req.nextUrl.searchParams.get('emissaoId') ?? ''
  if (!emissaoId) return NextResponse.json({ ok: false, message: 'Cronograma ausente.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })

  const r = await montarEmissao(emissaoId, sessao.tenantId, sessao.estudanteId, medir) // valida UUID + dono (estudante/tenant da sessão)
  if (!r.ok || !r.dados) return NextResponse.json({ ok: false, message: r.error ?? 'Cronograma não encontrado.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
  const d = r.dados
  const cronogramaId = d.emissao.cronograma_id

  const svc = createAdminClient()
  // Metas da grade (só as de conteúdo) para resolver meta -> documento da Biblioteca.
  const metasGrade: MetaParaConteudo[] = d.grade.semanas.flatMap((s) =>
    s.kind === 'conteudo' ? s.metas.map((m) => ({ id: m.id, tipo: m.tipo, disciplinas: [m.disciplina], aula: m.aula, conteudo: m.conteudo, textos: [m.titulo, m.complemento] })) : [])
  const tPar = Date.now()
  const [checks, notas, progresso, conteudos, progressoMetas] = await Promise.all([
    // O dono da emissão já foi validado em montarEmissao: lê direto (sem repetir sessão + emissão).
    cron('checks', lerProgressoReencaixado<{ marcada_em: string }>(svc, sessao.tenantId, cronogramaId, emissaoId, 'simulado_cronograma_meta_checks', 'marcada_em').catch(() => [])),
    cron('notas', lerProgressoReencaixado<{ texto: string }>(svc, sessao.tenantId, cronogramaId, emissaoId, 'simulado_cronograma_meta_notas', 'texto').catch(() => [])),
    d.indisponivel ? Promise.resolve(null) : cron('progresso', progressoDaEmissao(svc, sessao.tenantId, cronogramaId, emissaoId).catch(() => null)),
    // Conteúdo (vínculo explícito do admin > automático) e Parcial/Não realizada: best-effort, nunca derrubam o plano.
    d.indisponivel ? Promise.resolve(new Map<string, DocDaMeta>()) : cron('conteudo', resolverConteudoDasMetas(svc, sessao.tenantId, cronogramaId, metasGrade, d.versaoGrade).catch(() => new Map<string, DocDaMeta>())),
    d.indisponivel ? Promise.resolve([]) : cron('parcial', lerProgressoMetas(svc, sessao.tenantId, cronogramaId, emissaoId).catch(() => [])),
  ])
  medir('paralelo-total', Date.now() - tPar)

  const checksMap: Record<string, string> = {}
  for (const l of checks) checksMap[l.meta_id] = l.marcada_em
  const notasMap: Record<string, string> = {}
  for (const l of notas) notasMap[l.meta_id] = l.texto

  const tMont = Date.now()
  const semDatas = !!d.emissao.formulario?.semDatas
  const config = montarConfig(d.grade, d.emissao, formatBrt(d.emissao.criado_em) ?? '', semDatas)
  const payload = montarPayloadRevisaoIframe({
    emissao: d.emissao,
    grade: d.grade,
    checks: checksMap,
    notas: notasMap,
    config,
    progresso,
    hoje: hojeBrtISO(),
    semDatas,
    desatualizada: !!d.desatualizada,
    indisponivel: d.indisponivel,
    conteudos,
    progressoMetas,
  })
  const corpo = JSON.stringify(payload)
  const etag = `"${createHash('sha1').update(corpo).digest('base64url')}"`
  medir('payload', Date.now() - tMont)
  console.info(`[revisao-iframe] total=${Date.now() - t0} ms bytes=${corpo.length} metas=${Object.keys(payload.revisao.metas).length} (${etapas.join(' ')})`)

  const headers = { 'Cache-Control': NO_CACHE, ETag: etag, 'Server-Timing': `total;dur=${Date.now() - t0}` }
  // Revalidação: o navegador reenvia o ETag (fetch cache:'no-cache' no iframe) e recebe 304 sem corpo se nada mudou.
  if (req.headers.get('if-none-match') === etag) return new NextResponse(null, { status: 304, headers })
  return new NextResponse(corpo, { status: 200, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } })
}
