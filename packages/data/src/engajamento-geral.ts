import { sqlQuery } from './sql'

/**
 * Engajamento GERAL × Assinatura (pagamento recorrente) — generaliza a análise que antes só olhava o
 * Desafio de Lei Seca (ver leitura-engajamento.ts) para TODAS as áreas: Desafios (leitura: Lei Seca +
 * Jurisprudência) E Simulados. Cruza, no banco, a base de assinaturas ativas com a atividade de cada aluno.
 *
 * Tudo agregado/paginado no SQL (regra "área nova nasce otimizada"). `null`/`[]` → SQL indisponível
 * (o chamador degrada graciosamente). TODA query filtra `tenant_id` ($1) e exclui deletados/testes.
 *
 * Definição de "engajado" por área:
 *  - Desafios → concluiu ≥1 aula (simulado_leitura_progresso.concluido_em) OU respondeu ≥1 quiz
 *    (simulado_leitura_respostas.respondido_em) em documentos de pastas folder_area IN ('leitura','jurisprudencia').
 *  - Simulados → finalizou ≥1 sessão (simulado_sessoes_prova status='finalizada', is_teste=false, deletado=false).
 *  - Todos → UNIÃO dos dois conjuntos.
 * `alvoId` estreita o escopo: em 'simulados' é um simulado específico; em 'desafios' é uma pasta/módulo.
 */

export type EngajArea = 'todos' | 'simulados' | 'desafios'
export type EngajFiltro = { area: EngajArea; alvoId?: string | null }

// ── Fragmentos SQL reaproveitados (CTEs) ────────────────────────────────────────────────────────
// Documentos de desafio em escopo. $1 = tenant. Se alvoPasta != '' → só daquela pasta; senão todas as
// pastas de desafio (leitura + jurisprudência). Parâmetro posicional da pasta passado como alvoParam.
function ldocsCte(alvoParam: string) {
  // Sem alvo (alvoParam === "''") → sem filtro de pasta. NUNCA gerar `''::uuid` (o Postgres avalia o
  // cast do literal no planejamento e estoura "invalid input syntax for type uuid", mesmo que o OR
  // jamais o alcance logicamente). Só quando há alvo ($2) é que comparamos p.id.
  const filtro = alvoParam === "''" ? 'TRUE' : `p.id = ${alvoParam}::uuid`
  return `ldocs AS (
     SELECT d.id FROM simulado_documentos d
       JOIN simulado_pastas p ON p.id = d.pasta_id
      WHERE d.tenant_id = $1 AND d.deletado = false
        AND p.folder_area IN ('leitura','jurisprudencia')
        AND (${filtro})
   )`
}

// Sessões finalizadas em escopo. $1 = tenant. alvoSim != '' → só daquele simulado.
function sfinCte(alvoParam: string) {
  // Idem ldocsCte: sem alvo → sem filtro (TRUE); nunca gerar `''::uuid`.
  const filtro = alvoParam === "''" ? 'TRUE' : `sp.simulado_id = ${alvoParam}::uuid`
  return `sfin AS (
     SELECT DISTINCT sp.estudante_id, sp.id AS sessao_id, sp.simulado_id, sp.finalizado_em, sp.iniciado_em
       FROM simulado_sessoes_prova sp
       JOIN simulado_simulados sim ON sim.id = sp.simulado_id AND sim.tenant_id = $1 AND sim.deletado = false
      WHERE sp.status = 'finalizada' AND sp.is_teste = false AND sp.deletado = false
        AND sp.estudante_id IS NOT NULL
        AND (${filtro})
   )`
}

// Conjunto de alunos ENGAJADOS (apenas estudantes), conforme a área. Usa as CTEs acima.
// Em 'todos' usa alvoDesafio p/ desafios e alvoSim p/ simulados; na prática o chamador só passa alvo
// quando a área é específica (em 'todos' ambos vêm '').
function ativCte(area: EngajArea) {
  if (area === 'simulados') {
    return `ativ AS (SELECT DISTINCT estudante_id FROM sfin)`
  }
  if (area === 'desafios') {
    return `ativ AS (
       SELECT DISTINCT estudante_id FROM (
         SELECT estudante_id FROM simulado_leitura_progresso WHERE documento_id IN (SELECT id FROM ldocs) AND concluido_em IS NOT NULL
         UNION
         SELECT estudante_id FROM simulado_leitura_respostas  WHERE documento_id IN (SELECT id FROM ldocs) AND respondido_em IS NOT NULL
       ) u
     )`
  }
  // todos = desafios ∪ simulados
  return `ativ AS (
     SELECT DISTINCT estudante_id FROM (
       SELECT estudante_id FROM simulado_leitura_progresso WHERE documento_id IN (SELECT id FROM ldocs) AND concluido_em IS NOT NULL
       UNION
       SELECT estudante_id FROM simulado_leitura_respostas  WHERE documento_id IN (SELECT id FROM ldocs) AND respondido_em IS NOT NULL
       UNION
       SELECT estudante_id FROM sfin
     ) u
   )`
}

