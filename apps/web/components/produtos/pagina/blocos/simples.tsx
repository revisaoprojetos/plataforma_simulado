// Elementos AVISOS, CONTINUAR e PROGRESSO — visual exato de antes na variação padrão.
import Link from 'next/link'
import { ChevronRight, Megaphone, Pin } from 'lucide-react'
import { ProgressoGeral } from './curriculo-ui'
import { Moldura, Txt, Vazio, dadosDoBloco, raioCss, type PropsRenderer } from './base'

export function RendererAvisos(props: PropsRenderer<'avisos'>) {
  const { bloco, modo, dispositivo } = props
  const dados = dadosDoBloco(bloco, props.dados)
  const avisos = dados.avisos.slice(0, bloco.conteudo.max)
  const cor = dados.cor, raio = raioCss(bloco)
  if (avisos.length === 0) {
    if (modo === 'aluno') return null
    return <Moldura bloco={bloco} modo={modo} dispositivo={dispositivo} dados={dados}><Vazio>Os avisos ativos do produto aparecem aqui.</Vazio></Moldura>
  }
  const faixa = bloco.variacao === 'faixa'
  return (
    <Moldura bloco={bloco} modo={modo} dispositivo={dispositivo} dados={dados}>
      <div className="space-y-2">
        {avisos.map((a) => faixa ? (
          <div key={a.id} className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2 shadow-sm" style={raio ? { borderRadius: raio } : undefined}>
            <span className="shrink-0" style={{ color: cor }}>{a.fixado ? <Pin className="h-4 w-4" /> : <Megaphone className="h-4 w-4" />}</span>
            <span className="min-w-0 truncate text-sm"><span className="font-semibold">{a.titulo}</span>{a.corpo && <span className="text-muted-foreground"> — {a.corpo}</span>}</span>
          </div>
        ) : (
          <div key={a.id} className="flex items-start gap-3 rounded-2xl border bg-card p-4 shadow-sm" style={raio ? { borderRadius: raio } : undefined}>
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" style={{ background: `color-mix(in srgb, ${cor} 15%, transparent)`, color: cor }}>
              {a.fixado ? <Pin className="h-4 w-4" /> : <Megaphone className="h-4 w-4" />}
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold">{a.titulo}</div>
              {a.corpo && <p className="mt-0.5 whitespace-pre-line text-sm text-muted-foreground">{a.corpo}</p>}
            </div>
          </div>
        ))}
      </div>
    </Moldura>
  )
}

export function RendererContinuar(props: PropsRenderer<'continuar'>) {
  const { bloco, modo, dispositivo } = props
  const dados = dadosDoBloco(bloco, props.dados)
  const prog = dados.progressoSimulados, c = bloco.conteudo, cor = dados.cor, raio = raioCss(bloco)
  if (!(prog.total > 0)) {
    if (modo === 'aluno') return null
    return <Moldura bloco={bloco} modo={modo} dispositivo={dispositivo} dados={dados}><Vazio>O progresso do aluno nos simulados do produto aparece aqui.</Vazio></Moldura>
  }
  const pct = Math.round((prog.feitos / prog.total) * 100)
  return (
    <Moldura bloco={bloco} modo={modo} dispositivo={dispositivo} dados={dados}>
      <div className="rounded-2xl border bg-card p-4 shadow-sm" style={raio ? { borderRadius: raio } : undefined}>
        <div className="mb-2 flex items-center justify-between text-sm">
          <Txt modo={modo} blocoId={bloco.id} campo="conteudo.titulo" valor={c.titulo} fallback="Seu progresso nos simulados" className="font-semibold" />
          <span className="tabular-nums text-muted-foreground">{prog.feitos}/{prog.total} · {pct}%</span>
        </div>
        {c.mostrar_barra && (
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: cor }} />
          </div>
        )}
        {c.mostrar_proximo && prog.proximo && (
          <Link href="/aluno/simulados" className="mt-3 flex items-center justify-between gap-2 rounded-xl border p-2.5 transition-colors hover:bg-muted/50">
            <span className="min-w-0"><span className="text-xs text-muted-foreground">Continuar de onde parou</span><span className="block truncate text-sm font-medium">{prog.proximo.titulo}</span></span>
            <ChevronRight className="h-4 w-4 shrink-0" style={{ color: cor }} />
          </Link>
        )}
      </div>
    </Moldura>
  )
}

export function RendererProgresso(props: PropsRenderer<'progresso'>) {
  const { bloco, modo, dispositivo, resolvido } = props
  const dados = dadosDoBloco(bloco, props.dados)
  if (resolvido?.kind !== 'progresso') {
    if (modo === 'aluno') return null
    return <Moldura bloco={bloco} modo={modo} dispositivo={dispositivo} dados={dados}><Vazio>O progresso geral no currículo aparece aqui quando o produto tem módulos.</Vazio></Moldura>
  }
  return (
    <Moldura bloco={bloco} modo={modo} dispositivo={dispositivo} dados={dados}>
      <ProgressoGeral modulos={dados.curriculo} slug={dados.slug} cor={dados.cor} />
    </Moldura>
  )
}
