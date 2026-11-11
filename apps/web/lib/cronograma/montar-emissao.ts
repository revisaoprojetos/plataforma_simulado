import 'server-only'

/**
 * Remonta a grade de uma emissão (miolo compartilhado). Entradas: o aluno abrindo a própria emissão (sessão), a rota
 * do iframe Revisão (sessão já resolvida) e o Gotenberg (token assinado, sem cookie).
 *
 * Fica numa função só de propósito: uma segunda remontagem seria um segundo lugar para o PDF divergir do que o aluno
 * viu na tela. Não é server action (não exporta nada chamável pelo cliente): tenant/estudante vêm SEMPRE do servidor.
 *
 * Desempenho (743 metas): o gate de acesso, o cadastro do cronograma, a versão da grade e a carga de metas/links/
 * questões correm EM PARALELO (antes: emissão -> acesso (5-6 queries em série) -> cronograma -> 25 queries da grade
 * -> versão, tudo em fila). metas/links/contagem de questões usam cache curto (60 s) por tenant+cronograma+versão.
 */

import { createAdminClient } from '@/lib/supabase/server'
import { verificarAcessoCronograma } from './acesso'
import { carregarDadosGrade, montarGradePadrao } from './montar-grade-padrao'
import { calendarioValido, emissaoDesatualizada, type CalendarioCongelado } from './calendario-congelado'
import { dataISOValida } from './integridade'
import { colunaAusente, lerVersaoGrade } from './compat-legado'
import type { Grade, OpcoesGeracao } from './tipos'
import type { EmissaoAberta, EmissaoResumo } from '@/app/aluno/(portal)/cronograma/emissoes-actions-tipos'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type TempoEtapas = (etapa: string, ms: number) => void

