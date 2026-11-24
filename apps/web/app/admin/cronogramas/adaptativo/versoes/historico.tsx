import { formatBrt } from '@/lib/brt'
import { REGRAS_PADRAO } from '@/lib/cronograma/adaptativo/regras'
import { diffRegras, regrasDoDelta } from '@/lib/cronograma/adaptativo/regras-campos'
import { createAdminClient } from '@/lib/supabase/server'
import { carregarPaginaRegras } from '../regras-pagina'
import { listarVersoes } from '../regras-actions'
import { VersoesClient, type VersaoLinha } from './versoes-client'

// Histórico das últimas 20 versões das regras do motor (diffs calculados aqui no servidor). Seção da vista "Versões" do shell
// (?aba=adaptativo&sub=versoes&v=versoes); a rota antiga /admin/cronogramas/adaptativo/versoes redireciona para lá.
export async function HistoricoRegras() {
  const p = await carregarPaginaRegras()
  if (p.semAcesso) return null
  const r = await listarVersoes()
  const vigente = p.registro.regras
  // nome do autor: 1 consulta em lote por ids únicos (≤ 21 versões → bem abaixo do chunk de 80); sem nome cai no id curto.
  const ids = [...new Set((r.dados ?? []).map((v) => v.atualizadoPor).filter((x): x is string => !!x))].slice(0, 80)
  const nomes = new Map<string, string>()
  if (ids.length) {
    const { data: us } = await createAdminClient().from('simulado_users').select('id,nome,email').in('id', ids)
    for (const u of (us ?? []) as Array<{ id: string; nome: string | null; email: string | null }>) { const n = u.nome?.trim() || u.email?.trim(); if (n) nomes.set(u.id, n) }
  }
  const linhas: VersaoLinha[] = (r.dados ?? []).map((v) => {
    const regras = regrasDoDelta(v.delta)
    return {
      versao: v.versao, hash: v.hash, motivo: v.motivo ?? null, atual: v.versao === p.registro.versao,
      quando: v.atualizadoEm, quandoBrt: formatBrt(v.atualizadoEm), autor: v.atualizadoPor ? (nomes.get(v.atualizadoPor) ?? null) : null, autorId: v.atualizadoPor,
      vsPadrao: diffRegras(REGRAS_PADRAO, regras), vsVigente: diffRegras(vigente, regras),
    }
  })
  return (
    <section className="w-full space-y-3">
      <div><h2 className="text-base font-semibold">Histórico das regras do motor</h2><p className="text-sm text-muted-foreground">Últimas 20 versões das regras desta plataforma, com o que mudou em relação ao padrão e à versão em vigor. Horários em Brasília.</p></div>
      {!r.ok ? <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{r.error ?? 'Falha ao carregar.'}</div>
        : <VersoesClient linhas={linhas} versaoAtual={p.registro.versao} podeEditar={p.podeEditar} />}
    </section>
  )
}
