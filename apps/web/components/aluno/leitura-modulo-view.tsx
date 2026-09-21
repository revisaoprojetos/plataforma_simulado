'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Route, BarChart3, Check, Lock, AlertTriangle, ArrowRight, Library, Trophy, ScrollText, Zap, Play, FileText, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ModuloBanner } from '@/components/admin/modulo-banner'
import { TrilhaSistema, type Trilha } from '@/components/aluno/trilha-simulados'
import { LeituraRanking } from '@/components/aluno/leitura-ranking'
import { DEFAULT_TRILHA_SIMBOLOS, type TrilhaSimbolos } from '@/lib/gamificacao/trilha-simbolos'
import { DEFAULT_TRILHA_FORMATO, type TrilhaFormato } from '@/lib/gamificacao/trilha-formato'
import { type TrilhaLivreConfig, type TrilhaDegrade } from '@/lib/leitura/trilha-aparencia'
import { LeituraTrilhaRail } from '@/components/aluno/leitura-trilha-rail'
import { type RegulamentoConfig, embedVideoUrl } from '@/lib/leitura/regulamento'
import { type PontuacaoLeitura, type DesempenhoLeitura } from '@/lib/leitura/pontuacao'
import { progressoDesafio, DESAFIO_TIPOS, type DesafioModulo } from '@/lib/leitura/desafios'
import type { GamRail } from '@/lib/aluno/trilhas'
import type { AulaDesempenho } from '@/lib/leitura/trilha'
import type { RankingLeitura } from '@/lib/leitura/ranking'

/** Visão de um módulo do LegProc Digital: banner colapsável (igual ao admin) com tabs Trilha | Desempenho
 * e busca, + aviso de questões pendentes. */
