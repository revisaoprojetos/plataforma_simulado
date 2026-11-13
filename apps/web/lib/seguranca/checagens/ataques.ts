import type { AchadoScan, ResultadoChecagem } from '../tipos'

/** Sinais de ataque a partir do audit log existente (simulado_audit_logs). Tolerante a falhas. */
export interface EventoAudit { operacao: string; ip: string | null; dados_novos: any }

export const REGEX_INJECAO = /[,()"\\]|%27|%28|%29|\.or\(|\.eq\./i

/** Pura: agrega eventos das últimas 24h em achados. */
export function avaliarSinais(eventos: EventoAudit[]): AchadoScan[] {
  const out: AchadoScan[] = []
  const bloqueios = eventos.filter((e) => e.operacao === 'BLOQUEIO_AUTOMATICO').length
  if (bloqueios >= 20) {
    out.push({ categoria: 'rate_limit', severidade: bloqueios >= 100 ? 'alto' : 'medio', titulo: 'Pico de bloqueios automáticos (24h)', detalhe: `${bloqueios} eventos BLOQUEIO_AUTOMATICO no audit log.`, recomendacao: 'Investigar IPs de origem em /admin/acessos e /admin/auditoria.', fingerprint: 'ataque:pico-bloqueios' })
  }
  const porIp = new Map<string, number>()
  for (const e of eventos) if (e.operacao === 'LOGIN' && e.ip) porIp.set(e.ip, (porIp.get(e.ip) ?? 0) + 1)
  const topo = [...porIp.entries()].sort((a, b) => b[1] - a[1])[0]
  if (topo && topo[1] >= 200) {
    out.push({ categoria: 'rate_limit', severidade: 'medio', titulo: 'Um único IP concentra muitos logins em 24h', detalhe: `${topo[1]} logins do mesmo IP — possível credential stuffing/enumeração.`, recomendacao: 'Verificar o IP e considerar bloqueio no proxy.', fingerprint: 'ataque:ip-concentrado' })
  }
  const inj = eventos.filter((e) => {
    const em = e.dados_novos?.email
    return typeof em === 'string' && REGEX_INJECAO.test(em)
  }).length
  if (inj > 0) {
    out.push({ categoria: 'sqli', severidade: 'alto', titulo: 'Logins com caracteres de injeção no e-mail (24h)', detalhe: `${inj} evento(s) com , ( ) " ou \\ no e-mail — indica tentativa de injeção de filtro PostgREST.`, recomendacao: 'Sanitizar e-mail (emailSafe) e rejeitar caracteres inválidos.', fingerprint: 'ataque:email-injecao' })
  }
  return out
}

export async function checarSinais(svc: any): Promise<ResultadoChecagem> {
  try {
    const desde = new Date(Date.now() - 24 * 3600_000).toISOString()
    const { data, error } = await svc.from('simulado_audit_logs').select('operacao, ip, dados_novos').in('operacao', ['LOGIN', 'BLOQUEIO_AUTOMATICO']).gte('criado_em', desde).order('criado_em', { ascending: false }).limit(5000)
    if (error) return { nome: 'sinais', achados: [], erro: `audit: ${error.message}` }
    return { nome: 'sinais', achados: avaliarSinais((data ?? []) as EventoAudit[]) }
  } catch (e: any) {
    return { nome: 'sinais', achados: [], erro: String(e?.message ?? e) }
  }
}
