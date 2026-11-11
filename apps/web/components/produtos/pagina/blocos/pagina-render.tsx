// <PaginaRender/> e <BlocoRender/>: o MESMO render para o aluno (modo 'aluno', servidor) e para o canvas do editor
// (modo 'edicao', cliente). Responsivo por CONTAINER QUERY: este wrapper é o `@container`; no editor o canvas controla a
// largura (1400/820/390) e `data-dispositivo` marca o dispositivo simulado (visibilidade por bloco usa `dispositivo`).
import type { ComponentType } from 'react'
import type { BlocoAluno } from '@/lib/produtos/pagina-extensivo'
import type { DadosPagina } from '@/lib/produtos/pagina/dados'
import type { BlocoV1, Dispositivo, TemaPagina } from '@/lib/produtos/pagina/tipos'
import type { ModoRender } from '@/lib/produtos/pagina/registro'
import { corCss, TEXTO_SOBRE } from '@/lib/produtos/pagina/tokens'
import { RENDERERS } from './registro-renderers'
import { resolverLocal } from './resolver-local'

export interface BlocoRenderProps {
  bloco: BlocoV1; modo: ModoRender; dados: DadosPagina; dispositivo?: Dispositivo
  /** Item resolvido no servidor (aluno). No editor é calculado de `dados` (resolverLocal). */
  resolvido?: BlocoAluno
  primeiro?: boolean
}

export function BlocoRender({ bloco, modo, dados, dispositivo = 'desktop', resolvido, primeiro }: BlocoRenderProps) {
  const R = RENDERERS[bloco.tipo] as ComponentType<any>
  const res = resolvido ?? (modo === 'edicao' ? resolverLocal([bloco], dados)[bloco.id] : undefined)
  return <R bloco={bloco} modo={modo} dispositivo={dispositivo} dados={dados} resolvido={res} primeiro={primeiro} />
}

export interface PaginaRenderProps {
  blocos: BlocoV1[]; dados: DadosPagina; modo: ModoRender; dispositivo?: Dispositivo
  /** Aluno: itens resolvidos no servidor por montarItensPagina (id do bloco → BlocoAluno). */
  resolvidos?: Record<string, BlocoAluno>
  tema?: TemaPagina
  className?: string
}

export function PaginaRender({ blocos, dados, modo, dispositivo = 'desktop', resolvidos, tema, className }: PaginaRenderProps) {
  const disp: Dispositivo = modo === 'edicao' ? dispositivo : 'desktop' // aluno: ignora (a largura do container decide)
  const res = resolvidos ?? resolverLocal(blocos, dados)
  const lista = modo === 'aluno' ? blocos.filter((b) => b.ativo) : blocos
  const fundo = tema?.fundo ? corCss(tema.fundo, { cor: dados.cor, cor2: dados.cor2 }) : undefined
  const textoFundo = tema?.fundo ? TEXTO_SOBRE[tema.fundo] : undefined
  return (
    <div className={`@container w-full space-y-6 ${className ?? ''}`.trim()} data-dispositivo={modo === 'edicao' ? disp : undefined}
      style={fundo ? { background: fundo, color: textoFundo ? corCss(textoFundo, { cor: dados.cor, cor2: dados.cor2 }) : undefined } : undefined}>
      {lista.map((b, i) => {
        // tema → padrões dos elementos sem estilo próprio (cor de destaque, raio, espaço)
        const bloco = tema && (tema.cor || tema.raio || tema.espaco) && (!b.estilo.cor || !b.estilo.raio || !b.estilo.espaco)
          ? { ...b, estilo: { ...b.estilo, cor: b.estilo.cor ?? tema.cor, raio: b.estilo.raio ?? tema.raio, espaco: b.estilo.espaco ?? tema.espaco } } as BlocoV1
          : b
        return <BlocoRender key={b.id} bloco={bloco} modo={modo} dados={dados} dispositivo={disp} resolvido={res[b.id]} primeiro={i === 0} />
      })}
    </div>
  )
}
