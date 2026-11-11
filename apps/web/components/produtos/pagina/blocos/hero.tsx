// Elemento HERO (capa do produto). Variação 'banner' = visual EXATO de antes (grade + partículas + "R" animado).
import Link from 'next/link'
import { ArrowLeft, CalendarClock } from 'lucide-react'
import { RevisaoParticulas } from '@/components/brand/loadings/revisao-particulas'
import { REVISAO_R_PATH, REVISAO_R_OUTLINE } from '@/components/brand/brand-marks'
import { corCss, TEXTO_SOBRE } from '@/lib/produtos/pagina/tokens'
import { Moldura, Txt, dadosDoBloco, raioCss, type PropsRenderer } from './base'

const KEYFRAMES = '@keyframes extDraw{to{stroke-dashoffset:0}}@keyframes extRun{to{stroke-dashoffset:-422}}@keyframes extFade{from{opacity:0}to{opacity:1}}.ext-trace-base{stroke-dasharray:420;stroke-dashoffset:420;animation:extDraw 2.6s cubic-bezier(.6,.1,.2,1) .4s forwards}.ext-trace-run{stroke-dasharray:22 400;opacity:0;animation:extFade .6s ease-out 3s forwards,extRun 7s linear 3s infinite}@media (prefers-reduced-motion:reduce){.ext-trace-base{stroke-dashoffset:0;animation:none}.ext-trace-run{display:none}}'
const ALINHA_ITENS = { left: '', center: 'flex flex-col items-center text-center', right: 'flex flex-col items-end text-right' } as const

export function RendererHero(props: PropsRenderer<'hero'>) {
  const { bloco, modo, dispositivo, primeiro } = props
  const dados = dadosDoBloco(bloco, props.dados)
  const p = dados.produto, c = bloco.conteudo, edicao = modo === 'edicao'
  const cor = dados.cor, cor2 = dados.cor2
  const fundo = corCss(bloco.estilo.fundo, { cor, cor2 })           // estilo.fundo substitui a cor-base do gradiente
  const base = fundo ?? cor
  const textoSobre = bloco.estilo.fundo ? TEXTO_SOBRE[bloco.estilo.fundo] : undefined
  const bannerUrl = c.imagem || p.banner_url
  const v = bloco.variacao
  const descricao = c.descricao || p.descricao
  const efeitos = v === 'banner'
  const raio = raioCss(bloco)

  let bg: React.CSSProperties
  if (v === 'simples') bg = { background: base }
  else if (v === 'imagem' && bannerUrl) bg = { backgroundImage: `linear-gradient(180deg, color-mix(in srgb, ${base} 60%, transparent), color-mix(in srgb, ${cor2} 75%, #000)), url(${bannerUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
  else if (bannerUrl) bg = { backgroundImage: `linear-gradient(135deg, color-mix(in srgb, ${base} 82%, transparent), color-mix(in srgb, ${cor2} 60%, #000)), url(${bannerUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
  else bg = { background: `linear-gradient(135deg, ${base}, color-mix(in srgb, ${cor2} 60%, #000))` }
  if (textoSobre) bg.color = corCss(textoSobre, { cor, cor2 })
  if (raio) bg.borderRadius = raio
  const alinha = ALINHA_ITENS[bloco.estilo.alinhamento ?? 'left']
  const cText = textoSobre ? '' : 'text-white'
  const cSub = textoSobre ? 'opacity-85' : 'text-white/85'

  return (
    <Moldura bloco={bloco} modo={modo} dispositivo={dispositivo} dados={dados} primeiro={primeiro} sangrar={!raio} semFundo>
      <div className={`relative min-h-[260px] overflow-hidden p-6 shadow-sm @4xl:min-h-[320px] @xl:p-8 @xl:pb-12 ${cText}`} style={bg}>
        {efeitos && (
          <>
            {/* Grade fixa + quadradinhos que acendem (mesmo efeito do loading/login) + linha percorrendo o contorno do "R" */}
            <style>{KEYFRAMES}</style>
            <span aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px)', backgroundSize: '64px 64px' }} />
            <RevisaoParticulas quadrados />
            <svg aria-hidden viewBox="0 0 68 66" className="pointer-events-none absolute -bottom-4 right-6 h-[210px] w-[216px] @xl:right-12">
              <path fillRule="evenodd" fill="rgba(255,255,255,.06)" d={REVISAO_R_PATH} />
              <path className="ext-trace-base" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="0.35" d={REVISAO_R_OUTLINE} />
              <path className="ext-trace-run" fill="none" stroke="var(--pn-f1c232,#F1C232)" strokeWidth="0.55" strokeLinecap="round" d={REVISAO_R_OUTLINE} />
            </svg>
          </>
        )}
        <div className="relative flex h-full min-h-[212px] flex-col justify-between gap-6 @4xl:min-h-[264px]">
          {c.mostrar_voltar ? (
            <Link href={dados.voltar.href} className="mb-0 inline-flex items-center gap-1.5 self-start rounded-full bg-white/15 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/25">
              <ArrowLeft className="h-4 w-4" />Voltar
            </Link>
          ) : <span />}
          <div className={alinha || undefined}>
            {c.mostrar_logo && p.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.logo_url} alt="" className="mb-3 h-9 w-auto" />
            )}
            <Txt modo={modo} blocoId={bloco.id} campo="conteudo.titulo" valor={c.titulo} fallback={p.nome} as="h1" className={`text-2xl font-bold tracking-tight @xl:text-4xl ${cText}`} />
            {c.mostrar_descricao && (descricao || edicao) && (
              <Txt modo={modo} blocoId={bloco.id} campo="conteudo.descricao" valor={c.descricao} fallback={p.descricao ?? ''} as="p" placeholder="Descrição do produto" className={`mt-1 max-w-2xl text-sm ${cSub}`} />
            )}
            {c.mostrar_validade && p.expira_em && (
              <div className={`mt-3 inline-flex items-center gap-1 text-xs ${cSub}`}><CalendarClock className="h-3.5 w-3.5" />Acesso até {new Date(p.expira_em).toLocaleDateString('pt-BR')}</div>
            )}
          </div>
        </div>
      </div>
    </Moldura>
  )
}