export async function montarEmissao(
  emissaoId: string,
  tenantId: string,
  estudanteIdEsperado?: string,
  medir?: TempoEtapas,
): Promise<{ ok: boolean; dados?: EmissaoAberta; error?: string }> {
  if (!UUID_RE.test(emissaoId)) return { ok: false, error: 'Cronograma não encontrado.' }
  const svc = createAdminClient()
  const marca = (etapa: string, t0: number) => medir?.(etapa, Date.now() - t0)

  const COLS = 'id, cronograma_id, cronograma_nome, titulo, criado_em, arquivada, resumo, formulario, estudante_id, estudante_nome, preferencias'
  const buscar = (cols: string): PromiseLike<{ data: any; error: any }> => {
    let q = svc.from('simulado_cronograma_emissoes').select(cols).eq('id', emissaoId).eq('tenant_id', tenantId)
    if (estudanteIdEsperado) q = q.eq('estudante_id', estudanteIdEsperado) // só as próprias
    return q.maybeSingle() as unknown as PromiseLike<{ data: any; error: any }>
  }
  // `grade_snapshot`/`versao_grade` vêm da migration 20261114020000: coluna ausente => comportamento antigo.
  let t = Date.now()
  let comSnapshot = true
  let { data: emissao, error: erroEmissao } = await buscar(`${COLS}, grade_snapshot, versao_grade`)
  if (erroEmissao && colunaAusente(erroEmissao)) {
    comSnapshot = false
    ;({ data: emissao } = await buscar(COLS))
  }
  marca('emissao', t)
  if (!emissao) return { ok: false, error: 'Cronograma não encontrado.' }

  const dono = (emissao as { estudante_id: string }).estudante_id
  const cronogramaId = (emissao as any).cronograma_id as string

  // Em paralelo: gate de acesso, cadastro do cronograma, versão da grade (só com a migration) e a carga da grade.
  // A carga da grade começa já (usa só o id do cronograma, que a emissão traz); se o acesso for negado ela é descartada.
  t = Date.now()
  const versaoP: Promise<number | null> = comSnapshot ? lerVersaoGrade(svc, tenantId, cronogramaId).catch(() => null) : Promise.resolve(null)
  const acessoP = verificarAcessoCronograma(svc, tenantId, dono, cronogramaId)
  const cronP = svc
    .from('simulado_cronogramas')
    .select('id, slug, nome, total_semanas, dias_curso, dias_nome, semanas_revisao, carga_horaria')
    .eq('id', cronogramaId)
    .eq('tenant_id', tenantId)
    .eq('deletado', false)
    .maybeSingle()
  const dadosP = versaoP.then((v) => carregarDadosGrade(svc, tenantId, cronogramaId, { cache: true, versao: v }))
  dadosP.catch(() => {}) // evita rejeição não tratada se o acesso for negado e a carga for descartada
  const [acesso, { data: cron }, versaoCron] = await Promise.all([acessoP, cronP, versaoP])
  marca('acesso+cronograma+versao', t)

  if (!cron || !acesso.permitido) {
    return { ok: true, dados: { emissao: emissao as EmissaoResumo, grade: gradeVazia(), cargaHoraria: null, indisponivel: true } }
  }

  const f = ((emissao as any).formulario ?? {}) as Record<string, any>
  // Data de início corrompida no formulário salva (ex.: 2026-02-31) não pode derrubar a abertura:
  // cai para o dia em que a emissão foi criada (a grade congelada nem usa o início).
  const inicio = dataISOValida(f.inicio) ? f.inicio : String((emissao as any).criado_em ?? '').slice(0, 10)
  const opcoes: OpcoesGeracao = {
    inicio,
    revisao: f.revisao ?? { ativo: false, cada: 12 },
    recesso: dataRecessoValida(f.recesso) ? f.recesso : { modo: 'nenhum' },
  }

  // CALENDÁRIO CONGELADO: emissão gerada com a migration aplicada reaproveita as datas gravadas; o
  // conteúdo das metas segue vivo. Emissão antiga (sem snapshot) é congelada AGORA, na 1ª abertura.
  const snap = (emissao as any).grade_snapshot
  const calendario: CalendarioCongelado | null = calendarioValido(snap) ? snap : null

  // Mesma fonte da geração/prévia (lib/cronograma/montar-grade-padrao.ts).
  t = Date.now()
  const r = await montarGradePadrao(svc, tenantId, cron, opcoes, calendario, { dados: dadosP })
  marca('grade(dados+montagem)', t)
  if (!r.ok) return { ok: false, error: r.erro }

  if (comSnapshot && !calendario && versaoCron != null) {
    // Retrato da 1ª abertura pós-migration (best-effort; `.is(grade_snapshot, null)` evita sobrescrever corrida).
    await svc
      .from('simulado_cronograma_emissoes')
      .update({ grade_snapshot: r.calendario, versao_grade: versaoCron })
      .eq('id', emissaoId)
      .eq('tenant_id', tenantId)
      .is('grade_snapshot', null)
  }
  const versaoEmissao: number | null = calendario ? ((emissao as any).versao_grade ?? null) : versaoCron
  const desatualizada = calendario ? emissaoDesatualizada(versaoCron, versaoEmissao) : false

  return {
    ok: true,
    dados: {
      emissao: emissao as EmissaoResumo,
      grade: r.grade,
      cargaHoraria: Number((cron as { carga_horaria: number }).carga_horaria),
      indisponivel: false,
      desatualizada,
      versaoGrade: versaoCron,
    },
  }
}

function dataRecessoValida(r: unknown): r is OpcoesGeracao['recesso'] {
  const x = r as { modo?: string; de?: unknown; ate?: unknown } | null
  if (!x || typeof x.modo !== 'string') return false
  return (x.de == null || dataISOValida(x.de)) && (x.ate == null || dataISOValida(x.ate))
}

function gradeVazia(): Grade {
  return {
    semanas: [],
    resumo: {
      totalSemanas: 0,
      semanasConteudo: 0,
      semanasRevisao: 0,
      semanasRecesso: 0,
      diasPorSemana: 0,
      atividades: 0,
      conclusao: '',
      subtitulo: '',
    },
    avisos: [],
  }
}
