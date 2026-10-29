// Ligas e Comunidade → Ligas (atualizada) — LigasRevisao. Subtela: caminho + abas de área.
// Porte fiel de LigasRevisao.dc.html/.png (só claro). DADO REAL via loaders de gamificação/ranking
// (getSessaoAluno + createAdminClient + getGamConfig/gamAtivaParaAluno + resumoGamificacao + posições).
// REGRA FORTE: terceiros só por INICIAIS (iniciaisDe no servidor); a própria linha = "Você".
import { Eyebrow, Col, Row, Card, Muted } from '@/components/nova/ui'
import { Icon, type IconName } from '@/components/nova/icons'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { getGamConfig, gamAtivaParaAluno } from '@/lib/gamificacao'
import { resumoGamificacao, posicaoNaLiga, contarMembrosLiga, posicaoGeral } from '@/lib/gamificacao/leitura'
import { iniciaisDe } from '@/lib/leitura/ranking'
import { montarRelatorioEstudante } from '@/app/admin/relatorios/estudantes/_dados'
import { montarPerfilAnalytics } from '@/lib/aluno/perfil-analytics'
import LigasInterativo, { type LigaLinha, type GeralLinha } from './_ligas'

export const dynamic = 'force-dynamic'

const fmt = (n: number) => n.toLocaleString('pt-BR')
// Ícones ilustrativos das divisões (ciclados por posição).
const DIV_ICONS: IconName[] = ['trophy', 'shield', 'trophy', 'layers', 'star']

interface DivisaoView { nome: string; xp: string; icon: IconName; bg: string; ativa: boolean; feito: boolean }

