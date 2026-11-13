import fs from 'node:fs'
import path from 'node:path'
import type { AtualizacaoScan, Severidade } from '../tipos'
import { PESO_SEVERIDADE } from '../tipos'

/**
 * Checagem de CVEs via OSV.dev (querybatch) para as dependências DIRETAS de produção listadas em
 * `deps-manifest.json` (gerado por `pnpm seguranca:manifest` a partir do package.json/lockfile).
 * Sem manifesto → pula graciosamente.
 */
export interface ManifestDep { nome: string; versao: string }
export interface Manifest { gerado_em?: string; deps: ManifestDep[] }

export function lerManifest(): Manifest | null {
  const candidatos = [
    path.join(process.cwd(), 'lib', 'seguranca', 'deps-manifest.json'),
    path.join(process.cwd(), 'apps', 'web', 'lib', 'seguranca', 'deps-manifest.json'),
    path.join(process.cwd(), '.next', 'server', 'deps-manifest.json'),
  ]
  for (const p of candidatos) {
    try {
      const j = JSON.parse(fs.readFileSync(p, 'utf8'))
      if (Array.isArray(j?.deps) && j.deps.length) return j as Manifest
    } catch { /* tenta o próximo */ }
  }
  return null
}

export function tipoDeSalto(atual: string, alvo: string): 'patch' | 'minor' | 'major' {
  const n = (v: string) => v.replace(/^[^\d]*/, '').split(/[.\-+]/).slice(0, 3).map((x) => parseInt(x, 10) || 0)
  const [a, b] = [n(atual), n(alvo)]
  if (b[0] !== a[0]) return 'major'
  if (b[1] !== a[1]) return 'minor'
  return 'patch'
}

function sevDeAdvisory(v: any): Severidade {
  const s = String(v?.database_specific?.severity ?? '').toUpperCase()
  if (s === 'CRITICAL') return 'critico'
  if (s === 'HIGH') return 'alto'
  if (s === 'LOW') return 'baixo'
  if (s === 'MODERATE' || s === 'MEDIUM') return 'medio'
  return 'alto' // desconhecida: assume alta (conservador)
}

function corrigidoEm(v: any, pacote: string): string | null {
  for (const aff of v?.affected ?? []) {
    if (aff?.package?.name !== pacote) continue
    for (const r of aff?.ranges ?? []) for (const ev of r?.events ?? []) if (ev?.fixed) return String(ev.fixed)
  }
  return null
}

export type OsvFetch = (url: string, init?: RequestInit) => Promise<Response>

export async function checarOsv(manifest: Manifest, f: OsvFetch = fetch): Promise<{ atualizacoes: AtualizacaoScan[]; erro?: string }> {
  const deps = manifest.deps.slice(0, 1000)
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), 20_000)
  try {
    const r = await f('https://api.osv.dev/v1/querybatch', {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: ctl.signal,
      body: JSON.stringify({ queries: deps.map((d) => ({ package: { name: d.nome, ecosystem: 'npm' }, version: d.versao.replace(/^[^\d]*/, '') })) }),
    })
    if (!r.ok) return { atualizacoes: [], erro: `OSV HTTP ${r.status}` }
    const j = (await r.json()) as { results?: { vulns?: { id: string }[] }[] }
    const porPacote: { dep: ManifestDep; ids: string[] }[] = []
    ;(j.results ?? []).forEach((res, i) => { const ids = (res.vulns ?? []).map((v) => v.id); if (ids.length) porPacote.push({ dep: deps[i], ids }) })

    // Detalhe (severidade/versão corrigida) para até 40 advisories; o restante assume severidade conservadora.
    const detalhes = new Map<string, any>()
    const unicos = [...new Set(porPacote.flatMap((p) => p.ids))].slice(0, 40)
    await Promise.all(unicos.map(async (id) => {
      try { const d = await f(`https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`, { signal: ctl.signal }); if (d.ok) detalhes.set(id, await d.json()) } catch { /* ignora */ }
    }))

    const atualizacoes: AtualizacaoScan[] = porPacote.map(({ dep, ids }) => {
      let sev: Severidade = 'baixo'
      let alvo: string | null = null
      for (const id of ids) {
        const d = detalhes.get(id)
        const s = d ? sevDeAdvisory(d) : 'alto'
        if (PESO_SEVERIDADE[s] > PESO_SEVERIDADE[sev]) sev = s
        const fx = d ? corrigidoEm(d, dep.nome) : null
        if (fx && (!alvo || fx > alvo)) alvo = fx
      }
      const atual = dep.versao.replace(/^[^\d]*/, '')
      return { pacote: dep.nome, versao_atual: atual, versao_alvo: alvo, tipo: alvo ? tipoDeSalto(atual, alvo) : 'patch', cve_ids: ids, severidade: sev }
    })
    return { atualizacoes }
  } catch (e: any) {
    return { atualizacoes: [], erro: `OSV: ${e?.message ?? e}` }
  } finally { clearTimeout(t) }
}