// Última atividade (timestamp) por aluno no escopo — p/ a coluna e a ordenação.
function ultAtivCte(area: EngajArea) {
  const desafio = `SELECT estudante_id, concluido_em AS t FROM simulado_leitura_progresso WHERE documento_id IN (SELECT id FROM ldocs) AND concluido_em IS NOT NULL
       UNION ALL
       SELECT estudante_id, respondido_em AS t FROM simulado_leitura_respostas WHERE documento_id IN (SELECT id FROM ldocs) AND respondido_em IS NOT NULL`
  const sim = `SELECT estudante_id, COALESCE(finalizado_em, iniciado_em) AS t FROM sfin`
  let inner: string
  if (area === 'simulados') inner = sim
  else if (area === 'desafios') inner = desafio
  else inner = `${desafio}
       UNION ALL
       ${sim}`
  return `ult AS (SELECT estudante_id, MAX(t) AS ult FROM (${inner}) z GROUP BY estudante_id)`
}

// Quais CTEs de escopo precisam existir p/ a área (evita referenciar ldocs/sfin sem necessidade).
function escopoCtes(area: EngajArea, alvoDesafio: string, alvoSim: string): string[] {
  const out: string[] = []
  if (area === 'desafios' || area === 'todos') out.push(ldocsCte(alvoDesafio))
  if (area === 'simulados' || area === 'todos') out.push(sfinCte(alvoSim))
  return out
}

// Resolve os 2 "slots" de alvo: em 'desafios' o alvoId é uma pasta; em 'simulados' é um simulado.
function alvos(filtro: EngajFiltro): { desafio: string; sim: string } {
  const a = (filtro.alvoId ?? '').trim()
  if (!a) return { desafio: "''", sim: "''" }
  if (filtro.area === 'desafios') return { desafio: `$2`, sim: "''" }
  if (filtro.area === 'simulados') return { desafio: "''", sim: `$2` }
  return { desafio: "''", sim: "''" } // 'todos' ignora alvo
}

function alvoParamArr(filtro: EngajFiltro): string[] {
  const a = (filtro.alvoId ?? '').trim()
  if (!a) return []
  if (filtro.area === 'desafios' || filtro.area === 'simulados') return [a]
  return []
}

// ── KPIs ─────────────────────────────────────────────────────────────────────────────────────────
export type EngajGeralKpisSql = {
  base_total: string | number
  pagantes: string | number
  engajados: string | number
  pagantes_engajados: string | number
  pagantes_sem_atividade: string | number
  engajados_nao_pagantes: string | number
}

/** KPIs (contagens) do cruzamento assinatura × atividade no escopo. 1 linha. */
export async function engajamentoGeralKpisSql(tenantId: string, filtro: EngajFiltro): Promise<EngajGeralKpisSql | null> {
  const { desafio, sim } = alvos(filtro)
  const ctes = [
    ...escopoCtes(filtro.area, desafio, sim),
    `pagantes AS (
       SELECT DISTINCT a.estudante_id FROM simulado_assinaturas a
         JOIN simulado_estudantes e ON e.id = a.estudante_id AND e.deletado = false
        WHERE a.tenant_id = $1 AND a.status = 'ativo'
     )`,
    ativCte(filtro.area),
    `ativ_est AS (SELECT a.estudante_id FROM ativ a JOIN simulado_estudantes e ON e.id = a.estudante_id AND e.deletado = false AND e.tenant_id = $1)`,
  ]
  const rows = await sqlQuery<EngajGeralKpisSql>(
    `WITH ${ctes.join(',\n')}
     SELECT
       (SELECT count(*) FROM simulado_estudantes e WHERE e.tenant_id = $1 AND e.deletado = false) AS base_total,
       (SELECT count(*) FROM pagantes) AS pagantes,
       (SELECT count(*) FROM ativ_est) AS engajados,
       (SELECT count(*) FROM pagantes p WHERE     EXISTS (SELECT 1 FROM ativ_est a WHERE a.estudante_id = p.estudante_id)) AS pagantes_engajados,
       (SELECT count(*) FROM pagantes p WHERE NOT EXISTS (SELECT 1 FROM ativ_est a WHERE a.estudante_id = p.estudante_id)) AS pagantes_sem_atividade,
       (SELECT count(*) FROM ativ_est a WHERE NOT EXISTS (SELECT 1 FROM pagantes p WHERE p.estudante_id = a.estudante_id)) AS engajados_nao_pagantes`,
    [tenantId, ...alvoParamArr(filtro)],
  )
  return rows && rows.length ? rows[0] : null
}

