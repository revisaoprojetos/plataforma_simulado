import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { montarRelatorioEstudante } from '@/app/admin/relatorios/estudantes/_dados'
import { RelatorioEstudanteView } from '@/app/admin/relatorios/estudantes/relatorio-estudante-view'
import { KpiCard } from '@/components/admin/relatorios/viz'
import { Mail, Phone, BarChart3, ArrowRight, Flame, Zap, Trophy, ClipboardList, Target, Clock, Award, Medal } from 'lucide-react'
import { getGamConfig } from '@/lib/gamificacao'
import { resumoGamificacao, conquistasDoAluno, posicaoNaLiga } from '@/lib/gamificacao/leitura'
import { ConquistasGrid } from '@/components/aluno/conquistas-grid'
import { MascoteTour } from '@/components/mascote/mascote-tour'
import { PerfilEditar } from '@/components/aluno/perfil-editar'
import { lerPersonalizacaoEstudante, lerOpcoesPersonalizacao, ehCorFundo } from '@/lib/aluno/personalizacao'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Meu perfil' }

const fmt = (n: number) => n.toLocaleString('pt-BR')
function iniciais(nome: string) {
  return nome.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]).join('').toUpperCase() || 'A'
}

/**
 * Perfil do estudante: cabeçalho (dados + nível/liga/streak) → KPIs → conquistas →
 * ranking & divisões → gráficos e histórico (mesmo motor do admin), escopado ao próprio
 * estudante (id da sessão assinada — sem IDOR).
 */
