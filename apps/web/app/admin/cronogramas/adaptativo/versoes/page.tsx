import { SemPermissao } from '@/components/ui/alert-box'
import { AdaptativoTabs } from '@/components/admin/adaptativo-tabs'
import { formatBrt } from '@/lib/brt'
import { REGRAS_PADRAO } from '@/lib/cronograma/adaptativo/regras'
import { diffRegras, regrasDoDelta } from '@/lib/cronograma/adaptativo/regras-campos'
import { createAdminClient } from '@/lib/supabase/server'
import { carregarPaginaRegras } from '../regras-pagina'
import { listarVersoes } from '../regras-actions'
import { VersoesClient, type VersaoLinha } from './versoes-client'

export const dynamic = 'force-dynamic'

// Admin: Cronograma Adaptativo — VERSÕES das regras (últimas 20). Os diffs são calculados aqui no servidor.
export default async function VersoesPage() {
  const p = await carregarPaginaRegras()
  if (p.semAcesso) return <SemPermissao>Você não tem permissão para ver o histórico de regras do cronograma adaptativo.</SemPermissao>
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
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cronograma adaptativo · Versões</h1>
        <p className="text-muted-foreground">Histórico das últimas 20 versões das regras do motor desta plataforma, com o que mudou em relação ao padrão e à versão em vigor. Horários em Brasília.</p>
      </div>
      <AdaptativoTabs />
      {!r.ok ? <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{r.error ?? 'Falha ao carregar.'}</div>
        : <VersoesClient linhas={linhas} versaoAtual={p.registro.versao} podeEditar={p.podeEditar} />}
    </div>
  )
}
