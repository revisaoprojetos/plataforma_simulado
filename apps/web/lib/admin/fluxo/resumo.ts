/** Resumo textual de nós condição/ação para o canvas e o painel (genérico: usa o catálogo do adaptador). Puro. */
import { ROTULO_OP, type AcaoUsuario, type CatalogoExecutavel, type Condicao, type NoUsuario } from './overlay'

export function resumirCondicao(c: Condicao | undefined, cat: CatalogoExecutavel | null): string {
  if (!c || !c.ou.length) return 'sem condição própria'
  return c.ou.map((g) => g.map((x) => {
    const v = cat?.variaveis.find((y) => y.chave === x.variavel)
    const val = x.valor.map((k) => v?.opcoes?.find((o) => o.valor === String(k))?.rotulo ?? String(k)).join(', ')
    return `${v?.rotulo.split(' (')[0] ?? x.variavel} ${ROTULO_OP[x.op]} ${val}`
  }).join(' E ')).join(' OU ')
}
export function resumirAcao(a: AcaoUsuario | undefined, cat: CatalogoExecutavel | null): string {
  if (!a) return 'sem ação'
  const def = cat?.acoes.find((x) => x.tipo === a.tipo)
  if (!def) return a.tipo
  const partes = def.params.map((p) => {
    const v = a[p.chave]
    if (v == null || v === '') return null
    return p.tipo === 'opcao' ? p.opcoes?.find((o) => o.valor === v)?.rotulo ?? String(v) : p.tipo === 'texto' ? `“${String(v).slice(0, 40)}”` : String(v)
  }).filter(Boolean)
  return `${def.rotulo}${partes.length ? ': ' + partes.join(' · ') : ''}`
}
export function resumirNoUsuario(n: NoUsuario, cat: CatalogoExecutavel | null): string | undefined {
  if (n.tipo === 'condicao') return resumirCondicao(n.condicao, cat)
  if (n.tipo === 'acao') return resumirAcao(n.acao, cat)
  return undefined
}