export function LeituraModuloView({ modulo, trilha, desempenho, pendentes, aulasPendentes, ranking, meuId, formato = DEFAULT_TRILHA_FORMATO, simbolos = DEFAULT_TRILHA_SIMBOLOS, livre, inverter = false, degrade, degradeTrilha, descricao, regulamento, pontuacao, desafios, desempenhoDesafios, gam = null, diasLeitura = [] }: {
  modulo: string
  trilha: Trilha
  desempenho: AulaDesempenho[]
  pendentes: number
  aulasPendentes: number
  ranking: RankingLeitura
  meuId?: string | null
  formato?: TrilhaFormato
  simbolos?: TrilhaSimbolos
  livre?: TrilhaLivreConfig
  inverter?: boolean
  degrade?: TrilhaDegrade
  degradeTrilha?: TrilhaDegrade
  descricao?: string
  regulamento?: RegulamentoConfig
  pontuacao?: PontuacaoLeitura
  desafios?: DesafioModulo[]
  desempenhoDesafios?: DesempenhoLeitura
  gam?: GamRail | null
  diasLeitura?: string[]
}) {
  const desafiosAtivos = (desafios ?? []).filter((d) => d.ativo)
  const desemp = desempenhoDesafios ?? { acertos: 0, aulasConcluidas: 0, aulasGabaritadas: 0 }
  // 1ª aula com questões pendentes (leitura feita) → alvo do CTA do aviso.
  const alvoPend = desempenho.find((a) => a.leituraConcluida && a.questoesPendentes > 0)

  // Descrição do banner: SÓ a configurada pelo admin (aba Configurações do módulo). Vazio → sem subtítulo.
  const subtitulo = (descricao && descricao.trim()) ? descricao : undefined
  const regAtivo = regulamento?.ativo === true
  const embedReg = regulamento ? embedVideoUrl(regulamento.video_url) : null
  const [tabAtiva, setTabAtiva] = useState('trilha')

  return (
    <Tabs value={tabAtiva} onValueChange={setTabAtiva}>
      <ModuloBanner
        banner={trilha.capa ?? null}
        degrade={degrade}
        spacerEscuro={tabAtiva === 'trilha' && formato === 'livre'}
        cor={trilha.cor}
        icone={Library}
        titulo={trilha.nome}
        subtitulo={subtitulo}
        voltarHref="/aluno/leitura"
        voltarLabel="Voltar aos módulos"
        breadcrumb={null}
        // main do aluno é p-4 md:p-6 (o admin é p-6) → casa o "bleed" por breakpoint.
        className="-top-4 -mx-4 -mt-4 md:-top-6 md:-mx-6 md:-mt-6"
        tituloBadges={<span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold text-white backdrop-blur">{trilha.done}/{trilha.total}</span>}
        tabs={
          <TabsList className="w-fit border-white/20 [&_[data-slot=tabs-trigger]]:text-white/70 [&_[data-slot=tabs-trigger]:hover]:text-white [&_[data-slot=tabs-trigger][data-active]]:text-white">
            <TabsTrigger value="trilha"><Route className="h-4 w-4" /> Trilha</TabsTrigger>
            {regAtivo && <TabsTrigger value="regulamento"><ScrollText className="h-4 w-4" /> Regulamento</TabsTrigger>}
            {desafiosAtivos.length > 0 && <TabsTrigger value="desafios"><Trophy className="h-4 w-4" /> Desafios</TabsTrigger>}
            <TabsTrigger value="desempenho"><BarChart3 className="h-4 w-4" /> Desempenho</TabsTrigger>
            <TabsTrigger value="ranking"><Trophy className="h-4 w-4" /> Ranking</TabsTrigger>
          </TabsList>
        }
      />

      {/* Aviso de questões pendentes */}
      {pendentes > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            Você tem <strong>{pendentes}</strong> {pendentes === 1 ? 'questão pendente' : 'questões pendentes'} em{' '}
            <strong>{aulasPendentes}</strong> {aulasPendentes === 1 ? 'aula' : 'aulas'} — conclua para fechar a aula.
          </span>
          {alvoPend?.id && (
            <Link href={`/aluno/leitura/${alvoPend.id}/questoes`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/90 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-500">
              Responder agora <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      )}

      {/* pt-0 + overflow-visible: a trilha encosta no banner e os pontos do topo passam POR TRÁS do banner
          (emergem dele) sem corte. overflow-x-auto cortaria o topo do 1º ponto (overflow-y vira auto). */}
      <TabsContent value="trilha" className="pt-0">
        {formato === 'livre' ? (
          // Trilha PERSONALIZADA: imagem ocupa TODA a largura do LegProc (full-bleed, sem card nem bordas
          // brancas do padding). Escapa o padding do portal (p-4/p-6) como o banner. O rail de metas flutua
          // por cima no canto (desktop) para não roubar largura da imagem.
          <div className="relative -mx-4 -mb-24 -mt-4 min-w-0 overflow-visible bg-neutral-950 md:-mx-6 md:-mb-6 md:-mt-6">
            <TrilhaSistema trilhas={[trilha]} gamAtivo={false} formato={formato} simbolos={simbolos} livre={livre} inverter={inverter} capa={trilha.capa ?? trilha.capaCard ?? null} semFundo semDivisoria ajudante semMoldura degradeTopo={degradeTrilha ?? degrade} />
            {gam && (
              <aside className="pointer-events-auto absolute inset-y-0 right-2 z-20 hidden w-[300px] lg:block">
                {/* Sticky ANCORADO na base ATUAL do banner (--lp-banner-bottom, atualizado no scroll) → mantém a
                    MESMA distância relativa quer o banner esteja expandido quer recolhido. */}
                <div className="sticky overflow-auto pb-4" style={{ top: 'calc(var(--lp-banner-bottom, 6rem) + 0.75rem)', maxHeight: 'calc(100vh - var(--lp-banner-bottom, 6rem) - 3rem)' }}>
                  <LeituraTrilhaRail done={trilha.done} total={trilha.total} gam={gam} desafios={desafiosAtivos} desemp={desemp} dias={diasLeitura} />
                </div>
              </aside>
            )}
          </div>
        ) : (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0 overflow-visible pb-10"><TrilhaSistema trilhas={[trilha]} gamAtivo={false} formato={formato} simbolos={simbolos} livre={livre} inverter={inverter} capa={trilha.capa ?? trilha.capaCard ?? null} semFundo semDivisoria ajudante /></div>
            {/* Rail de gamificação (metas/streak/XP/medalha) — desktop, quando a gamificação está ativa. */}
            {gam && <aside className="hidden lg:block lg:sticky lg:self-start lg:overflow-auto lg:pb-4" style={{ top: 'calc(var(--lp-banner-bottom, 6rem) + 0.75rem)', maxHeight: 'calc(100vh - var(--lp-banner-bottom, 6rem) - 3rem)' }}><LeituraTrilhaRail done={trilha.done} total={trilha.total} gam={gam} desafios={desafiosAtivos} desemp={desemp} dias={diasLeitura} /></aside>}
          </div>
        )}
      </TabsContent>

      {regAtivo && (
        <TabsContent value="regulamento" className="pt-4">
          <div className="mx-auto max-w-3xl space-y-4">
            {regulamento?.titulo && <h2 className="text-xl font-bold tracking-tight">{regulamento.titulo}</h2>}
            {embedReg ? (
              <div className="overflow-hidden rounded-2xl border shadow-sm"><div className="aspect-video w-full"><iframe src={embedReg} className="h-full w-full" title="Vídeo do módulo" allowFullScreen /></div></div>
            ) : regulamento?.video_url ? (
              <a href={regulamento.video_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90"><Play className="h-4 w-4" /> Assistir ao vídeo</a>
            ) : null}
            {regulamento?.descricao && (
              <div className="whitespace-pre-wrap rounded-2xl border bg-card p-5 text-sm leading-relaxed shadow-sm">{regulamento.descricao}</div>
            )}
            {regulamento?.documento_url && (
              // Visualizador do PDF DENTRO da plataforma — fundo cinza (estilo Drive) + página centralizada.
              <div className="overflow-hidden rounded-2xl border shadow-sm">
                <div className="flex items-center gap-2 border-b bg-card px-4 py-2.5 text-sm">
                  <FileText className="h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate font-medium">{regulamento.documento_nome || 'Regulamento (PDF)'}</span>
                  <a href={regulamento.documento_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted"><ExternalLink className="h-3.5 w-3.5" /> Abrir</a>
                </div>
                <div className="bg-neutral-200 p-2 dark:bg-neutral-900 sm:p-4">
                  <iframe src={`${regulamento.documento_url}#view=FitH`} title="Regulamento (PDF)" className="h-[78vh] w-full rounded-lg border-0 bg-white shadow-md" />
                </div>
              </div>
            )}
            {pontuacao && (
              <div className="rounded-2xl border bg-card p-5 shadow-sm">
                <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold"><Zap className="h-4 w-4 text-primary" /> Ganhos & metas</h3>
                <ul className="grid gap-2 text-sm sm:grid-cols-2">
                  <li className="flex items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2"><span className="font-bold text-primary">+{pontuacao.pontos_aula}</span> pts por aula concluída</li>
                  <li className="flex items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2"><span className="font-bold text-primary">+{pontuacao.pontos_acerto}</span> pts por acerto no quiz</li>
                  {pontuacao.combo_ativo && <li className="flex items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2 sm:col-span-2"><span className="font-bold text-primary">+{pontuacao.combo_bonus}</span> pts de bônus ao gabaritar uma aula (todas certas)</li>}
                </ul>
              </div>
            )}
          </div>
        </TabsContent>
      )}

      {desafiosAtivos.length > 0 && (
        <TabsContent value="desafios" className="pt-4">
          <DesafiosModulo desafios={desafiosAtivos} desemp={desemp} />
        </TabsContent>
      )}

      <TabsContent value="desempenho" className="pt-4">
        <DesempenhoModulo desempenho={desempenho} />
      </TabsContent>
      <TabsContent value="ranking" className="pt-4">
        <LeituraRanking ranking={ranking} meuId={meuId} />
      </TabsContent>
    </Tabs>
  )
}

function DesafiosModulo({ desafios, desemp }: { desafios: DesafioModulo[]; desemp: DesempenhoLeitura }) {
  const unidade = (t: DesafioModulo['tipo']) => DESAFIO_TIPOS.find((x) => x.v === t)?.unidade ?? ''
  const concluidos = desafios.filter((d) => progressoDesafio(d, desemp) >= d.meta).length
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-lg font-bold tracking-tight"><Trophy className="h-5 w-5 text-primary" /> Desafios do módulo</h2>
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">{concluidos}/{desafios.length} concluído(s)</span>
      </div>
      <div className="grid gap-3">
        {desafios.map((d) => {
          const prog = Math.min(progressoDesafio(d, desemp), d.meta)
          const pct = d.meta > 0 ? Math.round((prog / d.meta) * 100) : 0
          const done = progressoDesafio(d, desemp) >= d.meta
          return (
            <div key={d.id} className={cn('rounded-2xl border bg-card p-4 shadow-sm', done && 'border-emerald-500/40 bg-emerald-500/[0.04]')}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    {done && <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />} {d.titulo}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{prog}/{d.meta} {unidade(d.tipo)}</p>
                </div>
                <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-bold', done ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-primary/10 text-primary')}>+{d.xp} XP</span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className={cn('h-full rounded-full transition-all', done ? 'bg-emerald-500' : 'bg-primary')} style={{ width: `${pct}%` }} />
              </div>
              {done && <p className="mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">Desafio concluído — bônus de XP creditado! 🎉</p>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DesempenhoModulo({ desempenho }: { desempenho: AulaDesempenho[] }) {
  const concluidas = desempenho.filter((a) => a.estado === 'concluido').length
  const totalQ = desempenho.reduce((s, a) => s + a.questoesTotal, 0)
  const respQ = desempenho.reduce((s, a) => s + a.questoesRespondidas, 0)

  return (
    <div className="space-y-4">
      {/* Resumo */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ResumoCard label="Aulas concluídas" valor={`${concluidas}/${desempenho.length}`} />
        <ResumoCard label="Questões respondidas" valor={totalQ ? `${respQ}/${totalQ}` : '—'} />
        <ResumoCard label="Progresso do módulo" valor={`${desempenho.length ? Math.round((concluidas / desempenho.length) * 100) : 0}%`} />
        <ResumoCard label="Pendentes" valor={String(desempenho.reduce((s, a) => s + (a.leituraConcluida ? a.questoesPendentes : 0), 0))} destaque={desempenho.some((a) => a.leituraConcluida && a.questoesPendentes > 0)} />
      </div>

      {/* Tabela por aula — rolável (cabeçalho fixo) para módulos com muitas aulas. */}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="max-h-[60vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 border-b bg-muted text-left text-muted-foreground shadow-sm">
            <tr>
              <th className="px-4 py-2.5 font-medium">Aula</th>
              <th className="px-4 py-2.5 font-medium">Leitura</th>
              <th className="px-4 py-2.5 font-medium">Questões</th>
              <th className="px-4 py-2.5 text-right font-medium">Situação</th>
            </tr>
          </thead>
          <tbody>
            {desempenho.length === 0 ? (
              <tr><td colSpan={4} className="py-10 text-center text-muted-foreground">Nenhuma aula neste módulo.</td></tr>
            ) : desempenho.map((a) => {
              const bloqueada = a.estado === 'bloqueado'
              return (
                <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3">
                    {bloqueada ? (
                      <span className="block truncate font-medium text-muted-foreground">{a.titulo}</span>
                    ) : (
                      <Link href={`/aluno/leitura/${a.id}`} className="block truncate font-medium hover:text-primary hover:underline">{a.titulo}</Link>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {a.leituraConcluida ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><Check className="h-3.5 w-3.5" /> Concluída</span>
                    ) : bloqueada ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round(a.leituraPct)}%` }} /></span>
                        <span className="tabular-nums text-xs text-muted-foreground">{Math.round(a.leituraPct)}%</span>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {a.questoesTotal === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        <span className="tabular-nums">{a.questoesRespondidas}/{a.questoesTotal}</span>
                        {a.leituraConcluida && a.questoesPendentes > 0 && (
                          <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">{a.questoesPendentes} pendente{a.questoesPendentes > 1 ? 's' : ''}</span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {a.estado === 'concluido' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"><Check className="h-3 w-3" /> Concluída</span>
                    ) : bloqueada ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"><Lock className="h-3 w-3" /> Bloqueada</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Em andamento</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}

function ResumoCard({ label, valor, destaque }: { label: string; valor: string; destaque?: boolean }) {
  return (
    <div className={cn('rounded-xl border bg-card p-3 shadow-sm', destaque && 'border-amber-500/40 bg-amber-500/5')}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 text-lg font-bold tabular-nums', destaque && 'text-amber-600 dark:text-amber-400')}>{valor}</p>
    </div>
  )
}
