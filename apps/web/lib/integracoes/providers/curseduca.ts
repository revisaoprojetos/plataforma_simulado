import 'server-only'
import {
  testarCredenciais as cursTestar, listarTodosGrupos, listarMembrosDoGrupo, mapaMatriculasGrupo,
  type CurseducaCfg,
} from '@/lib/curseduca/client'
import { aguardarVaga, comCache, idCredencial } from '@/lib/integracoes/ratelimit'
import type { ProviderAdapter, ProviderCfg, FonteImport, PessoaEntitlement } from '@/lib/integracoes/tipos'

/**
 * Adaptador Curseduca sobre o núcleo genérico (Fase 1). Reusa o client existente
 * (`lib/curseduca/client.ts`) e canaliza as leituras pelo rate limiter + cache (§7.4).
 * Curseduca é PULL: fontes = grupos; entitlement = presença no grupo (status 'ativo').
 */

function toCursCfg(cfg: ProviderCfg): CurseducaCfg {
  const c = cfg.credenciais
  return { base: cfg.baseUrl, apiKey: c.api_key ?? '', user: c.usuario ?? '', pass: c.senha ?? '' }
}

const RATE = { maxPorJanela: 50, janelaMs: 60_000 } // teto conservador por key (ajustar ao limite real)

export const curseducaAdapter: ProviderAdapter = {
  provider: 'curseduca',

  async testarCredenciais(cfg) {
    return cursTestar(toCursCfg(cfg))
  },

  async listarFontes(cfg): Promise<FonteImport[]> {
    const cc = toCursCfg(cfg)
    const key = idCredencial('curseduca', cc.apiKey)
    // grupos mudam pouco → cache 5 min compartilhado (vários admins = 1 chamada)
    return comCache(`curseduca:grupos:${key}`, 300, async () => {
      await aguardarVaga('curseduca', key, RATE)
      const grupos = await listarTodosGrupos(cc)
      return grupos.map((g) => ({ ref: String(g.id), nome: g.nome }))
    })
  },

  async listarPessoas(cfg, refs): Promise<PessoaEntitlement[]> {
    const cc = toCursCfg(cfg)
    const key = idCredencial('curseduca', cc.apiKey)
    const out: PessoaEntitlement[] = []
    for (const ref of refs) {
      const groupId = Number(ref)
      if (!Number.isFinite(groupId)) continue
      await aguardarVaga('curseduca', key, RATE)
      const [membros, matriculas] = await Promise.all([
        listarMembrosDoGrupo(cc, groupId),
        mapaMatriculasGrupo(cc, groupId).catch(() => new Map()),
      ])
      for (const m of membros) {
        if (!m.email && !m.cpf) continue // sem identificador → descarta
        const mat = matriculas.get(m.id)
        out.push({
          pessoa: { nome: m.nome, email: m.email ?? null, cpf: m.cpf ?? null, telefone: m.telefone ?? null, externalId: String(m.id) },
          entitlement: {
            externalId: `curseduca:${groupId}:${m.id}`,
            produtoRef: String(groupId),
            status: 'ativo', // presença no grupo = ativo (a ausência vira revogação na reconciliação)
            inicioEm: mat?.entrouEm ?? null,
            expiraEm: mat?.expiraEm ?? null,
          },
        })
      }
    }
    return out
  },

  // Curseduca não tem webhook de entrada de grupo (§6.5) → sem parseWebhook/validarWebhook.
}
