// A página do extensivo (aluno) agora é desenhada pelos RENDERERS COMPARTILHADOS admin/aluno
// (components/produtos/pagina/blocos → <PaginaRender modo="aluno"/>). Este arquivo mantém só a ponte com o resultado
// do servidor (montarItensPagina): blocos na ordem final + itens já resolvidos (módulos/cronograma/vitrine).
import { PaginaRender } from '@/components/produtos/pagina/blocos'
import type { DadosPagina } from '@/lib/produtos/pagina/dados'
import type { ItemPagina } from '@/lib/produtos/pagina/loader'
import type { BlocoAluno } from '@/lib/produtos/pagina-extensivo'
import type { BlocoV1 } from '@/lib/produtos/pagina/tipos'

export function PaginaAluno({ itens, dados }: { itens: ItemPagina[]; dados: DadosPagina }) {
  const resolvidos: Record<string, BlocoAluno> = {}
  for (const i of itens) if (i.aluno) resolvidos[i.bloco.id] = i.aluno
  return <PaginaRender modo="aluno" blocos={itens.map((i) => i.bloco as BlocoV1)} dados={dados} resolvidos={resolvidos} />
}
