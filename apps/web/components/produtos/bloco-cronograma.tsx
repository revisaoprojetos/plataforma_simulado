// Bloco "Plano de estudo" da página do extensivo — APRESENTAÇÃO pura (props prontas; nenhum cálculo/loader aqui).
// Os dados vêm de lib/produtos/resumo-cronograma.ts (ResumoCronograma, lido no servidor) e as opções de design/conteúdo
// de lib/produtos/blocos-pagina.ts (ConfigCronograma). Usado pela página do aluno E pela pré-visualização do construtor.
// Cores só por tokens/cor do produto (prop `cor` = var/cor do produto), nunca hex fixo (exceto branco sobre a cor da marca).
import Link from 'next/link'
import type { ReactNode } from 'react'
import { CalendarDays, ChevronRight, CheckCircle2, AlertCircle } from 'lucide-react'
import type { ResumoCronograma } from '@/lib/produtos/resumo-cronograma'
import { TITULO_CRONOGRAMA_PADRAO, type ConfigCronograma } from '@/lib/produtos/blocos-pagina'

/** Exemplo exibido na pré-visualização do construtor (o aluno vê os dados reais). */
export const RESUMO_EXEMPLO: ResumoCronograma = {
  modo: 'adaptativo', temPlano: true, titulo: 'Meu cronograma', pctSemana: 62, pendencias: 2, feitasHoje: 1, totalHoje: 3,
  metas: [
    { titulo: 'Direito Administrativo', sub: 'Leitura · 40 min', concluida: false },
    { titulo: 'Questões de Constitucional', sub: 'Questões · 30 min', concluida: false },
    { titulo: 'Revisão de Processo Civil', sub: 'Revisão · 25 min', concluida: false },
    { titulo: 'Legislação Tributária', sub: 'Leitura · 35 min', concluida: false },
    { titulo: 'Simulado semanal', sub: 'Simulado · 60 min', concluida: false },
  ],
  criadoEm: null, totalSemanas: null, href: '/aluno/cronograma',
}

