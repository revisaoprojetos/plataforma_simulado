// Elementos CARROSSEL e BANNER (vitrine) — visual exato de antes (SecaoVitrine/CardItem realocados de render-blocos.tsx).
import Link from 'next/link'
import { BookOpen, CalendarDays, ClipboardList } from 'lucide-react'
import type { VitrineItem } from '@/lib/produtos/aluno'
import { Moldura, Txt, Vazio, dadosDoBloco, raioCss, type PropsRenderer } from './base'

// Dimensões do card por tamanho da seção (espelha os layouts da Curseduca).
const CARD: Record<string, string> = {
  vertical_small: 'w-36 aspect-[3/4]',
  vertical_large: 'w-44 aspect-[3/4]',
  horizontal_small: 'w-56 aspect-video',
  horizontal_large: 'w-72 aspect-video',
  destaque: 'w-[22rem] aspect-[21/9]',
}
function iconeItem(tipo: string) {
  if (tipo === 'simulado') return ClipboardList
  if (tipo === 'cronograma') return CalendarDays
  return BookOpen
}

function CardItem({ it, size, cor, raio }: { it: VitrineItem; size: string; cor: string; raio?: string }) {
  const Icon = iconeItem(it.tipo)
  return (
    <Link href={it.href} className={`group relative flex shrink-0 flex-col justify-end overflow-hidden rounded-2xl border p-3 text-white shadow-sm transition-transform hover:-translate-y-0.5 ${size}`}
      style={{ background: `linear-gradient(160deg, color-mix(in srgb, ${cor} 70%, #000), color-mix(in srgb, ${cor} 30%, #000))`, ...(raio ? { borderRadius: raio } : {}) }}>
      <Icon className="absolute right-2 top-2 h-4 w-4 text-white/70" />
      <span className="line-clamp-3 text-sm font-semibold leading-tight">{it.nome}</span>
      {it.area && <span className="mt-1 text-[10px] uppercase tracking-wide text-white/70">{it.area}</span>}
    </Link>
  )
}

export function RendererCarrossel(props: PropsRenderer<'carrossel'>) {
  const { bloco, modo, dispositivo, resolvido } = props
  const dados = dadosDoBloco(bloco, props.dados)
  const s = resolvido?.kind === 'vitrine' ? resolvido.secao : dados.secoes[bloco.id]
  const itens = s?.itens ?? []
  if (!itens.length) {
    if (modo === 'aluno') return null
    return <Moldura bloco={bloco} modo={modo} dispositivo={dispositivo} dados={dados}><Vazio>Carrossel sem itens — adicione simulados, pastas ou cronogramas no painel.</Vazio></Moldura>
  }
  const size = CARD[bloco.variacao] ?? CARD[s?.tamanho ?? ''] ?? CARD.vertical_small
  const raio = raioCss(bloco)
  return (
    <Moldura bloco={bloco} modo={modo} dispositivo={dispositivo} dados={dados}>
      <section className="space-y-2">
        {modo === 'aluno'
          ? (bloco.nome && <h2 className="text-sm font-semibold">{bloco.nome}</h2>)
          : <h2 className="text-sm font-semibold"><Txt modo={modo} blocoId={bloco.id} campo="nome" valor={bloco.nome ?? ''} placeholder="Título do carrossel" /></h2>}
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
          {itens.map((it) => <CardItem key={`${it.tipo}:${it.id}`} it={it} size={size} cor={dados.cor} raio={raio} />)}
        </div>
      </section>
    </Moldura>
  )
}

export function RendererBanner(props: PropsRenderer<'banner'>) {
  const { bloco, modo, dispositivo } = props
  const dados = dadosDoBloco(bloco, props.dados)
  const c = bloco.conteudo
  if (!c.imagem) {
    if (modo === 'aluno') return null
    return <Moldura bloco={bloco} modo={modo} dispositivo={dispositivo} dados={dados}><Vazio>Banner sem imagem — escolha uma imagem no painel.</Vazio></Moldura>
  }
  const raio = raioCss(bloco)
  const cartao = bloco.variacao === 'cartao'
  const alt = c.alt || bloco.nome || ''
  const estiloImg = raio ? { borderRadius: raio } : undefined
  const img = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={c.imagem} alt={alt} style={estiloImg} className={`w-full object-cover ${cartao ? 'rounded-xl' : 'rounded-2xl border shadow-sm'} ${c.imagem_mobile ? '@max-[599px]:hidden' : ''}`} />
      {c.imagem_mobile && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.imagem_mobile} alt={alt} style={estiloImg} className={`hidden w-full object-cover @max-[599px]:block ${cartao ? 'rounded-xl' : 'rounded-2xl border shadow-sm'}`} />
      )}
    </>
  )
  const corpo = cartao ? <div className="rounded-2xl border bg-card p-2 shadow-sm" style={estiloImg}>{img}</div> : img
  return (
    <Moldura bloco={bloco} modo={modo} dispositivo={dispositivo} dados={dados} semFundo>
      {c.link ? <a href={c.link} target="_blank" rel="noreferrer" className="block">{corpo}</a> : corpo}
    </Moldura>
  )
}