export default async function LigasPage() {
  const sessao = await getSessaoAluno()
  const svc = sessao ? createAdminClient() : null
  const config = sessao && svc ? await getGamConfig(svc, sessao.tenantId) : null
  const gamAtivo = sessao && svc ? await gamAtivaParaAluno(svc, sessao.tenantId, sessao.estudanteId, config) : false

  // Estado neutro: sem sessão ou gamificação inativa para o aluno.
  if (!sessao || !svc || !gamAtivo || !config) {
    return (
      <>
        <div>
          <Eyebrow>Competição</Eyebrow>
          <h1 style={{ margin: '6px 0 0', fontSize: 32, fontWeight: 800, letterSpacing: '-0.045em', color: 'var(--ink)' }}>Ligas</h1>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--muted)' }}>Suba de divisão ganhando XP com simulados, questões e desafios.</p>
        </div>
        <Card style={{ alignItems: 'center', textAlign: 'center', padding: '48px 24px' }}>
          <span style={{ width: 56, height: 56, borderRadius: 18, background: 'var(--chip)', color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon n="trophy" size={26} /></span>
          <h2 style={{ margin: '14px 0 0', fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>Ligas em breve</h2>
          <Muted size={13}>A competição por ligas ainda não está ativa nesta plataforma.</Muted>
        </Card>
      </>
    )
  }

  const { tenantId, estudanteId } = sessao
  const resumo = await resumoGamificacao(svc, tenantId, estudanteId, config)
  const ligasOrd = [...config.ligas].sort((a, b) => a.xp_min - b.xp_min)
  const liga = resumo?.liga ?? ligasOrd[0]
  const proxima = resumo?.proxima ?? null
  const xpTotal = resumo?.xpTotal ?? 0
  const idxAtual = Math.max(0, ligasOrd.findIndex((l) => l.id === liga.id))
  const nMax = ligasOrd.length

  const [pos, membros, rel] = await Promise.all([
    resumo ? posicaoNaLiga(svc, tenantId, liga.id, xpTotal) : Promise.resolve(1),
    contarMembrosLiga(svc, tenantId, liga.id),
    montarRelatorioEstudante(svc, estudanteId, tenantId),
  ])
  const analytics = await montarPerfilAnalytics(svc, estudanteId, tenantId, {
    porDisciplina: rel?.porDisciplina ?? [], notaMedia: rel?.notaMedia ?? null, acertoMedio: rel?.acertoMedio ?? null, turmaNota: null, posicaoPercentil: null,
  })
  const questoesEu = analytics?.porBanca ? analytics.porBanca.acertos + analytics.porBanca.erros + analytics.porBanca.brancos : null

  // ── Progresso dentro do tier atual (piso da liga → piso da próxima) + faixa de divisões. ──
  const piso = liga.xp_min
  const teto = proxima?.xp_min ?? Math.max(xpTotal, piso + 1)
  const pctTier = proxima ? Math.min(1, Math.max(0, (xpTotal - piso) / Math.max(1, teto - piso))) : 1
  const faltam = proxima ? Math.max(0, teto - xpTotal) : 0
  const trilhaPct = nMax > 1 ? Math.min(100, Math.round(((idxAtual + pctTier) / (nMax - 1)) * 100)) : 100

  const DIVISOES: DivisaoView[] = ligasOrd.map((l, i) => ({
    nome: l.nome,
    xp: `${fmt(l.xp_min)} XP`,
    icon: DIV_ICONS[i % DIV_ICONS.length],
    bg: i <= idxAtual ? l.cor : 'transparent',
    ativa: l.id === liga.id,
    feito: i < idxAtual,
  }))

  // ── Ranking da liga (dado real) — XP/nível/sequência por membro numa única query. ──
  const { data: ligaRaw } = await svc
    .from('simulado_gamificacao_estudante')
    .select('estudante_id, xp_total, nivel, streak_atual')
    .eq('tenant_id', tenantId).eq('liga', liga.id)
    .order('xp_total', { ascending: false })
    .limit(100)
  const ligaRows0 = (ligaRaw ?? []) as { estudante_id: string; xp_total: number; nivel: number | null; streak_atual: number | null }[]

  // ── Ranking geral (top) + liga de cada aluno. ──
  const { data: geralRaw } = await svc
    .from('simulado_gamificacao_estudante')
    .select('estudante_id, xp_total, nivel, liga')
    .eq('tenant_id', tenantId)
    .order('xp_total', { ascending: false })
    .limit(100)
  const geralRows0 = (geralRaw ?? []) as { estudante_id: string; xp_total: number; nivel: number | null; liga: string | null }[]

  // Nomes + AVATAR REAL (uma consulta). Iniciais para o NOME de terceiros (privacidade parcial);
  // a FOTO do perfil é exibida para todos (decisão do usuário). "Você" na própria linha.
  const ids = [...new Set([estudanteId, ...ligaRows0.map((r) => r.estudante_id), ...geralRows0.map((r) => r.estudante_id)])]
  const nomes = new Map<string, string>()
  const avatares = new Map<string, { url: string | null; cor: string | null }>()
  if (ids.length) {
    const { data: estRows } = await svc.from('simulado_estudantes').select('id, nome, avatar, perfil_avatar_cor').in('id', ids)
    for (const e of (estRows ?? []) as { id: string; nome: string | null; avatar: string | null; perfil_avatar_cor: string | null }[]) {
      nomes.set(e.id, e.nome ?? 'Aluno')
      avatares.set(e.id, { url: e.avatar ?? null, cor: e.perfil_avatar_cor ?? null })
    }
  }
  const avEu = avatares.get(estudanteId) ?? { url: null, cor: null }
  const conquistasEu = null // detalhe de conquistas por aluno não é carregado nesta tela.

  const liga_: LigaLinha[] = ligaRows0.map((r, i) => {
    const eu = r.estudante_id === estudanteId
    const av = avatares.get(r.estudante_id)
    return {
      pos: i + 1,
      code: eu ? 'Você' : iniciaisDe(nomes.get(r.estudante_id)),
      nivel: r.nivel ?? 1,
      xp: r.xp_total ?? 0,
      // sim/q/ac por terceiro não são expostos no ranking (privacidade + custo); só a própria linha é detalhada.
      sim: eu ? (rel?.simulados ?? null) : null,
      q: eu ? questoesEu : null,
      ac: eu ? (rel?.acertoMedio ?? null) : null,
      seq: r.streak_atual ?? 0,
      conquistas: eu ? conquistasEu : null,
      avatar: av?.url ?? null,
      avatarCor: av?.cor ?? null,
      estudanteId: r.estudante_id,
      eu,
    }
  })
  // Garante a linha do aluno mesmo sem registro de gamificação ainda (ranking vazio para ele).
  if (!liga_.some((r) => r.eu)) {
    liga_.push({ pos: liga_.length + 1, code: 'Você', nivel: resumo?.nivel ?? 1, xp: xpTotal, sim: rel?.simulados ?? null, q: questoesEu, ac: rel?.acertoMedio ?? null, seq: resumo?.streakAtual ?? 0, conquistas: conquistasEu, avatar: avEu.url, avatarCor: avEu.cor, estudanteId, eu: true })
  }

  const nomeLigaDe = (id: string | null) => ligasOrd.find((l) => l.id === id)?.nome ?? liga.nome
  const corLigaDe = (id: string | null) => ligasOrd.find((l) => l.id === id)?.cor ?? liga.cor
  const geral_: GeralLinha[] = geralRows0.map((r, i) => {
    const av = avatares.get(r.estudante_id)
    return {
      pos: i + 1,
      code: r.estudante_id === estudanteId ? 'Você' : iniciaisDe(nomes.get(r.estudante_id)),
      ligaNome: nomeLigaDe(r.liga),
      ligaCor: corLigaDe(r.liga),
      xp: r.xp_total ?? 0,
      avatar: av?.url ?? null,
      avatarCor: av?.cor ?? null,
      estudanteId: r.estudante_id,
      eu: r.estudante_id === estudanteId,
    }
  })
  // Linha "Você" no geral quando fora do top exibido.
  if (!geral_.some((r) => r.eu)) {
    const posGeral = await posicaoGeral(svc, tenantId, xpTotal)
    geral_.push({ pos: posGeral, code: 'Você', ligaNome: liga.nome, ligaCor: liga.cor, xp: xpTotal, avatar: avEu.url, avatarCor: avEu.cor, estudanteId, eu: true })
  }

  const HERO_STATS: [string, string][] = [
    proxima ? [fmt(faltam), `XP p/ ${proxima.nome}`] : [fmt(xpTotal), 'XP total'],
    [fmt(resumo?.xpSemana ?? 0), 'XP esta semana'],
    [fmt(resumo?.streakAtual ?? 0), 'dias de sequência'],
  ]

  return (
    <>
      <div>
        <Eyebrow>Competição</Eyebrow>
        <h1 style={{ margin: '6px 0 0', fontSize: 32, fontWeight: 800, letterSpacing: '-0.045em', color: 'var(--ink)' }}>Ligas</h1>
        <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--muted)' }}>Suba de divisão ganhando XP com simulados, questões e desafios.</p>
      </div>

      {/* Banner da liga atual + trilha de divisões */}
      <section style={{ position: 'relative', overflow: 'hidden', borderRadius: 22, padding: '26px 30px', background: 'linear-gradient(140deg,#24166A,#4B30BE 55%,#6449E0)', color: '#fff', display: 'flex', flexDirection: 'column', gap: 22 }}>
        <span aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.07) 1px,transparent 1px)', backgroundSize: '24px 24px' }} />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <Row gap={16} style={{ flexWrap: 'nowrap' }}>
            <span style={{ width: 68, height: 68, borderRadius: 22, background: 'linear-gradient(160deg,#FFE29A,#E8A93A)', color: '#5A3A00', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 14px 30px -12px rgba(232,169,58,.8)', flexShrink: 0 }}><Icon n="trophy" size={32} /></span>
            <Col gap={2}>
              <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.2em', color: 'var(--gold)' }}>SUA LIGA ATUAL</span>
              <b style={{ fontSize: 34, letterSpacing: '-0.04em', lineHeight: 1.1 }}>Liga {liga.nome}</b>
              <span style={{ fontSize: 13, color: '#E1D9FF' }}>{pos}º de {fmt(Math.max(membros, liga_.length))} alunos · {fmt(xpTotal)} XP</span>
            </Col>
          </Row>
          <Row gap={8}>
            {HERO_STATS.map(([v, l]) => (
              <Col key={l} gap={0} style={{ padding: '10px 14px', borderRadius: 14, background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.14)' }}>
                <b style={{ fontSize: 18 }}>{v}</b><span style={{ fontSize: 11, color: '#CFC4FF' }}>{l}</span>
              </Col>
            ))}
          </Row>
        </div>
        {/* Trilha de divisões */}
        <div style={{ position: 'relative' }}>
          <span aria-hidden style={{ position: 'absolute', left: 35, right: 35, top: 21, height: 4, borderRadius: 4, background: 'rgba(255,255,255,.15)' }}>
            <span style={{ display: 'block', width: `${trilhaPct}%`, height: '100%', borderRadius: 4, background: 'linear-gradient(90deg,#B9773F,#9AA5B1,#E8A93A)' }} />
          </span>
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            {DIVISOES.map((d) => (
              <Col key={d.nome} gap={6} style={{ alignItems: 'center', width: 70, zIndex: 1 }}>
                <span style={{ width: d.ativa ? 46 : 38, height: d.ativa ? 46 : 38, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: d.bg, color: d.feito || d.ativa ? '#fff' : 'rgba(255,255,255,.7)', border: d.bg === 'transparent' ? '1.5px dashed rgba(255,255,255,.3)' : 'none', boxShadow: d.ativa ? '0 0 0 4px rgba(232,169,58,.3)' : 'none' }}><Icon n={d.icon} size={d.ativa ? 20 : 17} /></span>
                <b style={{ fontSize: 11.5, color: d.feito || d.ativa ? '#fff' : 'rgba(255,255,255,.7)' }}>{d.nome}</b>
                <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,.7)' }}>{d.xp}</span>
              </Col>
            ))}
          </div>
        </div>
      </section>

      <LigasInterativo ligaNome={`Liga ${liga.nome}`} liga={liga_} geral={geral_} totalAtivos={null} />
    </>
  )
}