export default async function PerfilAlunoPage() {
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')

  const svc = createAdminClient()
  const gamConfig = await getGamConfig(svc, sessao.tenantId)
  const [{ data: est }, dados, gamResumo, gamConquistas, pers, { data: temaRow }] = await Promise.all([
    svc.from('simulado_estudantes').select('nome, email, telefone').eq('id', sessao.estudanteId).maybeSingle(),
    montarRelatorioEstudante(svc, sessao.estudanteId, sessao.tenantId),
    gamConfig?.ativo ? resumoGamificacao(svc, sessao.tenantId, sessao.estudanteId, gamConfig) : Promise.resolve(null),
    gamConfig?.ativo ? conquistasDoAluno(svc, sessao.tenantId, sessao.estudanteId, gamConfig) : Promise.resolve([]),
    lerPersonalizacaoEstudante(svc, sessao.estudanteId),
    svc.from('simulado_tenants').select('tema').eq('id', sessao.tenantId).maybeSingle(),
  ])
  const opcoes = lerOpcoesPersonalizacao(temaRow?.tema)
  // Personalização visual: cor de destaque (texto/barra/anel), texto legível sobre fundo, sombra.
  const temFundo = !!pers.perfilCapa
  const corDestaque = pers.perfilTexto || null
  const corTexto = corDestaque || (temFundo ? '#ffffff' : undefined)
  const corMarca = corDestaque || 'var(--brand-primary, var(--primary))'
  // O "Nv" fica sobre fundo claro; se o texto for branco ele sumiria → força preto só nesse caso.
  const corNivel = corDestaque?.toLowerCase() === '#ffffff' ? '#0f172a' : corMarca
  const sombraTexto = temFundo ? '0 1px 4px rgba(0,0,0,.55)' : undefined

  const nome = est?.nome ?? sessao.nome
  const email = est?.email ?? sessao.email
  const contatos = [
    email && { icon: Mail, label: email },
    est?.telefone && { icon: Phone, label: est.telefone },
  ].filter(Boolean) as { icon: any; label: string }[]

  const pos = gamResumo ? await posicaoNaLiga(svc, sessao.tenantId, gamResumo.liga.id, gamResumo.xpTotal) : null
  const nota = (n: number | null) => (n == null ? '—' : n.toFixed(1).replace('.', ','))

  // Nível (anel) — reaproveita o cálculo do resumo.
  const prog = gamResumo?.progresso
  const raio = 55, circ = 2 * Math.PI * raio
  const dash = prog ? circ * (prog.pct / 100) : 0

  // Ligas (divisões) por XP total, ordenadas — para a faixa "Ranking e divisões".
  const ligas = [...(gamConfig?.ligas ?? [])].sort((a, b) => a.xp_min - b.xp_min)

  return (
    <div className="animate-page space-y-6">
      {/* ── Cabeçalho: avatar + nível, dados, barra de XP e chips ── */}
      <div data-tour="perfil-nivel" className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/[0.10] via-card to-card px-6 pb-5 pt-7 shadow-sm sm:px-7">
        {pers.perfilCapa && ehCorFundo(pers.perfilCapa) && (
          <>
            <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: pers.perfilCapa }} />
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/5 via-black/15 to-black/40" />
          </>
        )}
        {pers.perfilCapa && !ehCorFundo(pers.perfilCapa) && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img aria-hidden src={pers.perfilCapa} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-100 dark:opacity-90" />
            {/* véu escuro suave (não lava a imagem) — o texto vira branco com sombra p/ legibilidade */}
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 via-black/25 to-black/55" />
          </>
        )}
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full bg-primary/25 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, color-mix(in oklab, var(--brand-accent) 75%, transparent), transparent)' }} />

        {/* "Meu perfil" no canto superior esquerdo */}
        <div className="absolute left-5 top-4 z-[2] flex items-center gap-2 sm:left-6">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--brand-accent)' }} />
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--brand-accent)', textShadow: sombraTexto }}>Meu perfil</span>
        </div>

        {/* Editar perfil — canto superior direito */}
        <div className="absolute right-4 top-3.5 z-[2] sm:right-5">
          <PerfilEditar nome={nome} avatar={pers.avatar} perfilCapa={pers.perfilCapa} perfilTexto={pers.perfilTexto} avatarCor={pers.avatarCor} avatares={opcoes.avatares} fundos={opcoes.fundos} cores={opcoes.cores} />
        </div>

        <div className="relative flex flex-col items-center text-center">
          {/* Avatar com anel de nível + badge Nv */}
          <div className="relative h-[144px] w-[144px]">
            {prog ? (
              <svg viewBox="0 0 144 144" className="absolute inset-0 h-full w-full -rotate-90">
                <circle cx="72" cy="72" r={raio} fill="none" stroke="color-mix(in oklab, var(--muted-foreground) 22%, transparent)" strokeWidth="6" />
                <circle cx="72" cy="72" r={raio} fill="none" stroke={corMarca} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${dash} ${circ}`} className="transition-all duration-700" />
              </svg>
            ) : null}
            <span className="absolute inset-[20px] flex items-center justify-center overflow-hidden rounded-full text-4xl font-bold text-primary shadow-sm ring-1 ring-black/10" style={{ background: pers.avatarCor ?? '#ffffff' }}>
              {pers.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pers.avatar} alt="" className="h-full w-full object-contain object-[center_82%]" />
              ) : iniciais(nome)}
            </span>
            {prog && (
              <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 rounded-full border border-primary/40 bg-background px-2.5 py-0.5 text-[11px] font-bold shadow-sm" style={{ color: corNivel }}>Nv {prog.nivel}</span>
            )}
          </div>

          <h1 className="mt-2 truncate text-2xl font-bold tracking-tight sm:text-[2rem]" style={{ color: corTexto, textShadow: sombraTexto }}>{nome}</h1>

          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground" style={{ color: corTexto, textShadow: sombraTexto }}>
            {contatos.map((c, i) => (
              <span key={i} className="inline-flex items-center gap-1.5"><c.icon className="h-4 w-4" /> {c.label}</span>
            ))}
          </div>

          {/* Barra de XP do nível */}
          {prog && (
            <div className="mt-3 w-full max-w-md">
              <div className="h-2 overflow-hidden rounded-full ring-1 ring-black/10 dark:ring-white/10" style={{ background: temFundo ? 'rgba(255,255,255,.28)' : `color-mix(in oklab, ${corMarca} 16%, transparent)` }}>
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${prog.pct}%`, background: corMarca }} />
              </div>
              <div className="mt-1 text-right text-[11px] tabular-nums text-muted-foreground" style={{ color: corTexto, textShadow: sombraTexto }}>{fmt(prog.xpNoNivel)} / {fmt(prog.xpDoNivel)} XP</div>
            </div>
          )}

          {/* Chips: sequência · XP · liga */}
          {gamResumo && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <Chip icon={<Flame className="h-3.5 w-3.5 text-orange-500" />}>{gamResumo.streakAtual} {gamResumo.streakAtual === 1 ? 'dia' : 'dias'}</Chip>
              <Chip icon={<Zap className="h-3.5 w-3.5" style={{ color: 'var(--brand-accent, var(--primary))' }} />}>{fmt(gamResumo.xpTotal)} XP</Chip>
              <Link href="/aluno/ligas"><Chip icon={<Trophy className="h-3.5 w-3.5" style={{ color: gamResumo.liga.cor }} />} hover>Liga {gamResumo.liga.nome}{pos ? ` · ${pos}º` : ''}</Chip></Link>
            </div>
          )}
        </div>
      </div>

      {dados && dados.simulados > 0 ? (
        <>
          {/* ── KPIs ── (6 colunas com o card de XP; 5 quando a gamificação está desativada, p/ completar a linha) */}
          <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${gamResumo ? 'lg:grid-cols-6' : 'lg:grid-cols-5'}`}>
            <KpiCard label="Simulados feitos" valor={dados.simulados} icon={<ClipboardList className="h-4 w-4" />} tom="primary" />
            <KpiCard label="Nota média" valor={nota(dados.notaMedia)} icon={<Trophy className="h-4 w-4" />} tom="amber" />
            <KpiCard label="Acerto médio" valor={dados.acertoMedio != null ? `${dados.acertoMedio}%` : '—'} icon={<Target className="h-4 w-4" />} tom="emerald" />
            <KpiCard label="Tempo médio" valor={dados.tempoMedioMin != null ? `${dados.tempoMedioMin}min` : '—'} icon={<Clock className="h-4 w-4" />} tom="violet" />
            <KpiCard label="Melhor nota" valor={nota(dados.melhorNota)} icon={<Award className="h-4 w-4" />} tom="amber" />
            {gamResumo && (
              <KpiCard label="XP este mês" valor={fmt(gamResumo.xpMes)} sub={pos ? `${pos}º na Liga ${gamResumo.liga.nome}` : undefined} icon={<Zap className="h-4 w-4" />} tom="primary" />
            )}
          </div>

          {/* ── Conquistas ── */}
          {gamConquistas.length > 0 && <div data-tour="perfil-conquistas"><ConquistasGrid conquistas={gamConquistas} /></div>}

          {/* ── Ranking e divisões ── */}
          {gamResumo && ligas.length > 0 && (
            <div data-tour="perfil-ranking" className="rounded-2xl border bg-card p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold"><Medal className="h-4 w-4 text-primary" /> Ranking e divisões</h3>
                {pos && <span className="text-[11px] text-muted-foreground">você está em <span className="font-semibold text-foreground">{pos}º</span> na {gamResumo.liga.nome}</span>}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {ligas.map((lg, i) => {
                  const prox = ligas[i + 1] ?? null
                  const atual = lg.id === gamResumo.liga.id
                  const faixa = prox ? `${fmt(lg.xp_min)} – ${fmt(prox.xp_min - 1)} XP` : `${fmt(lg.xp_min)}+ XP`
                  const pctFaixa = atual && prox ? Math.min(100, Math.round(((gamResumo.xpTotal - lg.xp_min) / Math.max(1, prox.xp_min - lg.xp_min)) * 100)) : 0
                  const faltam = atual && prox ? Math.max(0, prox.xp_min - gamResumo.xpTotal) : 0
                  return (
                    <div key={lg.id} className={`rounded-xl border p-3 transition-colors ${atual ? 'ring-2' : ''}`} style={atual ? { borderColor: lg.cor, boxShadow: `0 0 0 1px ${lg.cor}`, ['--tw-ring-color' as any]: `color-mix(in oklab, ${lg.cor} 45%, transparent)` } : undefined}>
                      <div className="flex items-center gap-2">
                        <Trophy className="h-4 w-4" style={{ color: lg.cor }} />
                        <span className="text-sm font-semibold">{lg.nome}</span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">{faixa}</div>
                      {atual && (
                        <div className="mt-2">
                          <div className="h-1.5 overflow-hidden rounded-full" style={{ background: `color-mix(in oklab, ${lg.cor} 16%, transparent)` }}>
                            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${prox ? pctFaixa : 100}%`, background: lg.cor }} />
                          </div>
                          <div className="mt-1 text-[11px] font-medium tabular-nums" style={{ color: lg.cor }}>
                            {fmt(gamResumo.xpTotal)} XP{prox ? ` — faltam ${fmt(faltam)} XP para ${prox.nome}` : ' — divisão máxima 🎉'}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Gráficos + histórico (mesmo motor do admin, sem os KPIs já exibidos acima) ── */}
          <RelatorioEstudanteView d={dados} semCabecalho semKpis historicoLink semTurma semTendencia layoutPerfil />
        </>
      ) : (
        <div className="rounded-2xl border bg-muted/30 p-10 text-center">
          <BarChart3 className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Seu desempenho aparecerá aqui</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Finalize ao menos um simulado para ver seus números, a evolução e o acerto por disciplina.</p>
          <Link href="/aluno" className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90">
            Ver simulados disponíveis <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      {/* Continuação do tour (capítulo Perfil → sinaliza a Ajuda e encerra). */}
      {gamConfig?.ativo && <MascoteTour ativo />}
    </div>
  )
}

function Chip({ icon, children, hover }: { icon: React.ReactNode; children: React.ReactNode; hover?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs font-medium shadow-sm ${hover ? 'transition-colors hover:border-primary/40 hover:bg-muted/50' : ''}`}>
      {icon}{children}
    </span>
  )
}
