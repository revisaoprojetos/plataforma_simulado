import { NextRequest, NextResponse } from 'next/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { registrarAudit } from '@/lib/audit'
import { UUID_META_RE } from '@/lib/cronograma/meta-valida'
import { chavesDasMetas, colunaAusente } from '@/lib/cronograma/compat-legado'
import { calcularParcial, familiaParcial, textoParada } from '@/lib/cronograma/parcial'
import { minutosPlanejadosDaDuracao } from '@/lib/cronograma/revisao-iframe'
import { tabelaAusente } from '@/lib/cronograma/meta-extras-server'

// POST /api/aluno/cronograma/meta-progresso — PARCIAL / NÃO REALIZADA de uma meta do cronograma Revisão (plano FIXO).
//   { emissaoId, metaId, status: 'parcial' | 'nao_realizada' | 'pendente', pagina?, totalPaginas?, artigo?, ponto?, minutos? }
// · 'parcial'       valida por família (PDFull: página; LegProc: artigo; demais: ponto + minutos) — lib/cronograma/parcial.ts.
//                   Na última página responde { concluir: true } (o iframe marca Concluir pela rota /check).
// · 'nao_realizada' registra o status; a meta CONTINUA atrasada e visível (a data oficial do plano não muda).
// · 'pendente'      limpa o registro.
// NÃO redistribui datas. Rota de API (server actions são rejeitadas em domínio custom / iframe Curseduca).
export const dynamic = 'force-dynamic'

const T = 'simulado_cronograma_meta_progresso'
const resp = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status })

export async function POST(req: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return resp({ ok: false, message: 'Não autenticado.' }, 401)
  let b: Record<string, unknown>
  try { b = await req.json() } catch { return resp({ ok: false, message: 'Requisição inválida.' }, 400) }
  const emissaoId = String(b.emissaoId ?? ''), metaId = String(b.metaId ?? ''), status = String(b.status ?? '')
  if (!UUID_META_RE.test(emissaoId) || !UUID_META_RE.test(metaId)) return resp({ ok: false, message: 'Dados inválidos.' }, 400)
  if (!['parcial', 'nao_realizada', 'pendente'].includes(status)) return resp({ ok: false, message: 'Status inválido.' }, 400)

  const svc = createAdminClient()
  // Dono: a emissão tem que ser DESTE aluno/tenant (o id vem do cliente).
  const { data: em } = await svc.from('simulado_cronograma_emissoes').select('id, cronograma_id')
    .eq('id', emissaoId).eq('tenant_id', sessao.tenantId).eq('estudante_id', sessao.estudanteId).maybeSingle()
  if (!em) return resp({ ok: false, message: 'Cronograma não encontrado.' }, 404)
  const cronogramaId = (em as { cronograma_id: string }).cronograma_id

  if (status === 'pendente') {
    const { error } = await svc.from(T).delete().eq('tenant_id', sessao.tenantId).eq('emissao_id', emissaoId).eq('meta_id', metaId)
    if (error) return tabelaAusente(error) ? resp({ ok: true, registro: null }) : resp({ ok: false, message: 'Não foi possível salvar.' }, 500)
    return resp({ ok: true, registro: null })
  }

  // A meta precisa ser DESTE cronograma (e a duração vem do servidor, não do cliente).
  const { data: meta } = await svc.from('simulado_cronograma_metas').select('id, tipo, duracao')
    .eq('tenant_id', sessao.tenantId).eq('cronograma_id', cronogramaId).eq('id', metaId).maybeSingle()
  if (!meta) return resp({ ok: false, message: 'Meta não pertence a este cronograma.' }, 400)
  const m = meta as { tipo: string; duracao: string | null }

  // Meta já concluída não vira parcial/não realizada (o aluno desmarca antes).
  const { count } = await svc.from('simulado_cronograma_meta_checks').select('meta_id', { count: 'exact', head: true })
    .eq('tenant_id', sessao.tenantId).eq('emissao_id', emissaoId).eq('meta_id', metaId)
  if ((count ?? 0) > 0) return resp({ ok: false, message: 'Esta meta já está concluída. Desmarque para registrar outro status.' }, 400)

  const familia = familiaParcial(m.tipo)
  let linha: Record<string, unknown> = { status: 'nao_realizada', pagina_ate: null, total_paginas: null, artigo: null, ponto: null, minutos_restantes: null }
  let texto = ''
  if (status === 'parcial') {
    const r = calcularParcial({
      familia,
      totalPaginas: b.totalPaginas as number | null,
      pagina: b.pagina as number | null,
      artigo: b.artigo as string | null,
      ponto: b.ponto as string | null,
      minutos: b.minutos as number | null,
      minutosPlanejados: minutosPlanejadosDaDuracao(m.duracao),
    })
    if (!r.ok) return resp({ ok: false, message: r.erro }, 400)
    if (r.concluida) {
      // Última página = meta concluída: limpa o parcial; o iframe marca Concluir em /check.
      await svc.from(T).delete().eq('tenant_id', sessao.tenantId).eq('emissao_id', emissaoId).eq('meta_id', metaId)
      return resp({ ok: true, concluir: true, registro: null })
    }
    linha = { status: 'parcial', pagina_ate: r.paginaAte, total_paginas: r.totalPaginas, artigo: r.artigo, ponto: r.ponto, minutos_restantes: r.minutosRestantes }
    texto = textoParada(familia, { paginaAte: r.paginaAte, totalPaginas: r.totalPaginas, artigo: r.artigo, ponto: r.ponto, minutosRestantes: r.minutosRestantes })
  }

  const agora = new Date().toISOString()
  const base: Record<string, unknown> = { tenant_id: sessao.tenantId, emissao_id: emissaoId, estudante_id: sessao.estudanteId, meta_id: metaId, ...linha, atualizado_em: agora }
  const chave = (await chavesDasMetas(svc, sessao.tenantId, [metaId]).catch(() => new Map<string, string>())).get(metaId) ?? null
  let { error } = await svc.from(T).upsert(chave ? { ...base, chave_meta: chave } : base, { onConflict: 'emissao_id,meta_id' })
  if (error && chave && colunaAusente(error)) ({ error } = await svc.from(T).upsert(base, { onConflict: 'emissao_id,meta_id' }))
  if (error) {
    if (tabelaAusente(error)) return resp({ ok: false, message: 'Este recurso ficará disponível após a atualização do sistema.' }, 503)
    return resp({ ok: false, message: 'Não foi possível salvar. Tente de novo.' }, 500)
  }

  await registrarAudit({
    operacao: 'INSERT', entidade: T, entidadeId: metaId,
    depois: { status, emissao_id: emissaoId, ...linha }, atorTipo: 'estudante', atorId: sessao.estudanteId, tenantId: sessao.tenantId,
  })
  return resp({
    ok: true,
    registro: {
      status: linha.status, pagina: linha.pagina_ate, total: linha.total_paginas, artigo: linha.artigo, ponto: linha.ponto,
      minutos: linha.minutos_restantes, texto, em: agora,
    },
  })
}
