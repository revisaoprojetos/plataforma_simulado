import { createAdminClient } from '@/lib/supabase/server'
import type { AchadoScan, OrigemVarredura, ResultadoChecagem } from './tipos'
import { checarBanco } from './checagens/banco'
import { checarConfig } from './checagens/config'
import { checarHttp } from './checagens/http'
import { checarSinais } from './checagens/ataques'
import { checarOsv, lerManifest } from './checagens/osv'
import {
  achadosDeAtualizacoes, contar, finalizarVarredura, iniciarVarredura, persistirAchados, persistirAtualizacoes,
} from './persistencia'

/** Prefixo de fingerprint coberto por cada checagem (p/ resolver só o que foi realmente verificado). */
const PREFIXO_CHECAGEM: Record<string, string> = { banco: 'banco:', config: 'config:', http: 'http:', sinais: 'ataque:', osv: 'dep:osv:' }

function urlPublica(): string | undefined {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.SITE_URL || undefined
}

/** Executa as checagens de RUNTIME (o container não tem o fonte), persiste e notifica. */
export async function executarVarreduraRuntime(origem: OrigemVarredura, opts?: { baseUrl?: string }) {
  const svc = createAdminClient()
  const varreduraId = await iniciarVarredura(svc, origem)
  const executar = async (nome: string, fn: () => Promise<ResultadoChecagem> | ResultadoChecagem): Promise<ResultadoChecagem> => {
    try { return await fn() } catch (e: any) { return { nome, achados: [], erro: String(e?.message ?? e) } }
  }

  const resultados = await Promise.all([
    executar('banco', () => checarBanco(svc as any)),
    executar('config', () => checarConfig()),
    executar('http', () => checarHttp(opts?.baseUrl ?? urlPublica())),
    executar('sinais', () => checarSinais(svc)),
  ])

  // Atualizações/CVEs via OSV (manifesto embutido no build; ausente → pula).
  const manifest = lerManifest()
  let osvOk = false
  let osvErro: string | undefined
  let achadosOsv: AchadoScan[] = []
  if (manifest) {
    const osv = await checarOsv(manifest)
    if (osv.erro) osvErro = osv.erro
    else {
      osvOk = true
      await persistirAtualizacoes(svc, osv.atualizacoes, 'cron', true)
      achadosOsv = achadosDeAtualizacoes(osv.atualizacoes, 'osv')
    }
  } else osvErro = 'deps-manifest.json ausente — checagem OSV pulada'

  const ok = resultados.filter((r) => !r.erro)
  const achados = [...ok.flatMap((r) => r.achados), ...achadosOsv]
  const prefixos = [...ok.map((r) => PREFIXO_CHECAGEM[r.nome]).filter(Boolean), ...(osvOk ? [PREFIXO_CHECAGEM.osv] : [])]

  const p = await persistirAchados(svc, achados, { origem, varreduraId, prefixos })
  const erros = [...resultados.filter((r) => r.erro).map((r) => `${r.nome}: ${r.erro}`), ...(osvErro ? [osvErro] : [])]
  const resumo = {
    checagens: [...resultados.map((r) => r.nome), ...(manifest ? ['osv'] : [])],
    erros, novos: p.novos, reabertos: p.reabertos, piorados: p.piorados, resolvidos: p.resolvidos, persistentes: p.persistentes, notificados: p.notificados,
    atual: achados.map((a) => ({ fp: a.fingerprint, sev: a.severidade, titulo: a.titulo })),
  }
  await finalizarVarredura(svc, varreduraId, resumo, contar(achados))
  return { varreduraId, ...contar(achados), novos: p.novos.length, resolvidos: p.resolvidos.length, notificados: p.notificados, erros }
}
