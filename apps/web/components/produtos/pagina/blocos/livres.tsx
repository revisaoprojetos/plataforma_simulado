// Elementos LIVRES: TEXTO, BOTÃO, DIVISOR e INSTRUTORES. Cores por token (estilo.cor → dados.cor), nada de hex.
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Moldura, RICH_CLS, Txt, Vazio, dadosDoBloco, raioCss, type PropsRenderer } from './base'

const vazioHtml = (h: string) => !h.replace(/<[^>]*>/g, '').trim()

/* ───────── Texto ───────── */
export function RendererTexto(props: PropsRenderer<'texto'>) {
  const { bloco, modo, dispositivo } = props
  const dados = dadosDoBloco(bloco, props.dados)
  const c = bloco.conteudo, edicao = modo === 'edicao', raio = raioCss(bloco)
  if (!edicao && !c.titulo.trim() && vazioHtml(c.html)) return null
  const destaque = bloco.variacao === 'destaque'
  return (
    <Moldura bloco={bloco} modo={modo} dispositivo={dispositivo} dados={dados}>
      <section className={destaque ? 'space-y-2 rounded-2xl border border-l-4 bg-card p-5 shadow-sm' : 'space-y-2'}
        style={destaque ? { borderLeftColor: dados.cor, ...(raio ? { borderRadius: raio } : {}) } : undefined}>
        {(c.titulo.trim() || edicao) && <Txt modo={modo} blocoId={bloco.id} campo="conteudo.titulo" valor={c.titulo} as="h2" placeholder="Título" className="text-lg font-bold tracking-tight" />}
        {(!vazioHtml(c.html) || edicao) && <Txt modo={modo} blocoId={bloco.id} campo="conteudo.html" valor={c.html} rich as="div" placeholder="Escreva aqui…" className={`text-sm leading-relaxed ${RICH_CLS}`} />}
      </section>
    </Moldura>
  )
}

/* ───────── Botão ───────── */
const JUSTIFICA = { left: 'justify-start', center: 'justify-center', right: 'justify-end' } as const
export function RendererBotao(props: PropsRenderer<'botao'>) {
  const { bloco, modo, dispositivo } = props
  const dados = dadosDoBloco(bloco, props.dados)
  const c = bloco.conteudo, edicao = modo === 'edicao', cor = dados.cor, raio = raioCss(bloco)
  if (!edicao && !c.rotulo.trim()) return null
  const v = bloco.variacao
  const base = 'inline-flex items-center gap-2 text-sm font-semibold transition hover:opacity-90'
  const forma = v === 'link' ? 'underline-offset-4 hover:underline' : 'rounded-xl px-5 py-2.5'
  const estilo: React.CSSProperties = v === 'solido' ? { background: cor, color: 'white' }
    : v === 'contorno' ? { border: `2px solid ${cor}`, color: cor }
    : { color: cor }
  if (raio && v !== 'link') estilo.borderRadius = raio
  const rotulo = <Txt modo={modo} blocoId={bloco.id} campo="conteudo.rotulo" valor={c.rotulo} placeholder="Rótulo do botão" />
  const interno = c.link.startsWith('/')
  // Editor: elemento NÃO clicável (o contentEditable não funciona dentro de <a>).
  const alvo = edicao ? <span className={`${base} ${forma}`} style={estilo}>{rotulo}<ArrowRight className="h-4 w-4" /></span>
    : interno ? <Link href={c.link} className={`${base} ${forma}`} style={estilo}>{rotulo}<ArrowRight className="h-4 w-4" /></Link>
    : <a href={c.link || '#'} target={c.nova_aba ? '_blank' : undefined} rel={c.nova_aba ? 'noopener noreferrer' : undefined} className={`${base} ${forma}`} style={estilo}>{rotulo}<ArrowRight className="h-4 w-4" /></a>
  return (
    <Moldura bloco={bloco} modo={modo} dispositivo={dispositivo} dados={dados}>
      <div className={`flex ${JUSTIFICA[bloco.estilo.alinhamento ?? 'left']}`}>{alvo}</div>
    </Moldura>
  )
}

