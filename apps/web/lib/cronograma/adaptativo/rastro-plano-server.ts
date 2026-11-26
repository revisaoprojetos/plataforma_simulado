import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { remember } from '@/lib/cache/relatorio-cache'
import { gerarPlano, planoUsaMotorAtual } from './engine'
import type { Cfg, Plano } from './engine'
import { hojeCal } from './dados'
import { carregarConteudoBanco } from './conteudo-banco'
import { lerParamsMotor } from './config-metas'
import { lerRegrasMotor } from './config-regras'
import { recursoAusente, marcarSeAusente } from '@/lib/db/recurso-ausente'
import { lerDetalhesMetas } from './plano-metas'
import { verificarInvariantes } from './invariantes'
import { horasDia, VERSAO_MOTOR, type Prog30 } from './motor30'
import type { Cfg28, AulaAS, ItemLP } from './motor28'
import { ColetorRastro, resultadoRastro, type EventoRastro } from './rastro'
import { diagnosticarInsuficiencia, ehInsuficiencia, maxSemanasEfetivo } from './diagnostico-insuficiencia'
import { resumirPorSemana, type LinhaSemana } from './analise-periodo'

// RASTRO DE DECISÃO por plano de aluno (admin, SOMENTE LEITURA). Backend-first: o motor roda aqui, SOB DEMANDA, com um coletor de rastro;
// nada é gravado e o plano/payload do aluno não carrega nenhum campo novo. É uma RE-SIMULAÇÃO com o estado atual do aluno (metas feitas
// fixas, progresso e desempenho atuais, regras vigentes do tenant) — mostra POR QUE o motor posiciona as metas como posiciona hoje; não
// reconstrói o histórico exato das gerações passadas. Resultado em cache de 60 s por plano (a paginação/filtro roda sobre ele).

const T_PLANO = 'simulado_cronograma_adaptativo_plano'
const T_META = 'simulado_cronograma_adaptativo_meta'

export interface AlunoRastro { id: string; nome: string; email: string }
export interface PlanoRastro { id: string; titulo: string | null; fixado: boolean }
export interface ResultadoRastro {
  aluno: AlunoRastro
  planos: PlanoRastro[]
  planoId: string | null
  titulo: string | null
  hoje: string
  /** plano gravado com o motor legado 2.8.1: sem rastro (a visão por semana continua). */
  legado: boolean
  erro?: string
  /** violações do plano gravado (até 40) e o total. */
  totalViolacoes: number
  eventos: EventoRastro[]
  descartados: number
  porSemana: LinhaSemana[]
  geradoEm: string
}
export type BuscaRastro = { ok: true; dados: ResultadoRastro } | { ok: false; error: string }

const esc = (s: string) => s.replace(/[\\%_]/g, (c) => '\\' + c)

export interface MetaMin { meta_id: string; estado: string | null; parcial_v: string | null; tempo_seg: number | null; grau: number | null; res: number | null; err: number | null; concluido_em?: string | null; cert?: number | null }

export async function lerMetasMin(svc: SupabaseClient, tenantId: string, planoId: string): Promise<MetaMin[]> {
  const base = 'meta_id,estado,parcial_v,tempo_seg,grau,res,err'
  if (!recursoAusente('col:meta.cert')) {
    const r0 = await svc.from(T_META).select(base + ',concluido_em,cert').eq('tenant_id', tenantId).eq('plano_id', planoId)
    if (!r0.error) return (r0.data as unknown as MetaMin[]) ?? []
    marcarSeAusente('col:meta.cert', r0.error.message)
  }
  const r1 = await svc.from(T_META).select(base).eq('tenant_id', tenantId).eq('plano_id', planoId)
  return (r1.data as unknown as MetaMin[]) ?? []
}

/** Procura o aluno pelo e-mail (exato, sem diferenciar caixa) no tenant e devolve o rastro do plano escolhido (ou do fixado/mais recente). */
export async function rastroDoAluno(svc: SupabaseClient, tenantId: string, email: string, planoId?: string | null): Promise<BuscaRastro> {
  const mail = email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+$/.test(mail)) return { ok: false, error: 'Informe o e-mail completo do aluno.' }
  const { data: est } = await svc.from('simulado_estudantes').select('id,nome,email').eq('tenant_id', tenantId).ilike('email', esc(mail)).limit(1).maybeSingle()
  if (!est) return { ok: false, error: 'Aluno não encontrado neste tenant.' }
  const aluno: AlunoRastro = { id: est.id as string, nome: (est.nome as string) ?? '', email: (est.email as string) ?? mail }
  const { data: lista } = await svc.from(T_PLANO).select('id,titulo,fixado,arquivada,criado_em').eq('tenant_id', tenantId).eq('estudante_id', aluno.id).eq('arquivada', false).eq('exemplo', false).order('criado_em', { ascending: false }).limit(20)
  const planos: PlanoRastro[] = ((lista ?? []) as Array<{ id: string; titulo: string | null; fixado: boolean | null }>).map((p) => ({ id: p.id, titulo: p.titulo ?? null, fixado: !!p.fixado }))
  if (!planos.length) return { ok: false, error: 'O aluno não tem plano do cronograma adaptativo ativo.' }
  const escolhido = planos.find((p) => p.id === planoId) ?? planos.find((p) => p.fixado) ?? planos[0]
  const dados = await remember<ResultadoRastro>(`crono-rastro:${tenantId}:${escolhido.id}`, 60, () => calcular(svc, tenantId, aluno, planos, escolhido))
  return { ok: true, dados }
}

