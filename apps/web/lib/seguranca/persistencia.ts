import type { AchadoScan, AtualizacaoScan, OrigemVarredura, Severidade } from './tipos'
import { PESO_SEVERIDADE } from './tipos'

/**
 * Persistência com dedupe por fingerprint:
 *  - achado novo → insere (aberto); reaparece resolvido → reabre; piorou → atualiza severidade;
 *  - achado aberto que SUMIU (dentro dos prefixos cobertos) → resolvido;
 *  - ignorado/aceito permanecem (só renovam ultima_vez);
 *  - notificação in-app SÓ para novo/reaberto/piorado com severidade crítica/alta (sem spam).
 */
type Svc = any

const CHUNK = 80
const critOuAlto = (s: Severidade) => s === 'critico' || s === 'alto'

export interface ResultadoPersistencia {
  novos: string[]
  reabertos: string[]
  piorados: string[]
  resolvidos: string[]
  persistentes: string[]
  notificados: number
}

export interface Contagem { total: number; criticos: number; altos: number; medios: number; baixos: number }
export function contar(achados: { severidade: Severidade }[]): Contagem {
  return {
    total: achados.length,
    criticos: achados.filter((a) => a.severidade === 'critico').length,
    altos: achados.filter((a) => a.severidade === 'alto').length,
    medios: achados.filter((a) => a.severidade === 'medio').length,
    baixos: achados.filter((a) => a.severidade === 'baixo').length,
  }
}

export async function iniciarVarredura(svc: Svc, origem: OrigemVarredura): Promise<string | null> {
  const { data, error } = await svc.from('seguranca_varreduras').insert({ origem }).select('id').single()
  if (error) { console.error('[seguranca] iniciarVarredura:', error.message); return null }
  return data.id as string
}

export async function finalizarVarredura(svc: Svc, id: string | null, resumo: Record<string, unknown>, c: Contagem) {
  if (!id) return
  await svc.from('seguranca_varreduras').update({
    finalizado_em: new Date().toISOString(), resumo,
    total_achados: c.total, criticos: c.criticos, altos: c.altos, medios: c.medios, baixos: c.baixos,
  }).eq('id', id)
}

export async function persistirAchados(
  svc: Svc, achados: AchadoScan[], opts: { origem: OrigemVarredura; varreduraId: string | null; prefixos: string[] },
): Promise<ResultadoPersistencia> {
  const agora = new Date().toISOString()
  const res: ResultadoPersistencia = { novos: [], reabertos: [], piorados: [], resolvidos: [], persistentes: [], notificados: 0 }

  // Dedupe interno por fingerprint (mantém a pior severidade).
  const mapa = new Map<string, AchadoScan>()
  for (const a of achados) {
    const e = mapa.get(a.fingerprint)
    if (!e || PESO_SEVERIDADE[a.severidade] > PESO_SEVERIDADE[e.severidade]) mapa.set(a.fingerprint, a)
  }
  const lista = [...mapa.values()]

  const existentes = new Map<string, any>()
  for (let i = 0; i < lista.length; i += CHUNK) {
    const fps = lista.slice(i, i + CHUNK).map((a) => a.fingerprint)
    const { data } = await svc.from('seguranca_achados').select('id, fingerprint, severidade, status').in('fingerprint', fps)
    for (const r of data ?? []) existentes.set(r.fingerprint, r)
  }

  const notifs: { achado_id: string; titulo: string; mensagem: string; severidade: Severidade }[] = []
  const novosRows: any[] = []

  for (const a of lista) {
    const ex = existentes.get(a.fingerprint)
    if (!ex) {
      novosRows.push({
        varredura_id: opts.varreduraId, categoria: a.categoria, severidade: a.severidade, titulo: a.titulo, detalhe: a.detalhe ?? null,
        arquivo: a.arquivo ?? null, recomendacao: a.recomendacao ?? null, status: 'aberto', fingerprint: a.fingerprint,
        primeira_vez: agora, ultima_vez: agora, origem: opts.origem,
      })
      res.novos.push(a.fingerprint)
      continue
    }
    const patch: Record<string, unknown> = {
      varredura_id: opts.varreduraId, ultima_vez: agora, titulo: a.titulo, detalhe: a.detalhe ?? null,
      arquivo: a.arquivo ?? null, recomendacao: a.recomendacao ?? null, categoria: a.categoria,
    }
    let notificar = false
    if (ex.status === 'resolvido') {
      patch.status = 'aberto'; patch.resolvido_em = null; patch.severidade = a.severidade
      res.reabertos.push(a.fingerprint); notificar = critOuAlto(a.severidade)
    } else if (PESO_SEVERIDADE[a.severidade as Severidade] > PESO_SEVERIDADE[ex.severidade as Severidade]) {
      patch.severidade = a.severidade
      res.piorados.push(a.fingerprint); notificar = ex.status === 'aberto' && critOuAlto(a.severidade)
    } else {
      res.persistentes.push(a.fingerprint)
    }
    await svc.from('seguranca_achados').update(patch).eq('id', ex.id)
    if (notificar) notifs.push({ achado_id: ex.id, titulo: a.titulo, mensagem: `Reaberto/agravado (${a.severidade}). ${a.recomendacao ?? ''}`.trim(), severidade: a.severidade })
  }

  for (let i = 0; i < novosRows.length; i += CHUNK) {
    const { data, error } = await svc.from('seguranca_achados').insert(novosRows.slice(i, i + CHUNK)).select('id, fingerprint, severidade, titulo, recomendacao')
    if (error) { console.error('[seguranca] insert achados:', error.message); continue }
    for (const r of data ?? []) {
      if (critOuAlto(r.severidade)) notifs.push({ achado_id: r.id, titulo: r.titulo, mensagem: `Novo achado ${r.severidade}. ${r.recomendacao ?? ''}`.trim(), severidade: r.severidade })
    }
  }

  // Resolve o que sumiu: abertos cujo fingerprint começa com um prefixo coberto e que não apareceram agora.
  // (achados da auditoria manual têm prefixo "manual-" e nunca são resolvidos automaticamente)
  const vistos = new Set(lista.map((a) => a.fingerprint))
  for (const prefixo of opts.prefixos) {
    const { data } = await svc.from('seguranca_achados').select('id, fingerprint').eq('status', 'aberto').like('fingerprint', `${prefixo.replace(/[%_]/g, '')}%`).limit(2000)
    const sumidos = (data ?? []).filter((r: any) => !vistos.has(r.fingerprint))
    for (let i = 0; i < sumidos.length; i += CHUNK) {
      const ids = sumidos.slice(i, i + CHUNK).map((r: any) => r.id)
      await svc.from('seguranca_achados').update({ status: 'resolvido', resolvido_em: agora, motivo_status: 'Não detectado na varredura mais recente' }).in('id', ids)
    }
    res.resolvidos.push(...sumidos.map((r: any) => r.fingerprint))
  }

  if (notifs.length) {
    const { error } = await svc.from('seguranca_notificacoes').insert(notifs.map((n) => ({ ...n, link: '/admin/seguranca?aba=achados' })))
    if (!error) res.notificados = notifs.length
    else console.error('[seguranca] notificacoes:', error.message)
  }
  return res
}

