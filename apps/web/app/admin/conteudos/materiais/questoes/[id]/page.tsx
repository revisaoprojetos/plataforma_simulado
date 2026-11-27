import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { facetasBancoEstudio, listarQuestoesBanco, opcoesBancoEstudio } from '@/lib/conteudo/questoes-estudio'
import { FILTROS_VAZIOS, contarAplicados, filtrosDeParams } from '@/lib/conteudo/questoes-estudio-filtros'
import { alternativasSaoCertoErrado } from '@/lib/simulado/formato'
import { SemAcessoArea } from '@/app/admin/conteudos/_components/sem-acesso-area'
import { lerClassificacaoPadrao } from '../actions'
import { BancoDetalhe, type OpcoesCadastro, type QuestaoDetalheRow } from './banco-detalhe'

export const dynamic = 'force-dynamic'
const SEM = '00000000-0000-0000-0000-000000000000'

// BANCO › editar: título + classificação padrão + questões + stats. Dados reais; mesmos selects/embeds
// da página de produção /admin/banco-questoes/[id].
export default async function BancoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const access = await getCurrentAccess()
  if (!(access.isAdmin || access.permissions.includes('questoes:view'))) return <SemAcessoArea />
  const tid = access.tenantId ?? SEM
  const { id } = await params
  const sp = await searchParams
  const svc = createAdminClient()

  // Banco (colunas tolerantes).
  let banco: any = null
  for (const cols of ['id, nome, tipo, cor, criado_em', 'id, nome, tipo, cor', 'id, nome, tipo', 'id, nome']) {
    const r = await svc.from('simulado_pastas').select(cols).eq('id', id).eq('tenant_id', tid).maybeSingle()
    if (!r.error) { banco = r.data; break }
  }
  if (!banco) notFound()

  const vinculos = await fetchAll<{ questao_id: string }>(() =>
    svc.from('simulado_questao_pasta').select('questao_id').eq('pasta_id', id).eq('tenant_id', tid).order('questao_id', { ascending: true }))
  const ids = vinculos.map((v) => v.questao_id)

  // Questões do banco já FILTRADAS no banco (card multi-seleção) + opções/contagens do núcleo de facetas. `ids` (todas) só serve p/ "usos em quiz".
  const fe = filtrosDeParams((k) => sp[k])
  const [resultado, base] = await Promise.all([
    listarQuestoesBanco(svc, tid, id, fe, { sort: 'numero', dir: 'asc' }),
    facetasBancoEstudio(tid, id, FILTROS_VAZIOS),
  ])
  const opcoesEstudio = base ? await opcoesBancoEstudio(tid, base.contagens) : null
  const questoes = resultado.rows

  // Formato C/E vem das alternativas (2 opções "Certo"/"Errado").
  const ceSet = new Set<string>()
  if (questoes.length) {
    const alts = await fetchAllByIn<any>(questoes.map((q: any) => q.id), (chunk) =>
      svc.from('simulado_alternativas').select('questao_id, texto').in('questao_id', chunk))
    const textos = new Map<string, string[]>()
    for (const a of alts) { const arr = textos.get(a.questao_id) ?? []; arr.push(a.texto ?? ''); textos.set(a.questao_id, arr) }
    for (const [qid, ts] of textos) if (alternativasSaoCertoErrado(ts)) ceSet.add(qid)
  }

  // Usos em quiz: nº de documentos (conteúdos) que usam alguma questão do banco. Tolerante a tabela ausente.
  let usosEmQuiz = 0
  if (ids.length) {
    try {
      const usos = await fetchAllByIn<{ documento_id: string }>(ids, (chunk) =>
        svc.from('simulado_documento_quiz_questoes').select('id, documento_id').eq('tenant_id', tid).eq('deletado', false).in('questao_id', chunk).order('id', { ascending: true }))
      usosEmQuiz = new Set(usos.map((u) => u.documento_id)).size
    } catch { usosEmQuiz = 0 }
  }

  // Opções do cadastro (classificação padrão) + classificação atual.
  const lista = (tabela: string) => fetchAll<{ id: string; nome: string }>(() =>
    svc.from(tabela).select('id, nome').eq('tenant_id', tid).order('nome', { ascending: true }).order('id', { ascending: true }))
      .then((r) => r.map((x) => ({ id: x.id, nome: x.nome ?? '—' }))).catch(() => [] as { id: string; nome: string }[])
  const [disciplinas, assuntos, bancas, orgaos, cls] = await Promise.all([
    lista('simulado_disciplinas'), lista('simulado_assuntos'), lista('simulado_bancas'), lista('simulado_orgaos'),
    lerClassificacaoPadrao(id),
  ])
  const opcoes: OpcoesCadastro = { disciplinas, assuntos, bancas, orgaos }

  const linhas: QuestaoDetalheRow[] = questoes.map((q) => ({
    id: q.id, enunciado: q.enunciado, tipo: q.tipo ?? null,
    formato: q.tipo === 'discursiva' ? null : (ceSet.has(q.id) ? 'certo_errado' : 'multipla'),
    nivel_dificuldade: q.nivel_dificuldade, status: q.status,
    disciplina: q.disciplina, assunto: q.assunto, assuntoDetalhe: q.assunto_detalhe,
    banca: q.banca, orgao: q.orgao, ano: q.ano, cargo: q.cargo,
  }))

  return (
    <BancoDetalhe
      banco={{ id: banco.id, nome: banco.nome, tipo: banco.tipo === 'discursiva' ? 'discursiva' : 'objetiva', cor: banco.cor ?? null, criadoEm: banco.criado_em ?? null }}
      questoes={linhas}
      totalBanco={base?.total ?? ids.length}
      filtrosEstudio={fe}
      opcoesEstudio={opcoesEstudio}
      facInicial={contarAplicados(fe) === 0 ? base : null}
      usosEmQuiz={usosEmQuiz}
      opcoes={opcoes}
      classPadraoInicial={{
        disciplinaId: cls.disciplina?.id ?? '', assuntoId: cls.assunto?.id ?? '',
        bancaId: cls.banca?.id ?? '', orgaoId: cls.orgao?.id ?? '',
      }}
    />
  )
}
