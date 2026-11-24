import { Nota } from '../../_comp/lista'

/** Aviso (migração 20261112050000 ainda não aplicada) — antes aparecia no topo de TODAS as sub-abas do Adaptativo. */
export function AvisoMigracao() {
  return <Nota tipo="aviso">As regras, disciplinas editadas, versões e sprints deste painel dependem da migração 20261112050000_revisao_cronograma_duvidas.sql, ainda não aplicada neste banco. Enquanto isso, a cobertura das aulas funciona normalmente e as regras mostram os valores do motor e os padrões do 2.0 (sem salvar).</Nota>
}