// ── Lista por aluno ────────────────────────────────────────────────────────────────────────────
export type EngajGeralLinhaSql = {
  id: string
  nome: string | null
  email: string | null
  paga: boolean
  engajado: boolean
  ultima_atividade: string | Date | null
  areas_ativas: string[] | null
  total_rows: string | number
}

export type EngajSituacao = 'todos' | 'churn' | 'conversao' | 'pagantes' | 'ativos'
const SORT_COLS: Record<string, string> = {
  nome: 'e.nome',
  ultima: 'ult.ult',
  // "situacao": pagantes-sem-atividade primeiro (risco), depois conversão; aproxima pela flag paga×engajado.
  situacao: '(p.estudante_id IS NOT NULL)::int * 2 + (av.estudante_id IS NULL)::int',
}

/**
 * Lista paginada de alunos: paga (bool), engajado (bool), áreas ativas (text[]) e última atividade.
 * Filtro `situacao` + busca por nome/email + ordenação + paginação, tudo no banco. `total_rows` = total no filtro.
 */
export async function engajamentoGeralListaSql(
  tenantId: string,
  filtro: EngajFiltro,
  opts: { q: string; situacao: EngajSituacao; sortCol: string; sortDir: 'asc' | 'desc'; limit: number; offset: number },
): Promise<EngajGeralLinhaSql[] | null> {
  const { desafio, sim } = alvos(filtro)
  const col = SORT_COLS[opts.sortCol] ?? 'ult.ult'
  const dir = opts.sortDir === 'asc' ? 'ASC' : 'DESC'
  const orderBy = `ORDER BY ${col} ${dir} NULLS LAST, e.nome ASC`

  // "areas_ativas" — monta a lista de rótulos de área em que o aluno está ativo (só nas áreas em escopo).
  const areasExpr: string[] = []
  if (filtro.area === 'desafios' || filtro.area === 'todos') {
    areasExpr.push(`CASE WHEN EXISTS (
        SELECT 1 FROM simulado_leitura_progresso lp WHERE lp.estudante_id = e.id AND lp.documento_id IN (SELECT id FROM ldocs) AND lp.concluido_em IS NOT NULL
        UNION ALL
        SELECT 1 FROM simulado_leitura_respostas lr WHERE lr.estudante_id = e.id AND lr.documento_id IN (SELECT id FROM ldocs) AND lr.respondido_em IS NOT NULL
      ) THEN 'Desafios' END`)
  }
  if (filtro.area === 'simulados' || filtro.area === 'todos') {
    areasExpr.push(`CASE WHEN EXISTS (SELECT 1 FROM sfin sp WHERE sp.estudante_id = e.id) THEN 'Simulados' END`)
  }
  const areasAgg = `ARRAY_REMOVE(ARRAY[${areasExpr.join(', ')}], NULL)`

  const ctes = [
    ...escopoCtes(filtro.area, desafio, sim),
    `pagantes AS (SELECT DISTINCT estudante_id FROM simulado_assinaturas WHERE tenant_id = $1 AND status = 'ativo')`,
    ativCte(filtro.area),
    ultAtivCte(filtro.area),
  ]

  // Parâmetros: $1 tenant [, $2 alvo?], depois q, situacao, limit, offset (índices calculados).
  const alvoArr = alvoParamArr(filtro)
  const n = 1 + alvoArr.length // último índice usado pelo tenant/alvo
  const pQ = n + 1, pSit = n + 2, pLim = n + 3, pOff = n + 4

  return sqlQuery<EngajGeralLinhaSql>(
    `WITH ${ctes.join(',\n')}
     SELECT e.id, e.nome, e.email,
            (p.estudante_id IS NOT NULL) AS paga,
            (av.estudante_id IS NOT NULL) AS engajado,
            ult.ult AS ultima_atividade,
            ${areasAgg} AS areas_ativas,
            COUNT(*) OVER() AS total_rows
       FROM simulado_estudantes e
       LEFT JOIN pagantes p ON p.estudante_id = e.id
       LEFT JOIN ativ     av ON av.estudante_id = e.id
       LEFT JOIN ult         ON ult.estudante_id = e.id
      WHERE e.tenant_id = $1 AND e.deletado = false
        AND ($${pSit} = 'todos'
          OR ($${pSit} = 'churn'     AND p.estudante_id IS NOT NULL AND av.estudante_id IS NULL)
          OR ($${pSit} = 'conversao' AND av.estudante_id IS NOT NULL AND p.estudante_id IS NULL)
          OR ($${pSit} = 'pagantes'  AND p.estudante_id IS NOT NULL)
          OR ($${pSit} = 'ativos'    AND av.estudante_id IS NOT NULL))
        AND ($${pQ} = '' OR e.nome ILIKE '%' || $${pQ} || '%' OR e.email ILIKE '%' || $${pQ} || '%')
      ${orderBy}
      LIMIT $${pLim} OFFSET $${pOff}`,
    [tenantId, ...alvoArr, opts.q, opts.situacao, opts.limit, opts.offset],
  )
}