/* ───────── Divisor ───────── */
export function RendererDivisor(props: PropsRenderer<'divisor'>) {
  const { bloco, modo, dispositivo } = props
  const dados = dadosDoBloco(bloco, props.dados)
  const c = bloco.conteudo, edicao = modo === 'edicao'
  const linhaCor = bloco.estilo.cor ? dados.cor : undefined
  const linha = <span aria-hidden className="h-px flex-1 bg-border" style={linhaCor ? { background: linhaCor } : undefined} />
  const al = bloco.estilo.alinhamento ?? 'center'
  let corpo
  if (bloco.variacao === 'espaco') corpo = <div aria-hidden className="h-8" />
  else if (bloco.variacao === 'titulo' && (c.rotulo.trim() || edicao)) {
    corpo = (
      <div className="flex items-center gap-3">
        {al !== 'left' && linha}
        <Txt modo={modo} blocoId={bloco.id} campo="conteudo.rotulo" valor={c.rotulo} placeholder="Rótulo" className="shrink-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground" />
        {al !== 'right' && linha}
      </div>
    )
  } else corpo = <div className="flex items-center">{linha}</div>
  return <Moldura bloco={bloco} modo={modo} dispositivo={dispositivo} dados={dados}>{corpo}</Moldura>
}

/* ───────── Instrutores (só quando dados.instrutores não é vazio) ───────── */
export function RendererInstrutores(props: PropsRenderer<'instrutores'>) {
  const { bloco, modo, dispositivo } = props
  const dados = dadosDoBloco(bloco, props.dados)
  const ids = bloco.conteudo.ids
  const lista = ids.length ? dados.instrutores.filter((i) => ids.includes(i.id)) : dados.instrutores
  if (!lista.length) {
    if (modo === 'aluno') return null
    return <Moldura bloco={bloco} modo={modo} dispositivo={dispositivo} dados={dados}><Vazio>Nenhum instrutor cadastrado neste produto.</Vazio></Moldura>
  }
  const cor = dados.cor, raio = raioCss(bloco)
  const avatar = (i: (typeof lista)[number], tam: string) => i.foto_url
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={i.foto_url} alt="" className={`${tam} shrink-0 rounded-full object-cover`} />
    : <span className={`${tam} grid shrink-0 place-items-center rounded-full text-sm font-bold`} style={{ background: `color-mix(in srgb, ${cor} 15%, transparent)`, color: cor }}>{i.nome.trim().charAt(0).toUpperCase()}</span>
  const cards = bloco.variacao !== 'lista'
  return (
    <Moldura bloco={bloco} modo={modo} dispositivo={dispositivo} dados={dados}>
      <section className="space-y-3">
        {(bloco.nome || modo === 'edicao') && <h2 className="text-lg font-bold tracking-tight"><Txt modo={modo} blocoId={bloco.id} campo="nome" valor={bloco.nome ?? ''} placeholder="Professores" /></h2>}
        <div className={cards ? 'grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(15rem,1fr))]' : 'space-y-2'}>
          {lista.map((i) => (
            <div key={i.id} className={`flex items-center gap-3 border bg-card shadow-sm ${cards ? 'rounded-2xl p-4' : 'rounded-xl px-3 py-2'}`} style={raio ? { borderRadius: raio } : undefined}>
              {avatar(i, cards ? 'h-14 w-14' : 'h-9 w-9')}
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{i.nome}</div>
                {i.cargo && <div className="truncate text-xs text-muted-foreground">{i.cargo}</div>}
                {cards && i.bio && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{i.bio}</p>}
              </div>
            </div>
          ))}
        </div>
      </section>
    </Moldura>
  )
}