export function BlocoCronogramaView({ cfg, resumo, cor, preview = false, slotTitulo, slotSubtitulo }: {
  cfg: ConfigCronograma; resumo: ResumoCronograma | null; cor: string; preview?: boolean
  /** Edição inline (editor visual): recebem o texto exibido e devolvem o nó que o substitui (ex.: <Editavel/>). */
  slotTitulo?: (texto: string) => ReactNode; slotSubtitulo?: (texto: string) => ReactNode
}) {
  const semDados = resumo === null // só título + botão (nenhum conteúdo dinâmico ligado)
  const tem = !!resumo?.temPlano
  const titulo = cfg.titulo.trim() || TITULO_CRONOGRAMA_PADRAO
  const adaptativo = resumo?.modo === 'adaptativo'
  const metas = tem && cfg.mostrar_metas ? (resumo!.metas ?? []).slice(0, cfg.qtd_metas) : []
  const subtitulo = cfg.subtitulo.trim()
    || (semDados ? '' : !tem ? 'Você ainda não tem um cronograma. Gere o seu para organizar o estudo semana a semana.' : resumo?.titulo && resumo.titulo !== titulo ? resumo.titulo : '')
  const href = preview ? '#' : (tem ? resumo!.href : '/aluno/cronograma')
  const rotuloBtn = cfg.texto_botao.trim() || (tem || semDados ? 'Abrir cronograma' : 'Gerar cronograma')
  const pct = resumo?.pctSemana ?? 0
  const mostrarSemana = tem && adaptativo && cfg.mostrar_progresso
  const hoje = tem && adaptativo && cfg.mostrar_hoje && (resumo!.totalHoje > 0)
    ? `${resumo!.feitasHoje} de ${resumo!.totalHoje} ${resumo!.totalHoje === 1 ? 'meta' : 'metas'} de hoje`
    : tem && adaptativo && cfg.mostrar_hoje ? 'Sem metas para hoje' : ''
  const atras = tem && adaptativo && cfg.mostrar_atrasadas && (resumo!.pendencias ?? 0) > 0
    ? `${resumo!.pendencias} atrasada${resumo!.pendencias > 1 ? 's' : ''}` : ''
  const padraoInfo = tem && !adaptativo && cfg.mostrar_progresso
    ? `${resumo!.totalSemanas ? `${resumo!.totalSemanas} semanas · ` : ''}${resumo!.criadoEm ? `gerado em ${new Date(resumo!.criadoEm).toLocaleDateString('pt-BR')}` : 'cronograma gerado'}` : ''

  const botao = (faixa: boolean) => cfg.mostrar_botao && (
    <Link href={href} onClick={preview ? (e) => e.preventDefault() : undefined}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition hover:opacity-90"
      style={faixa ? { background: 'rgba(255,255,255,.95)', color: cor } : { background: cor, color: '#FFFFFF' }}>
      {rotuloBtn}<ChevronRight className="h-4 w-4" />
    </Link>
  )
  const barra = (claro: boolean) => mostrarSemana && (
    <div className="flex items-center gap-3">
      <div className={`h-2 flex-1 overflow-hidden rounded-full ${claro ? 'bg-white/25' : 'bg-muted'}`}><div className="h-full rounded-full" style={{ width: `${pct}%`, background: claro ? 'rgba(255,255,255,.95)' : cor }} /></div>
      <span className={`whitespace-nowrap text-xs font-medium tabular-nums ${claro ? '' : 'text-muted-foreground'}`}>{pct}% da semana</span>
    </div>
  )
  const chips = (claro: boolean) => (hoje || atras) && (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs ${claro ? '' : 'text-muted-foreground'}`}>
      {hoje && <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />{hoje}</span>}
      {atras && <span className="inline-flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" />{atras}</span>}
    </div>
  )
  const listaMetas = (claro: boolean) => metas.length > 0 && (
    <ul className="space-y-1">
      {metas.map((m, i) => (
        <li key={i} className="flex items-baseline gap-2 text-xs">
          <span className="h-1.5 w-1.5 shrink-0 -translate-y-px rounded-full" style={{ background: claro ? 'rgba(255,255,255,.95)' : cor }} />
          <span className="min-w-0 flex-1 truncate font-medium">{m.titulo}</span>
          {m.sub && <span className={`shrink-0 ${claro ? 'opacity-80' : 'text-muted-foreground'}`}>{m.sub}</span>}
        </li>
      ))}
    </ul>
  )
  const icone = (claro: boolean) => (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
      style={claro ? { background: 'rgba(255,255,255,.18)', color: '#FFFFFF' } : { background: `color-mix(in srgb, ${cor} 12%, transparent)`, color: cor }}>
      <CalendarDays className="h-5 w-5" />
    </span>
  )

  if (cfg.variacao === 'faixa') {
    return (
      <div className="rounded-2xl p-5 shadow-sm" style={{ background: `linear-gradient(135deg, ${cor}, color-mix(in srgb, ${cor} 60%, #000))`, color: '#FFFFFF' }}>
        <div className="flex flex-wrap items-center gap-4">
          {icone(true)}
          <div className="min-w-0 flex-1 space-y-2">
            <div><div className="text-base font-bold leading-snug">{slotTitulo ? slotTitulo(titulo) : titulo}</div>{(subtitulo || slotSubtitulo) && <p className="text-xs opacity-85">{slotSubtitulo ? slotSubtitulo(subtitulo) : subtitulo}</p>}</div>
            {barra(true)}{chips(true)}{padraoInfo && <p className="text-xs opacity-85">{padraoInfo}</p>}{listaMetas(true)}
          </div>
          {botao(true)}
        </div>
      </div>
    )
  }
  if (cfg.variacao === 'semana') {
    return (
      <div className="rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-5">
          <div className="flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-2xl" style={{ background: `color-mix(in srgb, ${cor} 12%, transparent)`, color: cor }}>
            <span className="text-2xl font-extrabold tabular-nums leading-none">{tem && adaptativo ? `${pct}%` : <CalendarDays className="h-7 w-7" />}</span>
            {tem && adaptativo && <span className="mt-1 text-[10px] font-semibold uppercase tracking-wide">da semana</span>}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div><div className="text-base font-bold leading-snug">{slotTitulo ? slotTitulo(titulo) : titulo}</div>{(subtitulo || slotSubtitulo) && <p className="text-xs text-muted-foreground">{slotSubtitulo ? slotSubtitulo(subtitulo) : subtitulo}</p>}</div>
            {barra(false)}{chips(false)}{padraoInfo && <p className="text-xs text-muted-foreground">{padraoInfo}</p>}{listaMetas(false)}
          </div>
          {botao(false)}
        </div>
      </div>
    )
  }
  if (cfg.variacao === 'lista') {
    return (
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex items-center gap-3 p-4">
          {icone(false)}
          <div className="min-w-0 flex-1"><div className="text-sm font-semibold leading-snug">{slotTitulo ? slotTitulo(titulo) : titulo}</div>{(subtitulo || slotSubtitulo) && <p className="text-xs text-muted-foreground">{slotSubtitulo ? slotSubtitulo(subtitulo) : subtitulo}</p>}</div>
          {botao(false)}
        </div>
        {(metas.length > 0 || mostrarSemana || hoje || atras || padraoInfo) && (
          <div className="space-y-2 border-t p-4">{barra(false)}{chips(false)}{padraoInfo && <p className="text-xs text-muted-foreground">{padraoInfo}</p>}{listaMetas(false)}</div>
        )}
      </div>
    )
  }
  // card compacto (padrão)
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start gap-3">
        {icone(false)}
        <div className="min-w-0 flex-1 space-y-2">
          <div><div className="text-sm font-semibold leading-snug">{slotTitulo ? slotTitulo(titulo) : titulo}</div>{(subtitulo || slotSubtitulo) && <p className="text-xs text-muted-foreground">{slotSubtitulo ? slotSubtitulo(subtitulo) : subtitulo}</p>}</div>
          {barra(false)}{chips(false)}{padraoInfo && <p className="text-xs text-muted-foreground">{padraoInfo}</p>}{listaMetas(false)}
        </div>
        {botao(false)}
      </div>
    </div>
  )
}