// ── Detalhe de um aluno ──────────────────────────────────────────────────────────────────────────
export type EngajGeralAlunoInfoSql = {
  id: string; nome: string | null; email: string | null; paga: boolean
  avatar: string | null; avatar_cor: string | null
}
export type EngajGeralSimRow = {
  simulado_id: string; titulo: string | null; tentativas: string | number; melhor_nota: number | null; ultima: string | Date | null
}
export type EngajGeralDesafioRow = {
  modulo_id: string; modulo_nome: string | null; area: string | null
  aulas_concluidas: string | number; quizzes_respondidos: string | number; ultima: string | Date | null
}

/** Info do aluno + quebra por área (simulados finalizados + desafios por módulo). Suficiente p/ drill-down. */
export async function engajamentoGeralAlunoDetalheSql(
  tenantId: string, estudanteId: string,
): Promise<{ info: EngajGeralAlunoInfoSql | null; simulados: EngajGeralSimRow[]; desafios: EngajGeralDesafioRow[] } | null> {
  const info = await sqlQuery<EngajGeralAlunoInfoSql>(
    `SELECT e.id, e.nome, e.email, e.avatar, e.perfil_avatar_cor AS avatar_cor,
            EXISTS (SELECT 1 FROM simulado_assinaturas a WHERE a.tenant_id = $1 AND a.estudante_id = e.id AND a.status = 'ativo') AS paga
       FROM simulado_estudantes e WHERE e.id = $2 AND e.tenant_id = $1`,
    [tenantId, estudanteId],
  )
  if (info == null) return null
  if (!info.length) return { info: null, simulados: [], desafios: [] }

  const simulados = await sqlQuery<EngajGeralSimRow>(
    `SELECT sp.simulado_id, sim.titulo,
            COUNT(*) AS tentativas,
            MAX(sp.nota) AS melhor_nota,
            MAX(COALESCE(sp.finalizado_em, sp.iniciado_em)) AS ultima
       FROM simulado_sessoes_prova sp
       JOIN simulado_simulados sim ON sim.id = sp.simulado_id AND sim.tenant_id = $1 AND sim.deletado = false
      WHERE sp.estudante_id = $2 AND sp.status = 'finalizada' AND sp.is_teste = false AND sp.deletado = false
      GROUP BY sp.simulado_id, sim.titulo
      ORDER BY ultima DESC NULLS LAST`,
    [tenantId, estudanteId],
  )

  const desafios = await desafiosAlunoSql(tenantId, estudanteId)

  return { info: info[0] ?? null, simulados: simulados ?? [], desafios: desafios ?? [] }
}