/** Converte atualizações com CVE em achados (categoria dependencias). `escopo` = 'osv' | 'audit'. */
export function achadosDeAtualizacoes(atualizacoes: AtualizacaoScan[], escopo: 'osv' | 'audit'): AchadoScan[] {
  return atualizacoes.filter((u) => (u.cve_ids?.length ?? 0) > 0).map((u) => ({
    categoria: 'dependencias', severidade: u.severidade,
    titulo: `${u.pacote}@${u.versao_atual ?? '?'} com vulnerabilidade conhecida`,
    detalhe: `${(u.cve_ids ?? []).slice(0, 8).join(', ')}${(u.cve_ids?.length ?? 0) > 8 ? '…' : ''}`,
    recomendacao: u.versao_alvo ? `Atualizar para ${u.versao_alvo} (${u.tipo}).` : 'Atualizar para a versão corrigida mais recente.',
    fingerprint: `dep:${escopo}:${u.pacote}`,
  }))
}

export async function persistirAtualizacoes(svc: Svc, lista: AtualizacaoScan[], origem: string, cobreTudo: boolean) {
  const agora = new Date().toISOString()
  const nomes = lista.map((u) => u.pacote)
  const existentes = new Map<string, any>()
  for (let i = 0; i < nomes.length; i += CHUNK) {
    const { data } = await svc.from('seguranca_atualizacoes').select('*').in('pacote', nomes.slice(i, i + CHUNK))
    for (const r of data ?? []) existentes.set(r.pacote, r)
  }
  const rows = lista.map((u) => {
    const ex = existentes.get(u.pacote)
    const cves = [...new Set([...(ex?.cve_ids ?? []), ...(u.cve_ids ?? [])])]
    const sev = ex && PESO_SEVERIDADE[ex.severidade as Severidade] > PESO_SEVERIDADE[u.severidade] ? ex.severidade : u.severidade
    return {
      pacote: u.pacote, versao_atual: u.versao_atual ?? ex?.versao_atual ?? null, versao_alvo: u.versao_alvo ?? ex?.versao_alvo ?? null,
      tipo: u.tipo, cve_ids: cves, severidade: sev, status: 'pendente', atualizado_em: agora, origem,
      ...(ex ? {} : { detectado_em: agora }),
    }
  })
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await svc.from('seguranca_atualizacoes').upsert(rows.slice(i, i + CHUNK), { onConflict: 'pacote' })
    if (error) console.error('[seguranca] atualizacoes:', error.message)
  }
  if (cobreTudo) {
    // Pendentes desta origem que não vieram → já foram atualizadas.
    const { data } = await svc.from('seguranca_atualizacoes').select('id, pacote').eq('origem', origem).eq('status', 'pendente').limit(3000)
    const vistos = new Set(nomes)
    const ids = (data ?? []).filter((r: any) => !vistos.has(r.pacote)).map((r: any) => r.id)
    for (let i = 0; i < ids.length; i += CHUNK) await svc.from('seguranca_atualizacoes').update({ status: 'aplicada', atualizado_em: agora }).in('id', ids.slice(i, i + CHUNK))
  }
}