async function calcular(svc: SupabaseClient, tenantId: string, aluno: AlunoRastro, planos: PlanoRastro[], p: PlanoRastro): Promise<ResultadoRastro> {
  const hoje = hojeCal()
  const base: ResultadoRastro = { aluno, planos, planoId: p.id, titulo: p.titulo, hoje, legado: false, totalViolacoes: 0, eventos: [], descartados: 0, porSemana: [], geradoEm: new Date().toISOString() }
  const { data: row } = await svc.from(T_PLANO).select('id,cfg,plano').eq('tenant_id', tenantId).eq('id', p.id).maybeSingle()
  if (!row) return { ...base, erro: 'Plano não encontrado.' }
  const cfg = (row.cfg ?? {}) as Cfg & { motor?: string }
  const gravado = (row.plano ?? {}) as Plano
  const [banco, regras, params, metas, detalhes] = await Promise.all([carregarConteudoBanco(svc, tenantId), lerRegrasMotor(svc, tenantId), lerParamsMotor(svc, tenantId), lerMetasMin(svc, tenantId, p.id), lerDetalhesMetas(svc, p.id)])
  const cfg28 = { ...cfg, motor: cfg.motor ?? VERSAO_MOTOR } as unknown as Cfg28
  // visão por semana + violações do plano GRAVADO (o que o aluno vê)
  let viol: ReturnType<typeof verificarInvariantes> = []
  try { viol = verificarInvariantes(gravado, regras, { start: cfg.start, horasDia: (d) => horasDia(cfg28, d), AS: banco.AS as AulaAS[], ordem: banco.ordem ?? undefined }) } catch { /* sem invariantes */ }
  base.totalViolacoes = viol.length
  try { base.porSemana = resumirPorSemana(gravado, cfg28, regras, viol) } catch (e) { base.erro = (e as Error)?.message }
  if (!planoUsaMotorAtual(cfg.motor)) return { ...base, legado: true }
  // re-simulação com o coletor (estado atual do aluno)
  const feitas = new Set(metas.filter((m) => m.estado === 'done').map((m) => m.meta_id))
  const prog: Record<string, Prog30> = {}
  const notas: Record<string, { grau?: number; res?: number; err?: number; cert?: number }> = {}
  for (const m of metas) {
    prog[m.meta_id] = { ...(m.estado === 'done' ? { s: 'done', ...(m.concluido_em ? { em: m.concluido_em.slice(0, 10) } : {}) } : {}), t: m.tempo_seg || 0, parou: m.parcial_v ? { v: m.parcial_v } : null }
    if (m.grau != null || m.res != null || m.err != null || m.cert != null) notas[m.meta_id] = { ...(m.grau != null ? { grau: m.grau } : {}), ...(m.res != null ? { res: m.res } : {}), ...(m.err != null ? { err: m.err } : {}), ...(m.cert != null ? { cert: m.cert } : {}) }
  }
  const fixos: Plano = {}
  for (const [id, v] of Object.entries(gravado)) if (Array.isArray(v) && (feitas.has(id) || v[0] < hoje)) fixos[id] = v
  const coletor = new ColetorRastro()
  try {
    gerarPlano(cfg, banco.AS as never, banco.WLP, fixos, hoje, (banco.LP ?? []) as ItemLP[], { manterMotor: true, ordem: banco.ordem, feitas, usados: metas.map((m) => m.meta_id), regras, params, notas, prog, hoje, planoAtual: gravado, detalhes: detalhes as never, ...(banco.GX?.length ? { gx: banco.GX } : {}), rastro: coletor })
  } catch (e) {
    if (ehInsuficiencia(e)) { // causa provável (estimativa pura, só leitura) p/ o suporte
      const d = diagnosticarInsuficiencia({ cfg: cfg as never, AS: banco.AS as never, maxSemanas: maxSemanasEfetivo(params, regras), velPadrao: params.velPadrao, regras })
      return { ...base, erro: `O plano não regenera — causa provável: ${d.causa.replace(/_/g, ' ')}. ${d.mensagem}`, ...(resultadoRastro(coletor) ?? { eventos: [], descartados: 0 }) }
    }
    return { ...base, erro: 'A re-simulação falhou: ' + ((e as Error)?.message ?? 'erro desconhecido'), ...(resultadoRastro(coletor) ?? { eventos: [], descartados: 0 }) }
  }
  const r = resultadoRastro(coletor)!
  return { ...base, eventos: r.eventos, descartados: r.descartados }
}