/** Histórico de desafios (Lei Seca + Jurisprudência) de um aluno, por módulo. Reaproveitável no perfil. */
export async function desafiosAlunoSql(tenantId: string, estudanteId: string): Promise<EngajGeralDesafioRow[] | null> {
  return sqlQuery<EngajGeralDesafioRow>(
    `WITH ldocs AS (
       SELECT d.id, d.pasta_id, p.nome AS pasta_nome, p.folder_area AS area
         FROM simulado_documentos d JOIN simulado_pastas p ON p.id = d.pasta_id
        WHERE d.tenant_id = $1 AND d.deletado = false AND p.folder_area IN ('leitura','jurisprudencia')
     ),
     prog AS (
       SELECT l.pasta_id, COUNT(DISTINCT lp.documento_id) AS aulas
         FROM simulado_leitura_progresso lp JOIN ldocs l ON l.id = lp.documento_id
        WHERE lp.estudante_id = $2 AND lp.concluido_em IS NOT NULL GROUP BY l.pasta_id
     ),
     resp AS (
       SELECT l.pasta_id, COUNT(DISTINCT lr.questao_id) AS quizzes, MAX(lr.respondido_em) AS ult
         FROM simulado_leitura_respostas lr JOIN ldocs l ON l.id = lr.documento_id
        WHERE lr.estudante_id = $2 AND lr.respondido_em IS NOT NULL GROUP BY l.pasta_id
     ),
     mods AS (SELECT DISTINCT pasta_id, pasta_nome, area FROM ldocs)
     SELECT m.pasta_id AS modulo_id, m.pasta_nome AS modulo_nome, m.area,
            COALESCE(pr.aulas, 0) AS aulas_concluidas,
            COALESCE(rp.quizzes, 0) AS quizzes_respondidos,
            rp.ult AS ultima
       FROM mods m
       LEFT JOIN prog pr ON pr.pasta_id = m.pasta_id
       LEFT JOIN resp rp ON rp.pasta_id = m.pasta_id
      WHERE COALESCE(pr.aulas, 0) > 0 OR COALESCE(rp.quizzes, 0) > 0
      ORDER BY m.area ASC, m.pasta_nome ASC`,
    [tenantId, estudanteId],
  )
}

// ── Desafios PENDENTES de um aluno (módulos ainda não concluídos 100%) ───────────────────────────
export type DesafioPendenteRow = {
  modulo_id: string
  modulo_nome: string | null
  area: string | null
  total: string | number
  feitas: string | number
}

/** Módulos de desafio (leitura/jurisprudência) com aulas publicadas em que o aluno NÃO concluiu todas. */
export async function desafiosPendentesAlunoSql(tenantId: string, estudanteId: string): Promise<DesafioPendenteRow[] | null> {
  return sqlQuery<DesafioPendenteRow>(
    `WITH mods AS (
       SELECT p.id, p.nome, p.folder_area AS area, COUNT(d.id) AS total
         FROM simulado_pastas p
         JOIN simulado_documentos d ON d.pasta_id = p.id AND d.tenant_id = p.tenant_id AND d.deletado = false AND d.publicado = true
        WHERE p.tenant_id = $1 AND p.folder_area IN ('leitura','jurisprudencia') AND p.deletado = false
        GROUP BY p.id, p.nome, p.folder_area
     ),
     done AS (
       SELECT l.pasta_id, COUNT(DISTINCT lp.documento_id) AS feitas
         FROM simulado_leitura_progresso lp
         JOIN simulado_documentos l ON l.id = lp.documento_id
        WHERE lp.estudante_id = $2 AND lp.concluido_em IS NOT NULL
        GROUP BY l.pasta_id
     )
     SELECT m.id AS modulo_id, m.nome AS modulo_nome, m.area, m.total, COALESCE(dn.feitas, 0) AS feitas
       FROM mods m LEFT JOIN done dn ON dn.pasta_id = m.id
      WHERE COALESCE(dn.feitas, 0) < m.total
      ORDER BY m.area ASC, m.nome ASC`,
    [tenantId, estudanteId],
  )
}

// ── Assinaturas de um aluno (aba "Assinaturas" do perfil) ────────────────────────────────────────
export type AssinaturaAlunoRow = {
  produto_ref: string | null
  produto_nome: string | null
  external_id: string | null
  status: string | null
  provider: string | null
  inicio_em: string | Date | null
  criado_em: string | Date | null   // fallback p/ "início" quando inicio_em falta/está corrompido
  expira_em: string | Date | null
  confirmado_curseduca: boolean | null
}

