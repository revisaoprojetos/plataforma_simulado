import 'server-only'
// FICHA do membro (CS › Membros): dados internos do aluno por aba, lidos do banco real. Cada aba é carregada sob demanda
// (rota de API) e cacheada ~30 s. Tolerante: tabela/coluna ausente → aba vazia (nunca lança para o painel).
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { remember, chaveRelatorio, esquecerPrefixo } from '@/lib/cache/relatorio-cache'
import { exibidorCpf } from '@/lib/privacidade/cpf-server'
import { ehCpfMascarado } from '@/lib/privacidade/cpf'
import { acessoEfetivoDoEstudante } from '@/lib/acesso/aluno-efetivo'
import { origemDosGrupos, gruposOpcoes, validadeTexto, dataBrTs, metricasPlano, hojeBrt } from '@/lib/admin-revisao/cs'
import type {
  FichaAba, FichaResumo, FichaCadastro, FichaAcessos, FichaPlano, FichaDesempenho, FichaLeitura, FichaAtendimento, FichaHistorico, Kpi,
} from './ficha-tipos'

const TTL = 30
const DIA = 86_400_000
const FRENTE: Record<string, string> = { leitura: 'Leitura de PDF', legproc: 'LegProc', jurisclub: 'JurisClub', simulado: 'Simulados' }
const dia30 = () => new Date(Date.now() - 30 * DIA).toISOString().slice(0, 10)
const min = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}min` : `${Math.round(s / 60)}min`)

export async function limparFicha(tenantId: string, estudanteId: string) { await esquecerPrefixo(tenantId, `cs-ficha:${estudanteId}`) }

export async function carregarFicha(tenantId: string, estudanteId: string, aba: FichaAba): Promise<unknown | null> {
  const svc = createAdminClient()
  const existe = await svc.from('simulado_estudantes').select('id').eq('tenant_id', tenantId).eq('id', estudanteId).eq('deletado', false).maybeSingle()
  if (!existe.data) return null
  // `cadastro` traz CPF: o mascaramento depende de quem pede → não cachear compartilhado.
  const exec = () => LOADERS[aba](tenantId, estudanteId)
  if (aba === 'cadastro') return exec()
  return remember(chaveRelatorio(tenantId, 'cs-ficha', estudanteId, aba), TTL, exec)
}

const LOADERS: Record<FichaAba, (t: string, id: string) => Promise<any>> = {
  resumo: resumo, cadastro: cadastro, acessos: acessos, plano: plano, desempenho: desempenho, leitura: leitura, atendimento: atendimento, historico: historico,
}

async function tempo30(svc: ReturnType<typeof createAdminClient>, tenantId: string, id: string) {
  try {
    const { data } = await svc.from('simulado_tempo_estudo').select('frente, segundos, paginas').eq('tenant_id', tenantId).eq('estudante_id', id).gte('dia', dia30()).limit(1000)
    const m = new Map<string, { segundos: number; paginas: number }>()
    for (const r of (data ?? []) as any[]) { const c = m.get(r.frente) ?? { segundos: 0, paginas: 0 }; c.segundos += Number(r.segundos) || 0; c.paginas += Number(r.paginas) || 0; m.set(r.frente, c) }
    return [...m.entries()].map(([f, v]) => ({ frente: FRENTE[f] ?? f, ...v })).sort((a, b) => b.segundos - a.segundos)
  } catch { return [] as { frente: string; segundos: number; paginas: number }[] }
}

// ───────── Resumo ─────────
async function resumo(tenantId: string, id: string): Promise<FichaResumo> {
  const svc = createAdminClient()
  const [est, gam, sess, t30, mp, grupos, acesso, durAb, reqs] = await Promise.all([
    svc.from('simulado_estudantes').select('classificacao, origem_provider, created_at, ultimo_acesso_em, bloqueado_em').eq('tenant_id', tenantId).eq('id', id).maybeSingle(),
    svc.from('simulado_gamificacao_estudante').select('xp_total, nivel, liga, streak_atual, streak_maior, ultimo_dia_ativo').eq('tenant_id', tenantId).eq('estudante_id', id).maybeSingle(),
    svc.from('simulado_sessoes_prova').select('nota, status').eq('tenant_id', tenantId).eq('estudante_id', id).eq('deletado', false).eq('is_teste', false).limit(1000),
    tempo30(svc, tenantId, id),
    metricasPlano(tenantId, id),
    svc.from('simulado_grupo_membros').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('estudante_id', id),
    acessoEfetivoDoEstudante(tenantId, id).catch(() => []),
    svc.from('simulado_duvidas').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('estudante_id', id).eq('status', 'aberta'),
    svc.from('simulado_requerimentos').select('status').eq('tenant_id', tenantId).eq('estudante_id', id).limit(200),
  ])
  const sessoes = (sess.data ?? []) as { nota: number | null; status: string }[]
  const fin = sessoes.filter((s) => s.status === 'finalizada')
  const notas = fin.map((s) => Number(s.nota)).filter((n) => !isNaN(n))
  const media = notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null
  const reqAbertos = ((reqs.data ?? []) as { status: string | null }[]).filter((r) => !['respondido', 'respondida', 'resolvido', 'resolvida', 'concluido', 'concluida', 'fechado', 'fechada', 'encerrado'].includes((r.status ?? '').toLowerCase())).length
  const tempoTotal = t30.reduce((a, b) => a + b.segundos, 0)
  const kpis: Kpi[] = [
    { rotulo: 'Plano de estudos concluído', valor: mp.planoPct == null ? '—' : `${mp.planoPct}%`, detalhe: mp.planoPct == null ? 'sem plano gerado' : undefined },
    { rotulo: 'Metas na última semana', valor: mp.metasSemana == null ? '—' : String(mp.metasSemana) },
    { rotulo: 'Média das avaliações (estrelas)', valor: mp.mediaEstrelas == null ? '—' : `${String(mp.mediaEstrelas).replace('.', ',')} ★` },
    { rotulo: 'Simulados feitos', valor: String(fin.length) },
    { rotulo: 'Nota média nos simulados', valor: media == null ? '—' : media.toFixed(1).replace('.', ',') },
    { rotulo: 'Tempo de estudo (30 dias)', valor: tempoTotal > 0 ? min(tempoTotal) : '—' },
    { rotulo: 'Grupos de acesso', valor: String(grupos.count ?? 0) },
    { rotulo: 'Produtos com acesso ativo', valor: String((acesso as any[]).filter((a) => a.temAcesso).length) },
    { rotulo: 'Dúvidas aguardando resposta', valor: String(durAb.count ?? 0) },
    { rotulo: 'Requerimentos em aberto', valor: String(reqAbertos) },
  ]
  const e = (est.data ?? {}) as any, g = gam.data as any
  return {
    kpis,
    cadastroResumo: { classificacao: e.classificacao ?? null, origem: e.origem_provider ?? null, criadoEm: e.created_at ?? null, ultimoAcesso: e.ultimo_acesso_em ?? null, bloqueadoEm: e.bloqueado_em ?? null },
    gamificacao: g ? { xp: g.xp_total ?? 0, nivel: g.nivel ?? 1, liga: g.liga ?? null, sequenciaAtual: g.streak_atual ?? 0, sequenciaMaior: g.streak_maior ?? 0, ultimoDia: g.ultimo_dia_ativo ?? null } : null,
    tempo30d: t30.map((t) => ({ frente: t.frente, segundos: t.segundos })),
  }
}

// ───────── Cadastro ─────────
async function cadastro(tenantId: string, id: string): Promise<FichaCadastro> {
  const svc = createAdminClient()
  const { data } = await svc.from('simulado_estudantes').select('id, nome, email, emails_secundarios, cpf, telefone, data_nascimento, classificacao, matricula_externa, origem_provider, created_at, updated_at, user_id, acesso_bloqueado').eq('tenant_id', tenantId).eq('id', id).maybeSingle()
  const e = (data ?? {}) as any
  const exib = await exibidorCpf()
  const cpf = exib.cpf(e.cpf)
  return {
    id, nome: e.nome ?? '', email: e.email ?? null, emailsSecundarios: Array.isArray(e.emails_secundarios) ? e.emails_secundarios : [],
    cpf, cpfMascarado: ehCpfMascarado(cpf), telefone: e.telefone ?? null, dataNascimento: e.data_nascimento ?? null,
    classificacao: e.classificacao ?? null, matriculaExterna: e.matricula_externa ?? null, origemProvider: e.origem_provider ?? null,
    criadoEm: e.created_at ?? null, atualizadoEm: e.updated_at ?? null, userId: e.user_id ?? null, bloqueado: e.acesso_bloqueado === true,
  }
}

// ───────── Acessos ─────────
async function acessos(tenantId: string, id: string): Promise<FichaAcessos> {
  const svc = createAdminClient()
  const [vinc, grupos, orig, opcoes, prods, ass, mats, est] = await Promise.all([
    svc.from('simulado_grupo_membros').select('id, grupo_id, expira_em').eq('tenant_id', tenantId).eq('estudante_id', id).order('id').limit(500),
    svc.from('simulado_grupos').select('id, nome, is_mestre, validade_tipo, validade_meses, validade_ate').eq('tenant_id', tenantId).eq('deletado', false).limit(2000),
    origemDosGrupos(tenantId),
    gruposOpcoes(tenantId),
    acessoEfetivoDoEstudante(tenantId, id).catch(() => []),
    svc.from('simulado_assinaturas').select('id, provider, produto_ref, external_id, status, inicio_em, expira_em, origem, produto_id').eq('tenant_id', tenantId).eq('estudante_id', id).order('criado_em', { ascending: false }).limit(50),
    svc.from('simulado_matriculas').select('id, simulado_id, status, plano, validade, liberado').eq('tenant_id', tenantId).eq('estudante_id', id).order('created_at', { ascending: false }).limit(50),
    svc.from('simulado_estudantes').select('acesso_bloqueado').eq('tenant_id', tenantId).eq('id', id).maybeSingle(),
  ])
  const gById = new Map(((grupos.data ?? []) as any[]).map((g) => [g.id, g]))
  const gr: FichaAcessos['grupos'] = []
  for (const v of (vinc.data ?? []) as any[]) {
    const g = gById.get(v.grupo_id); if (!g || g.is_mestre) continue
    const val = v.expira_em ? `até ${dataBrTs(v.expira_em)}` : validadeTexto(g, null, 0, 0)
    gr.push({ grupoId: g.id, nome: g.nome, validade: val === '—' ? 'Sem validade' : val, origem: orig.origem.get(g.id) ?? 'manual', expiraEm: v.expira_em ?? null })
  }
  const meus = new Set(gr.map((g) => g.grupoId))
  const simIds = [...new Set(((mats.data ?? []) as any[]).map((m) => m.simulado_id).filter(Boolean))] as string[]
  const nomeSim = new Map<string, string>()
  for (const s of await fetchAllByIn<{ id: string; titulo: string }>(simIds, (c) => svc.from('simulado_simulados').select('id, titulo').in('id', c).order('id'))) nomeSim.set(s.id, s.titulo)
  const prodIds = [...new Set(((ass.data ?? []) as any[]).map((a) => a.produto_id).filter(Boolean))] as string[]
  const nomeProd = new Map<string, string>()
  for (const p of await fetchAllByIn<{ id: string; nome: string }>(prodIds, (c) => svc.from('simulado_produtos').select('id, nome').in('id', c).order('id'))) nomeProd.set(p.id, p.nome)
  return {
    grupos: gr,
    liberaveis: opcoes.filter((o) => !meus.has(o.id)),
    produtos: (prods as any[]).map((p) => ({ produtoId: p.produtoId, nome: p.nome, status: p.status, inicio: p.inicioEm ?? null, fim: p.fimEm ?? null, origens: p.origens, temAcesso: p.temAcesso })),
    assinaturas: ((ass.data ?? []) as any[]).map((a) => ({ id: a.id, provider: a.provider, produto: (a.produto_id && nomeProd.get(a.produto_id)) || a.produto_ref || null, status: a.status, inicio: a.inicio_em ?? null, expira: a.expira_em ?? null, origem: a.origem ?? null, externalId: a.external_id ?? null })),
    matriculas: ((mats.data ?? []) as any[]).map((m) => ({ id: m.id, simulado: m.simulado_id ? nomeSim.get(m.simulado_id) ?? null : null, status: m.status ?? null, plano: m.plano ?? null, validade: m.validade ?? null, liberado: m.liberado ?? null })),
    bloqueado: (est.data as any)?.acesso_bloqueado === true,
  }
}

// ───────── Plano de estudos ─────────
async function plano(tenantId: string, id: string): Promise<FichaPlano> {
  const vazio: FichaPlano = { temPlano: false, plano: null, semanas: [], porTipo: [], planosOutros: 0 }
  const svc = createAdminClient()
  const { data: planos, error } = await svc.from('simulado_cronograma_adaptativo_plano').select('id, titulo, start_data, criado_em, pausa, fixado, arquivada').eq('tenant_id', tenantId).eq('estudante_id', id).eq('arquivada', false).order('fixado', { ascending: false }).order('criado_em', { ascending: false }).limit(20)
  if (error || !planos?.length) return vazio
  const p = planos[0] as any
  const metas = await fetchAll<{ id: string; meta_id: string; tipo: string; tipo_nome: string | null; semana: number | null; data_prevista: string | null }>(() =>
    svc.from('simulado_cronograma_adaptativo_plano_meta').select('id, meta_id, tipo, tipo_nome, semana, data_prevista').eq('tenant_id', tenantId).eq('plano_id', p.id).order('id', { ascending: true }))
  const prog = await fetchAll<{ meta_id: string; estado: string | null }>(() =>
    svc.from('simulado_cronograma_adaptativo_meta').select('meta_id, estado').eq('tenant_id', tenantId).eq('plano_id', p.id).order('meta_id', { ascending: true }))
  const est = new Map(prog.map((x) => [x.meta_id, x.estado]))
  const hoje = hojeBrt()
  const sem = new Map<number, { total: number; feitas: number; atrasadas: number }>()
  const tipos = new Map<string, { total: number; feitas: number }>()
  let feitas = 0, naoReal = 0, atras = 0
  for (const m of metas) {
    const e = est.get(m.meta_id)
    const feita = e === 'done', missed = e === 'missed'
    const atrasada = !feita && !!m.data_prevista && String(m.data_prevista).slice(0, 10) < hoje
    if (feita) feitas++; if (missed) naoReal++; if (atrasada) atras++
    const s = sem.get(m.semana ?? 0) ?? { total: 0, feitas: 0, atrasadas: 0 }; s.total++; if (feita) s.feitas++; if (atrasada) s.atrasadas++; sem.set(m.semana ?? 0, s)
    const t = tipos.get(m.tipo_nome ?? m.tipo) ?? { total: 0, feitas: 0 }; t.total++; if (feita) t.feitas++; tipos.set(m.tipo_nome ?? m.tipo, t)
  }
  const semArr = [...sem.entries()].sort((a, b) => a[0] - b[0]).map(([semana, v]) => ({ semana, ...v }))
  const atual = semArr.find((s) => s.feitas < s.total)?.semana ?? null
  return {
    temPlano: true,
    plano: { id: p.id, titulo: p.titulo ?? null, inicio: p.start_data ?? null, criadoEm: p.criado_em ?? null, pausado: !!p.pausa, total: metas.length, feitas, naoRealizadas: naoReal, atrasadas: atras, pct: metas.length ? Math.round((feitas / metas.length) * 100) : 0, semanaAtual: atual },
    semanas: semArr,
    porTipo: [...tipos.entries()].map(([tipo, v]) => ({ tipo, ...v })).sort((a, b) => b.total - a.total),
    planosOutros: planos.length - 1,
  }
}

// ───────── Desempenho ─────────
async function desempenho(tenantId: string, id: string): Promise<FichaDesempenho> {
  const svc = createAdminClient()
  const { data } = await svc.from('simulado_sessoes_prova').select('id, status, nota, posicao_ranking, iniciado_em, finalizado_em, tentativa_num, simulado_id').eq('tenant_id', tenantId).eq('estudante_id', id).eq('deletado', false).eq('is_teste', false).order('iniciado_em', { ascending: false }).limit(200)
  const sess = (data ?? []) as any[]
  const fin = sess.filter((s) => s.status === 'finalizada')
  const notas = fin.map((s) => Number(s.nota)).filter((n) => !isNaN(n))
  const amostra = fin.slice(0, 60)
  const resp = await fetchAllByIn<{ id: string; sessao_id: string; questao_id: string; correta: boolean }>(amostra.map((s) => s.id), (c) => svc.from('simulado_respostas_objetivas').select('id, sessao_id, questao_id, correta').in('sessao_id', c).order('id'))
  const tot = new Map<string, number>(), ac = new Map<string, number>()
  for (const r of resp) { tot.set(r.sessao_id, (tot.get(r.sessao_id) ?? 0) + 1); if (r.correta) ac.set(r.sessao_id, (ac.get(r.sessao_id) ?? 0) + 1) }
  const qIds = [...new Set(resp.map((r) => r.questao_id))]
  const qd = new Map<string, string | null>()
  for (const q of await fetchAllByIn<{ id: string; disciplina_id: string | null }>(qIds, (c) => svc.from('simulado_questoes').select('id, disciplina_id').in('id', c).order('id'))) qd.set(q.id, q.disciplina_id)
  const dIds = [...new Set([...qd.values()].filter(Boolean))] as string[]
  const dn = new Map<string, string>()
  for (const d of await fetchAllByIn<{ id: string; nome: string }>(dIds, (c) => svc.from('simulado_disciplinas').select('id, nome').in('id', c).order('id'))) dn.set(d.id, d.nome)
  const porD = new Map<string, { acertos: number; total: number }>()
  for (const r of resp) { const nome = (qd.get(r.questao_id) && dn.get(qd.get(r.questao_id) as string)) || 'Sem disciplina'; const c = porD.get(nome) ?? { acertos: 0, total: 0 }; c.total++; if (r.correta) c.acertos++; porD.set(nome, c) }
  const simIds = [...new Set(sess.slice(0, 20).map((s) => s.simulado_id).filter(Boolean))] as string[]
  const sn = new Map<string, string>()
  for (const s of await fetchAllByIn<{ id: string; titulo: string }>(simIds, (c) => svc.from('simulado_simulados').select('id, titulo').in('id', c).order('id'))) sn.set(s.id, s.titulo)
  return {
    feitos: fin.length, emAndamento: sess.filter((s) => s.status === 'em_andamento').length,
    notaMedia: notas.length ? Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 10) / 10 : null,
    melhorNota: notas.length ? Math.max(...notas) : null,
    amostraSessoes: amostra.length,
    disciplinas: [...porD.entries()].map(([nome, v]) => ({ nome, ...v, pct: v.total ? Math.round((v.acertos / v.total) * 100) : 0 })).sort((a, b) => b.total - a.total).slice(0, 20),
    sessoes: sess.slice(0, 20).map((s) => ({ id: s.id, simulado: sn.get(s.simulado_id) ?? null, status: s.status, nota: s.nota == null ? null : Number(s.nota), posicao: s.posicao_ranking ?? null, iniciadoEm: s.iniciado_em ?? null, finalizadoEm: s.finalizado_em ?? null, tentativa: s.tentativa_num ?? null, acertos: tot.has(s.id) ? ac.get(s.id) ?? 0 : null, total: tot.get(s.id) ?? null })),
  }
}

// ───────── Leitura / Biblioteca ─────────
async function leitura(tenantId: string, id: string): Promise<FichaLeitura> {
  const svc = createAdminClient()
  const [prog, up, t30] = await Promise.all([
    svc.from('simulado_leitura_progresso').select('documento_id, pct, tempo_seg, concluido_em, atualizado_em').eq('tenant_id', tenantId).eq('estudante_id', id).order('atualizado_em', { ascending: false }).limit(500),
    svc.from('simulado_leitura_ultimo_ponto').select('documento_id, atualizado_em').eq('tenant_id', tenantId).eq('estudante_id', id).order('atualizado_em', { ascending: false }).limit(1),
    tempo30(svc, tenantId, id),
  ])
  const rows = (prog.data ?? []) as any[]
  const ids = [...new Set([...rows.slice(0, 25).map((r) => r.documento_id), ...((up.data ?? []) as any[]).map((r) => r.documento_id)])] as string[]
  const nome = new Map<string, string>()
  for (const d of await fetchAllByIn<{ id: string; titulo: string }>(ids, (c) => svc.from('simulado_documentos').select('id, titulo').in('id', c).order('id'))) nome.set(d.id, d.titulo)
  const u = ((up.data ?? []) as any[])[0]
  return {
    documentos: rows.slice(0, 25).map((r) => ({ id: r.documento_id, titulo: nome.get(r.documento_id) ?? null, pct: Math.round(Number(r.pct) || 0), tempoSeg: Number(r.tempo_seg) || 0, concluidoEm: r.concluido_em ?? null, atualizadoEm: r.atualizado_em ?? null })),
    concluidos: rows.filter((r) => r.concluido_em).length, iniciados: rows.length, tempoTotalSeg: rows.reduce((a, r) => a + (Number(r.tempo_seg) || 0), 0),
    ultimoPonto: u ? { documento: nome.get(u.documento_id) ?? null, em: u.atualizado_em ?? null } : null,
    tempo30d: t30,
  }
}

// ───────── Atendimento ─────────
async function atendimento(tenantId: string, id: string): Promise<FichaAtendimento> {
  const svc = createAdminClient()
  const [d, r, f] = await Promise.all([
    svc.from('simulado_duvidas').select('id, titulo, status, criado_em, ultima_msg_em').eq('tenant_id', tenantId).eq('estudante_id', id).order('ultima_msg_em', { ascending: false }).limit(30),
    svc.from('simulado_requerimentos').select('id, protocolo, tipo, status, descricao, criado_em, respondido_em').eq('tenant_id', tenantId).eq('estudante_id', id).order('criado_em', { ascending: false }).limit(30),
    svc.from('simulado_feedbacks_questao').select('id, tipo, mensagem, status, criado_em').eq('tenant_id', tenantId).eq('estudante_id', id).order('criado_em', { ascending: false }).limit(30),
  ])
  return {
    duvidas: ((d.data ?? []) as any[]).map((x) => ({ id: x.id, titulo: x.titulo ?? null, status: x.status, criadoEm: x.criado_em ?? null, ultimaMsgEm: x.ultima_msg_em ?? null })),
    requerimentos: ((r.data ?? []) as any[]).map((x) => ({ id: x.id, protocolo: x.protocolo ?? null, tipo: x.tipo ?? null, status: x.status ?? null, descricao: x.descricao ?? null, criadoEm: x.criado_em ?? null, respondidoEm: x.respondido_em ?? null })),
    reportes: ((f.data ?? []) as any[]).map((x) => ({ id: x.id, tipo: x.tipo ?? null, mensagem: x.mensagem ?? null, status: x.status ?? null, criadoEm: x.criado_em ?? null })),
  }
}

// ───────── Histórico ─────────
async function historico(tenantId: string, id: string): Promise<FichaHistorico> {
  const svc = createAdminClient()
  const [ev, lg, nt] = await Promise.all([
    svc.from('simulado_audit_logs').select('id, operacao, entidade, ator_tipo, dados_novos, criado_em').eq('tenant_id', tenantId).eq('entidade_id', id).neq('entidade', 'aluno_portal').order('criado_em', { ascending: false }).limit(40),
    svc.from('simulado_audit_logs').select('id, criado_em, dados_novos').eq('tenant_id', tenantId).eq('entidade_id', id).eq('entidade', 'aluno_portal').eq('operacao', 'LOGIN').order('criado_em', { ascending: false }).limit(20),
    svc.from('simulado_notificacoes').select('id, titulo, lida, criado_em').eq('tenant_id', tenantId).eq('estudante_id', id).order('criado_em', { ascending: false }).limit(15),
  ])
  const exib = await exibidorCpf()
  const resumoDiff = (d: any) => { if (!d) return null; const s = JSON.stringify(exib.profundo(d)); return s.length > 160 ? s.slice(0, 160) + '…' : s }
  return {
    eventos: ((ev.data ?? []) as any[]).map((e) => ({ id: e.id, operacao: e.operacao, entidade: e.entidade, ator: e.ator_tipo ?? null, detalhe: resumoDiff(e.dados_novos), em: e.criado_em ?? null })),
    acessos: ((lg.data ?? []) as any[]).map((e) => ({ id: e.id, em: e.criado_em ?? null, email: e.dados_novos?.email ?? null })),
    notificacoes: ((nt.data ?? []) as any[]).map((n) => ({ id: n.id, titulo: n.titulo, lida: !!n.lida, em: n.criado_em ?? null })),
  }
}