/**
 * Assinaturas de um aluno (recorrentes ativas primeiro) + nome do produto/benefício resolvido pelo
 * MAPEAMENTO da integração (`fonte_ref → fonte_nome` ou o grupo concedido, ex.: "Assinatura Ilimitada
 * PGE/RS"). Duas etapas tolerantes: sem mapeamento, a lista ainda volta (só com o ref). `null` = SQL
 * agregado indisponível.
 */
export async function assinaturasAlunoSql(tenantId: string, estudanteId: string): Promise<AssinaturaAlunoRow[] | null> {
  const rows = await sqlQuery<AssinaturaAlunoRow>(
    `SELECT produto_ref, external_id, status, provider, inicio_em, criado_em, expira_em, confirmado_curseduca
       FROM simulado_assinaturas
      WHERE tenant_id = $1 AND estudante_id = $2
      ORDER BY (status = 'ativo') DESC, expira_em DESC NULLS LAST`,
    [tenantId, estudanteId],
  )
  if (rows == null) return null
  if (!rows.length) return []
  const refs = [...new Set(rows.map((r) => r.produto_ref).filter(Boolean))] as string[]
  const nomes = refs.length
    ? await sqlQuery<{ produto_ref: string; produto_nome: string | null }>(
        `SELECT DISTINCT ON (m.fonte_ref) m.fonte_ref AS produto_ref,
                COALESCE(NULLIF(m.fonte_nome, ''), g.nome) AS produto_nome
           FROM simulado_integracao_mapeamentos m
           LEFT JOIN simulado_grupos g ON g.id = m.grupo_id
          WHERE m.tenant_id = $1 AND m.fonte_ref = ANY($2)
          ORDER BY m.fonte_ref, m.ativo DESC`,
        [tenantId, refs],
      )
    : []
  const mapaNome = new Map((nomes ?? []).map((n) => [n.produto_ref, n.produto_nome]))
  return rows.map((r) => ({ ...r, produto_nome: r.produto_ref ? mapaNome.get(r.produto_ref) ?? null : null }))
}

// ── Histórico de PAGAMENTOS de um aluno (todos os webhooks de transação da Guru) ─────────────────
export type PagamentoAlunoRow = {
  id: string
  pago_em: string | null
  status: string | null
  produto: string | null
  produto_ref: string | null
  valor: string | number | null       // valor REAL pago (payment.gross) — 0 em cupom 100%/grátis
  metodo: string | null               // free | credit_card | pix | billet
  recorrente: boolean | null          // é cobrança de assinatura (subscription presente)
  parcelas: string | number | null    // nº de parcelas do cartão (installments.qty)
  ciclo: string | number | null       // nº da cobrança recorrente (subscription.charged_times)
  recebido_em: string | Date | null
}

/**
 * Todos os pagamentos/transações do aluno — extraídos dos webhooks da Guru (`simulado_integracao_eventos`),
 * casados por e-mail OU CPF (os eventos não guardam estudante_id). Base para análise financeira do aluno.
 * `null` = SQL agregado indisponível. Retorna [] se não houver e-mail nem CPF para casar.
 */
export async function pagamentosAlunoSql(tenantId: string, email: string | null, cpf: string | null): Promise<PagamentoAlunoRow[] | null> {
  const mail = (email ?? '').trim().toLowerCase()
  const doc = (cpf ?? '').replace(/\D/g, '')
  if (!mail && !doc) return []
  return sqlQuery<PagamentoAlunoRow>(
    `SELECT event_id AS id,
            COALESCE(payload->'dates'->>'confirmed_at', payload->'dates'->>'ordered_at', payload->'dates'->>'created_at') AS pago_em,
            payload->>'status' AS status,
            payload->'items'->0->>'name' AS produto,
            payload->'items'->0->>'marketplace_id' AS produto_ref,
            payload->'payment'->>'gross' AS valor,
            payload->'payment'->>'method' AS metodo,
            (jsonb_typeof(payload->'subscription') = 'object') AS recorrente,
            payload->'payment'->'installments'->>'qty' AS parcelas,
            payload->'subscription'->>'charged_times' AS ciclo,
            recebido_em
       FROM simulado_integracao_eventos
      WHERE tenant_id = $1
        AND payload->'contact' IS NOT NULL
        AND ( ($2 <> '' AND lower(payload->'contact'->>'email') = $2)
           OR ($3 <> '' AND regexp_replace(COALESCE(payload->'contact'->>'doc', ''), '\\D', '', 'g') = $3) )
      ORDER BY COALESCE(payload->'dates'->>'confirmed_at', payload->'dates'->>'ordered_at', recebido_em::text) DESC
      LIMIT 500`,
    [tenantId, mail, doc],
  )
}

// ── Vínculos do aluno (aba "Vínculos" do perfil) ─────────────────────────────────────────────────
export type SimuladoVinculadoRow = { id: string; titulo: string | null; status: string | null }

/** Simulados a que o aluno tem acesso: matrícula + acesso avulso + simulados dos grupos dele. */
export async function simuladosVinculadosAlunoSql(tenantId: string, estudanteId: string): Promise<SimuladoVinculadoRow[] | null> {
  return sqlQuery<SimuladoVinculadoRow>(
    `WITH g AS (SELECT grupo_id FROM simulado_grupo_membros WHERE estudante_id = $2),
     ids AS (
       SELECT simulado_id FROM simulado_matriculas WHERE tenant_id = $1 AND estudante_id = $2 AND simulado_id IS NOT NULL
       UNION
       SELECT simulado_id FROM simulado_acessos WHERE tenant_id = $1 AND estudante_id = $2 AND simulado_id IS NOT NULL
       UNION
       SELECT gs.simulado_id FROM simulado_grupo_simulado gs JOIN g ON g.grupo_id = gs.grupo_id WHERE gs.simulado_id IS NOT NULL
     )
     SELECT s.id, s.titulo, s.status
       FROM simulado_simulados s JOIN ids ON ids.simulado_id = s.id
      WHERE s.tenant_id = $1 AND s.deletado = false
      ORDER BY s.titulo ASC`,
    [tenantId, estudanteId],
  )
}

export type GrupoVinculadoRow = { id: string; nome: string | null; cor: string | null; membros: string | number }

/** Grupos (não-mestre) de que o aluno é membro, com a contagem de alunos de cada grupo. */
export async function gruposVinculadosAlunoSql(tenantId: string, estudanteId: string): Promise<GrupoVinculadoRow[] | null> {
  return sqlQuery<GrupoVinculadoRow>(
    `SELECT g.id, g.nome, g.cor,
            (SELECT count(*) FROM simulado_grupo_membros m WHERE m.grupo_id = g.id) AS membros
       FROM simulado_grupos g
       JOIN simulado_grupo_membros gm ON gm.grupo_id = g.id AND gm.estudante_id = $2
      WHERE g.tenant_id = $1 AND g.deletado = false AND COALESCE(g.is_mestre, false) = false
      ORDER BY g.nome ASC`,
    [tenantId, estudanteId],
  )
}

// ── Opções dos sub-filtros ─────────────────────────────────────────────────────────────────────
export type OpcoesEngajamentoSql = {
  simulados: { id: string; titulo: string }[]
  desafios: { id: string; nome: string; area: string }[]
}

/** Listas p/ os dropdowns de sub-filtro: simulados oficiais do tenant + módulos de desafio (leitura/juris). */
export async function opcoesEngajamentoSql(tenantId: string): Promise<OpcoesEngajamentoSql | null> {
  const sims = await sqlQuery<{ id: string; titulo: string | null }>(
    `SELECT id, titulo FROM simulado_simulados
      WHERE tenant_id = $1 AND deletado = false AND owner_estudante_id IS NULL
      ORDER BY created_at DESC NULLS LAST`,
    [tenantId],
  )
  if (sims == null) return null
  const mods = await sqlQuery<{ id: string; nome: string | null; area: string | null }>(
    `SELECT id, nome, folder_area AS area FROM simulado_pastas
      WHERE tenant_id = $1 AND is_folder = true AND deletado = false
        AND folder_area IN ('leitura','jurisprudencia')
      ORDER BY folder_area ASC, nome ASC`,
    [tenantId],
  )
  return {
    simulados: (sims ?? []).map((s) => ({ id: s.id, titulo: s.titulo || 'Simulado' })),
    desafios: (mods ?? []).map((m) => ({ id: m.id, nome: m.nome || 'Módulo', area: m.area || 'leitura' })),
  }
}
