'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { formatBrt } from '@/lib/brt'
import { gestaoDe } from '@/lib/biblioteca/gestao-tipos'
import { tipoDe, seloStyle } from '@/lib/biblioteca/tipos-conteudo'
import {
  salvarProtecaoConteudo, definirVisibilidadeConteudo, arquivarConteudo, removerOrigemAcesso,
  carregarRegistroAluno, carregarAlunosGerenciamento, type GestaoDados, type OrigemAcesso, type AlunoAcesso, type EventoRegistro,
} from '@/app/admin/biblioteca/gestao-actions'
import { abrirEdicaoDocx } from '@/app/admin/biblioteca/actions'
import { AbaFlashcards } from './flashcards-tab'

// PORTE 1:1 do protótipo `Entregas.dc.html` (handoff 03b) — mesma estrutura, blocos e textos. Cores de
// MARCA via token (white-label) + semânticas fixas (emerald/amber/rose) e selos por tipo. Onde ainda não
// há pipeline (KPIs/funil/retenção/pacotes) o MESMO bloco aparece com estado honesto "em construção" —
// NUNCA número inventado. CSS do protótipo escopado em `.gcwrap`.

const CSS = `
.gcwrap{--ink:var(--foreground);--mut:var(--muted-foreground);--ln:var(--border);--cd:var(--card);
 --tint:color-mix(in oklab,var(--primary) 6%,var(--card));--tint2:color-mix(in oklab,var(--primary) 10%,var(--card));
 --chip:color-mix(in oklab,var(--primary) 13%,var(--card));--brand:var(--primary);--accent:var(--brand-accent);
 --tabbg:var(--muted);color:var(--ink);font-size:14px;display:flex;flex-direction:column;gap:16px}
.gcwrap *{box-sizing:border-box}
.gcwrap .back{width:34px;height:34px;display:grid;place-items:center;border-radius:50%;color:var(--mut);border:0;background:transparent;cursor:pointer;transition:background .2s,color .2s,transform .25s}
.gcwrap .back:hover{background:var(--chip);color:var(--brand);transform:translateX(-3px)}
.gcwrap .gbtn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:40px;padding:0 14px;border-radius:12px;border:1px solid var(--ln);background:var(--cd);color:var(--ink);font-size:13.5px;font-weight:600;cursor:pointer;transition:border-color .15s,background .15s}
.gcwrap .gbtn:hover{background:var(--tint)}
.gcwrap .gbtn.sm{height:34px;font-size:13px;padding:0 12px;border-radius:10px}
.gcwrap .gbtn.ok{border-color:color-mix(in oklab,#13804B 40%,var(--card));background:color-mix(in oklab,#13804B 14%,var(--card));color:#13804B}
.gcwrap .cta{display:inline-flex;align-items:center;justify-content:center;gap:9px;height:40px;padding:0 16px;border-radius:12px;border:0;color:var(--primary-foreground);font-size:14px;font-weight:700;cursor:pointer;background:var(--brand);box-shadow:0 10px 20px -12px color-mix(in oklab,var(--primary) 80%,transparent);transition:filter .15s,transform .15s}
.gcwrap .cta:hover{filter:brightness(1.08);transform:translateY(-1px)}
.gcwrap .tabs{display:flex;gap:4px;padding:4px;background:var(--tabbg);border-radius:14px;flex-wrap:wrap;align-self:flex-start}
.gcwrap .tab{display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 16px;border:0;border-radius:11px;background:transparent;font-size:14px;font-weight:700;color:var(--mut);cursor:pointer;transition:all .2s}
.gcwrap .tab:hover{color:var(--ink);background:color-mix(in oklab,var(--card) 60%,transparent)}
.gcwrap .tab.on{background:var(--cd);color:var(--ink);box-shadow:0 2px 8px -2px rgba(0,0,0,.18)}
.gcwrap .tab .n{font-size:11px;font-weight:800;padding:1px 7px;border-radius:999px;background:var(--chip);color:var(--brand)}
.gcwrap .kc{border:1px solid var(--ln);border-radius:16px;padding:14px 16px;display:flex;flex-direction:column;gap:6px;background:var(--cd)}
.gcwrap .kc .v{font-size:26px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.gcwrap .kc .l{font-size:12.5px;color:var(--mut);font-weight:600;display:flex;align-items:center;gap:7px}
.gcwrap .kc .h{font-size:12px;color:var(--mut)}
.gcwrap .sec{font-size:11px;font-weight:800;letter-spacing:.14em;color:var(--mut)}
.gcwrap .pl{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 9px;border-radius:999px;font-size:11.5px;font-weight:700;white-space:nowrap}
.gcwrap .sw{width:38px;height:22px;flex:0 0 38px;border-radius:999px;border:0;padding:0;background:color-mix(in oklab,var(--primary) 22%,var(--muted));position:relative;cursor:pointer;transition:background .22s}
.gcwrap .sw::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .22s cubic-bezier(.2,.7,.2,1)}
.gcwrap .sw.on{background:var(--brand)}
.gcwrap .sw.on::after{transform:translateX(16px)}
.gcwrap .src{display:flex;align-items:center;gap:12px;padding:14px 16px;border:1px solid var(--ln);border-radius:16px;background:var(--cd);flex-wrap:wrap}
.gcwrap .pp{height:28px;min-width:30px;padding:0 8px;border-radius:8px;border:1px solid var(--ln);background:var(--cd);font-size:11px;font-weight:800;color:var(--mut);cursor:pointer;transition:all .15s}
.gcwrap .pp.on{background:var(--chip);border-color:color-mix(in oklab,var(--primary) 25%,var(--card));color:var(--brand)}
.gcwrap .pp.ro{cursor:default}
.gcwrap .ibtn{width:32px;height:32px;display:grid;place-items:center;border-radius:9px;border:0;background:transparent;color:var(--mut);cursor:pointer}
.gcwrap .ibtn:hover{background:color-mix(in oklab,#B4232A 12%,var(--card));color:#B4232A}
.gcwrap .chip{height:30px;padding:0 12px;border-radius:999px;border:1px solid var(--ln);background:var(--cd);font-size:12.5px;font-weight:600;color:var(--mut);cursor:pointer;transition:all .18s;display:inline-flex;align-items:center;gap:6px}
.gcwrap .chip:hover{color:var(--ink)}
.gcwrap .chip.on{background:var(--ink);border-color:var(--ink);color:var(--cd)}
.gcwrap .chip .c{font-size:11px;opacity:.7}
.gcwrap .srow{width:100%;text-align:left;border:0;background:var(--cd);cursor:pointer;color:var(--ink);display:grid;grid-template-columns:minmax(0,2fr) 148px 104px 132px 58px 74px 60px 100px 22px;gap:12px;align-items:center;padding:11px 16px;border-bottom:1px solid var(--ln);transition:background .15s}
.gcwrap .srow:hover{background:var(--tint)}
.gcwrap .srow.open{background:var(--tint2)}
.gcwrap .chev{color:var(--mut);transition:transform .25s;display:inline-flex}
.gcwrap .srow.open .chev{transform:rotate(90deg);color:var(--brand)}
.gcwrap .log{padding:6px 16px 16px 60px;background:var(--tint2);border-bottom:1px solid var(--ln)}
.gcwrap .ev{display:grid;grid-template-columns:150px 28px minmax(0,1fr) 140px 116px;gap:10px;align-items:center;padding:8px 0;font-size:13px;color:var(--mut);border-bottom:1px dashed var(--ln)}
.gcwrap .ev:last-child{border-bottom:0}
.gcwrap .mono{font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:12px}
.gcwrap .lk{display:grid;grid-template-columns:40px minmax(0,1fr) 150px 120px auto;gap:14px;align-items:center;padding:14px 16px;border:1px solid var(--ln);border-radius:16px;background:var(--cd);transition:border-color .2s}
.gcwrap .lk:hover{border-color:color-mix(in oklab,var(--primary) 30%,var(--border))}
.gcwrap .pk2{border:1px solid var(--ln);border-radius:18px;padding:16px 18px;display:flex;flex-direction:column;gap:12px;background:var(--cd)}
.gcwrap .seg{display:inline-flex;gap:3px;padding:3px;background:var(--tabbg);border-radius:11px}
.gcwrap .sg{height:32px;padding:0 13px;border:0;border-radius:9px;background:transparent;font-size:13px;font-weight:700;color:var(--mut);cursor:pointer;transition:all .18s}
.gcwrap .sg.on{background:var(--cd);color:var(--ink);box-shadow:0 1px 5px -1px rgba(0,0,0,.2)}
.gcwrap .ver{display:grid;grid-template-columns:62px minmax(0,1fr) auto;gap:14px;align-items:flex-start;padding:16px 0;border-bottom:1px solid var(--ln)}
.gcwrap .ver:last-child{border-bottom:0}
.gcwrap .vt{height:28px;padding:0 10px;border-radius:8px;display:inline-grid;place-items:center;font-family:var(--font-mono,monospace);font-size:12.5px;font-weight:700}
.gcwrap .ar{display:grid;grid-template-columns:150px minmax(0,1.3fr) 150px minmax(0,1.4fr) 110px 120px 112px;gap:12px;align-items:center;padding:9px 16px;border-bottom:1px solid var(--ln);font-size:13px}
.gcwrap .crow{display:flex;align-items:center;gap:14px;padding:12px 0;border-bottom:1px solid var(--ln)}
.gcwrap .crow:last-child{border-bottom:0}
.gcwrap .opn{height:30px;padding:0 11px;border-radius:9px;border:1px solid var(--ln);background:var(--cd);font-size:12.5px;font-weight:700;color:var(--mut);cursor:pointer;transition:all .15s}
.gcwrap .opn.on{background:var(--ink);border-color:var(--ink);color:var(--cd)}
.gcwrap .fact{display:inline-flex;align-items:baseline;gap:7px;padding:8px 14px;border-radius:12px;border:1px solid var(--ln);background:var(--tint);cursor:pointer;transition:all .18s}
.gcwrap .fact:hover{background:var(--tint2);transform:translateY(-1px)}
.gcwrap .lkbox{display:flex;align-items:center;gap:8px;height:44px;padding:0 6px 0 12px;border-radius:12px;border:1px solid var(--ln);background:var(--tint)}
.gcwrap .cpy{height:34px;padding:0 12px;border-radius:9px;border:0;background:var(--brand);color:var(--primary-foreground);font-size:13px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.gcwrap .cpy.ok{background:#13804B;color:#fff}
.gcwrap .tl{display:grid;grid-template-columns:120px 18px minmax(0,1fr);gap:12px;align-items:flex-start}
.gcwrap .tl .dot{width:12px;height:12px;border-radius:50%;margin-top:4px;box-shadow:0 0 0 4px var(--cd)}
.gcwrap .emc{border:1.5px dashed var(--ln);border-radius:14px;padding:22px 18px;text-align:center;font-size:13px;color:var(--mut);background:var(--tint)}
@media(prefers-reduced-motion:reduce){.gcwrap *{transition:none!important}}
`

type Aba = 'visao' | 'acesso' | 'alunos' | 'uso' | 'pacotes' | 'unit' | 'flash' | 'hist' | 'cfg' | 'fonte'
const fmt = (n: number) => n.toLocaleString('pt-BR')
const dt = (s: string | null) => (s ? formatBrt(s) : '—')

export function GerenciarConteudoClient({ dados }: { dados: GestaoDados }) {
  const router = useRouter()
  const base = dados.base!
  const tp = gestaoDe(base.kind)
  const tipo = tipoDe(base.kind)
  const isMedia = base.kind === 'video' || base.kind === 'audio'
  const ehModelo = base.ehModelo
  const [aba, setAba] = useState<Aba>(ehModelo ? 'uso' : isMedia ? 'fonte' : 'visao')
  const [copied, setCopied] = useState(false)
  const linkAluno = `https://simulado.revisaopge.com.br/biblioteca/${base.id}`

  const facts: { n: string; label: string; go: Aba }[] = ehModelo ? [
    { n: fmt(base.contagens.vinculos), label: base.contagens.vinculos === 1 ? 'vínculo' : 'vínculos', go: 'uso' },
    { n: base.versaoNum ? `v${base.versaoNum}` : '—', label: 'versão atual', go: 'hist' },
  ] : [
    { n: fmt(base.contagens.origens), label: base.contagens.origens === 1 ? 'origem de acesso' : 'origens de acesso', go: 'acesso' },
    { n: fmt(base.contagens.alunos), label: 'alunos com acesso', go: 'alunos' },
    { n: fmt(base.contagens.vinculos), label: base.contagens.vinculos === 1 ? 'vínculo' : 'vínculos', go: 'uso' },
    { n: fmt(base.contagens.pacotes), label: 'pacotes', go: 'pacotes' },
    { n: base.versaoNum ? `v${base.versaoNum}` : '—', label: 'versão atual', go: 'hist' },
  ]

  const statusPill = ehModelo
    ? { label: 'Modelo de caderno · uso interno', fg: 'var(--muted-foreground)', bg: 'var(--muted)' }
    : base.oculto
    ? { label: 'Oculto para alunos', fg: 'var(--muted-foreground)', bg: 'var(--muted)' }
    : base.status === 'publicado'
      ? { label: 'Publicado para os alunos', fg: '#13804B', bg: 'color-mix(in oklab,#13804B 14%,var(--card))' }
      : base.liberadoDe ? { label: 'Agendado', fg: '#8A6600', bg: 'color-mix(in oklab,#F1C232 18%,var(--card))' }
        : { label: 'Rascunho · não publicado', fg: 'var(--muted-foreground)', bg: 'var(--muted)' }

  async function copiarLink() {
    try { await navigator.clipboard.writeText(linkAluno); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { toast.error('Não foi possível copiar.') }
  }
  // Abre o editor OnlyOffice de VERDADE (resolve a versão editável e navega para /editar/[versaoId]).
  async function abrirEditor() {
    const t = toast.loading('Abrindo o editor…')
    const r = await abrirEdicaoDocx(base.id)
    toast.dismiss(t)
    if (!r.ok || !r.versaoId) { toast.error(r.error || 'Edição no editor disponível só para .docx.'); return }
    window.location.href = `/admin/biblioteca/editar/${r.versaoId}?origem=${encodeURIComponent(window.location.pathname + window.location.search)}`
  }

  // Modelo de caderno não tem aluno: só "Utilizado em" (onde é linkado — diagnóstico/cadernos) + Histórico.
  const TABS: { k: Aba; label: string; n?: number }[] = ehModelo ? [
    { k: 'uso', label: 'Utilizado em', n: base.contagens.vinculos },
    { k: 'hist', label: 'Histórico' },
  ] : [
    ...(isMedia ? [{ k: 'fonte' as Aba, label: 'Fonte e link' }] : []),
    { k: 'visao', label: 'Visão geral' },
    { k: 'acesso', label: 'Quem tem acesso', n: base.contagens.origens },
    { k: 'alunos', label: 'Alunos', n: base.contagens.alunos },
    { k: 'uso', label: 'Utilizado em', n: base.contagens.vinculos },
    { k: 'pacotes', label: 'Pacotes', n: base.contagens.pacotes },
    { k: 'unit', label: tp.abaTipo.tab },
    { k: 'flash', label: 'Flashcards' },
    { k: 'hist', label: 'Histórico' },
    { k: 'cfg', label: 'Configurações' },
  ]

  return (
    <div className="gcwrap">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* Caminho */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--muted-foreground)', flexWrap: 'wrap' }}>
        <button className="back" onClick={() => router.push(`/admin/biblioteca?tab=${ehModelo ? 'modelos' : 'conteudo'}`)} aria-label="Voltar">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <span>{ehModelo ? 'Modelos de caderno' : 'Biblioteca'}</span><span style={{ color: 'var(--border)' }}>›</span>
        <span style={{ fontWeight: 700, color: 'var(--foreground)' }}>Gerenciamento</span>
      </div>

      {/* CABEÇALHO (§1) */}
      <section style={{ border: '1px solid var(--border)', borderRadius: 20, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14, background: 'var(--card)' }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <span style={{ width: 54, height: 66, borderRadius: 12, display: 'grid', placeItems: 'center', flex: '0 0 54px', fontSize: 11, fontWeight: 800, ...seloStyle(base.kind) }}>{tipo.sigla}</span>
          <div style={{ flex: '1 1 380px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="sec">GERENCIAMENTO DO CONTEÚDO · {tp.rotuloTopo}</span>
            <h1 style={{ margin: 0, fontSize: 22, lineHeight: 1.3, fontWeight: 800, letterSpacing: '-.015em', color: 'var(--foreground)' }}>{base.titulo}</h1>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--muted-foreground)' }}>
              <span className="pl" style={{ background: statusPill.bg, color: statusPill.fg }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: statusPill.fg }} />{statusPill.label}</span>
              <span>{base.publicadoEm ? `publicado desde ${dt(base.publicadoEm)}` : ''}</span>
              <span style={{ color: 'var(--border)' }}>•</span>
              <span>{tp.ext} · {base.versaoNum ? `v${base.versaoNum}` : '—'}{base.versoesCount ? ` · ${base.versoesCount} versão(ões)` : ''}</span>
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!ehModelo && <button className={copied ? 'gbtn sm ok' : 'gbtn sm'} onClick={copiarLink}>{copied ? 'Link copiado ✓' : 'Copiar link do aluno'}</button>}
            {!ehModelo && (tp.verAluno === 'aluno'
              ? <button className="gbtn sm" onClick={() => router.push(`/aluno/biblioteca/${base.id}`)}>Ver como aluno</button>
              : <button className="gbtn sm" onClick={() => setAba('fonte')}>Pré-visualizar</button>)}
            {base.kind === 'docx' && <button className="gbtn sm" onClick={abrirEditor}>Abrir no editor</button>}
            {tp.acoesTopo.map((a) => <button key={a.acao} className="gbtn sm" onClick={() => toast('Ação "' + a.label + '" em construção.')}>{a.label}</button>)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {facts.map((f) => (
            <button key={f.go} className="fact" onClick={() => setAba(f.go)}>
              <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--foreground)' }}>{f.n}</span>
              <span style={{ fontSize: 12.5, color: 'var(--muted-foreground)', fontWeight: 600 }}>{f.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ABAS */}
      <div className="tabs" role="tablist">
        {TABS.map((tb) => (
          <button key={tb.k} className={aba === tb.k ? 'tab on' : 'tab'} onClick={() => setAba(tb.k)} role="tab" aria-selected={aba === tb.k}>
            {tb.label}{tb.n != null && <span className="n">{tb.n}</span>}
          </button>
        ))}
      </div>

      {aba === 'visao' && <AbaVisao base={base} dados={dados} tp={tp} />}
      {aba === 'acesso' && <AbaAcesso base={base} dados={dados} tp={tp} />}
      {aba === 'alunos' && <AbaAlunos base={base} tp={tp} />}
      {aba === 'uso' && <AbaUso dados={dados} />}
      {aba === 'pacotes' && <EmConstrucao titulo="Pacotes de estudo que incluem este conteúdo" texto="Os pacotes (Extensivos) entram numa fase seguinte. Quando existirem, cada pacote aparece aqui com posição, liberação, alunos e permissões." />}
      {aba === 'unit' && <EmConstrucao titulo={tp.abaTipo.titulo} texto={`${tp.abaTipo.sub}. As métricas por ${tp.abaTipo.tab.toLowerCase()} dependem do pipeline de eventos de leitura — em construção.`} />}
      {aba === 'flash' && <AbaFlashcards documentoId={base.id} />}
      {aba === 'hist' && <AbaHistorico dados={dados} />}
      {aba === 'cfg' && <AbaConfig base={base} tp={tp} />}
      {aba === 'fonte' && <AbaFonte base={base} linkAluno={linkAluno} />}
    </div>
  )
}

function EmConstrucao({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="up" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span className="sec">{titulo.toUpperCase()}</span>
      <div className="emc">{texto}</div>
    </div>
  )
}

// ── VISÃO GERAL (§2.2) ─────────────────────────────────────────────────────────────
function AbaVisao({ base, dados, tp }: { base: GestaoDados['base']; dados: GestaoDados; tp: ReturnType<typeof gestaoDe> }) {
  const b = base!
  const entregas = dados.historico?.entregas ?? []
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {!b.liberado && (
        <div className="emc" style={{ padding: '30px 24px' }}>
          <strong style={{ fontSize: 16, color: 'var(--foreground)' }}>Ainda não liberado para nenhum aluno</strong>
          <div style={{ marginTop: 6 }}>Libere este conteúdo em “Quem tem acesso” (entrega avulsa para um grupo ou liberação para um aluno).</div>
        </div>
      )}
      {/* KPIs — bloco fiel, valores "em construção" (sem pipeline de métricas) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
        {tp.kpis.map((label, i) => (
          <div className="kc" key={label}>
            <span className="l"><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--muted-foreground)' }} />{label}</span>
            <span className="v">—</span>
            <span className="h">{i === 0 ? 'sem métricas ainda' : (tp.hints[i - 1] ?? '')}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <div className="kc" style={{ flex: '3 1 360px', gap: 12 }}>
          <span style={{ fontSize: 14.5, fontWeight: 800 }}>{tp.funilTitulo}</span>
          <div className="emc">Funil em construção — depende do pipeline de eventos (abertura, leitura, conclusão, download).</div>
        </div>
        <div className="kc" style={{ flex: '2 1 300px', gap: 12 }}>
          <span style={{ fontSize: 14.5, fontWeight: 800 }}>Linha do tempo da publicação</span>
          {entregas.length === 0 && <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>Sem eventos registrados ainda.</span>}
          {entregas.slice(0, 8).map((e, i) => (
            <div className="tl" key={i}>
              <span className="mono" style={{ color: 'var(--muted-foreground)', paddingTop: 2 }}>{dt(e.em)}</span>
              <span className="dot" style={{ background: 'var(--primary)' }} />
              <span style={{ fontSize: 13, lineHeight: 1.45 }}><strong>{e.titulo}</strong></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── QUEM TEM ACESSO (§2.3) ──────────────────────────────────────────────────────────
function AbaAcesso({ base, dados, tp }: { base: GestaoDados['base']; dados: GestaoDados; tp: ReturnType<typeof gestaoDe> }) {
  const router = useRouter()
  const [origens, setOrigens] = useState<OrigemAcesso[]>(dados.acesso?.origens ?? [])
  const alcance = dados.acesso?.alcanceTotal ?? 0
  const tagInfo = (o: OrigemAcesso['origem']) => o === 'via_pacote' ? { t: 'Via pacote', bg: 'color-mix(in oklab,var(--primary) 13%,var(--card))', fg: 'var(--primary)' }
    : o === 'individual' ? { t: 'Individual', bg: 'color-mix(in oklab,#13804B 14%,var(--card))', fg: '#13804B' }
      : { t: 'Avulsa', bg: 'color-mix(in oklab,#F1C232 18%,var(--card))', fg: '#8A6600' }
  const permLetras = tipoDe(base!.kind).permissoes
  async function remover(o: OrigemAcesso) {
    const r = await removerOrigemAcesso(base!.id, o.tipo, o.refId)
    if (!r.ok) return toast.error(r.error || 'Falha ao remover.')
    setOrigens((p) => p.filter((x) => x.chave !== o.chave)); toast.success('Acesso removido.')
  }
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <section style={{ flex: '3 1 520px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="sec">ORIGENS DE ACESSO A ESTE CONTEÚDO</span><span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>{fmt(alcance)} alunos</span>
        </div>
        {origens.length === 0 && <div className="emc">Nenhuma origem de acesso ainda. Use os botões abaixo para liberar.</div>}
        {origens.map((sr) => {
          const tg = tagInfo(sr.origem); const ini = sr.nome.slice(0, 2).toUpperCase()
          const pk = sr.origem === 'via_pacote'
          return (
            <div className="src" key={sr.chave}>
              <span style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--primary)', color: 'var(--primary-foreground)', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800, flex: '0 0 40px' }}>{ini}</span>
              <span style={{ flex: '1 1 220px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><strong style={{ fontSize: 14.5 }}>{sr.nome}</strong><span className="pl" style={{ background: tg.bg, color: tg.fg }}>{tg.t}</span></span>
                <span style={{ fontSize: 12.5, color: 'var(--muted-foreground)' }}>{sr.tipo === 'grupo' ? `${fmt(sr.alunos)} alunos no grupo` : 'liberado só para ele'}</span>
                <span className="mono" style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{sr.liberadoDe ? dt(sr.liberadoDe) : 'sem data de início'}{sr.liberadoAte ? ` → ${dt(sr.liberadoAte)}` : ''}</span>
              </span>
              <span style={{ display: 'flex', gap: 4 }}>
                {(['ler', 'baixar', 'grifar'] as const).map((k) => (
                  <span key={k} className={sr.perms[k] ? 'pp on ro' : 'pp ro'} title={permLetras[k].rotulo}>{permLetras[k].letra}</span>
                ))}
              </span>
              {pk ? <button className="gbtn sm" onClick={() => toast('Gerenciar no pacote — em construção.')}>Gerenciar no pacote</button>
                : <button className="ibtn" onClick={() => remover(sr)} aria-label="Remover este acesso">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>}
            </div>
          )
        })}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="gbtn" onClick={() => toast('Abra “Gerenciar acessos” na Biblioteca para liberar em árvore.')}>Entrega avulsa para um grupo</button>
          <button className="gbtn" onClick={() => toast('Abra “Gerenciar acessos” na Biblioteca para liberar em árvore.')}>Liberar para um aluno</button>
        </div>
        <span style={{ fontSize: 12.5, color: 'var(--muted-foreground)', lineHeight: 1.5 }}>{tp.legendaPerms} O acesso que vem do pacote só é alterado no pacote, para não quebrar o cronograma dos outros conteúdos.</span>
      </section>
      <aside style={{ flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="kc" style={{ gap: 10 }}>
          <span className="sec">ALCANCE DESTE CONTEÚDO</span>
          {origens.map((sr) => <div key={sr.chave} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: 'var(--primary)' }} /><span style={{ flex: 1, color: 'var(--muted-foreground)' }}>{tagInfo(sr.origem).t} · {sr.nome}</span><strong>{fmt(sr.alunos)}</strong></div>)}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 8, borderTop: '1px solid var(--border)', fontSize: 13.5 }}><span style={{ flex: 1, fontWeight: 700 }}>Total de alunos</span><strong style={{ color: 'var(--primary)' }}>{fmt(alcance)}</strong></div>
        </div>
        <div className="kc" style={{ gap: 8, background: 'var(--tint)' }}>
          <strong style={{ fontSize: 13.5 }}>Visibilidade e proteção</strong>
          <span style={{ fontSize: 12.5, color: 'var(--muted-foreground)', lineHeight: 1.5 }}>{base!.oculto ? 'Oculto para os alunos.' : 'Visível para os alunos.'} {base!.protecao.marca_dagua ? 'Marca d’água ligada.' : 'Sem marca d’água.'}</span>
          <button className="gbtn sm" style={{ alignSelf: 'flex-start' }} onClick={() => router.refresh()}>Atualizar</button>
        </div>
      </aside>
    </div>
  )
}

// ── ALUNOS (§2.4) ───────────────────────────────────────────────────────────────────
function AbaAlunos({ base, tp }: { base: GestaoDados['base']; tp: ReturnType<typeof gestaoDe> }) {
  // Carrega SOB DEMANDA (ao abrir a aba) — fora do load da página (era até 300 alunos + detalhes).
  const [carregado, setCarregado] = useState<{ itens: AlunoAcesso[]; total: number } | null>(null)
  useEffect(() => {
    let vivo = true
    carregarAlunosGerenciamento(base!.id)
      .then((r) => { if (vivo) setCarregado({ itens: r.itens ?? [], total: r.total ?? 0 }) })
      .catch(() => { if (vivo) setCarregado({ itens: [], total: 0 }) })
    return () => { vivo = false }
  }, [base])
  const alunos = carregado?.itens ?? []
  const total = carregado?.total ?? 0
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState<'todos' | 'concluiu' | 'lendo' | 'nao_abriu'>('todos')
  const [aberto, setAberto] = useState<string | null>(null)
  const [reg, setReg] = useState<Record<string, { liberadoEm?: string | null; eventos?: EventoRegistro[] } | 'loading'>>({})
  const sit = (s: AlunoAcesso['situacao']) => s === 'concluiu' ? { t: 'Concluiu', fg: '#13804B', bg: 'color-mix(in oklab,#13804B 14%,var(--card))' } : s === 'lendo' ? { t: 'Lendo', fg: '#8A6600', bg: 'color-mix(in oklab,#F1C232 18%,var(--card))' } : { t: 'Não abriu', fg: 'var(--muted-foreground)', bg: 'var(--muted)' }
  const viaTxt = (o: AlunoAcesso['recebidoPor']['origem']) => o === 'via_pacote' ? 'Via pacote' : o === 'individual' ? 'Individual' : 'Avulsa'
  const filtrados = useMemo(() => alunos.filter((a) => {
    if (filtro !== 'todos' && a.situacao !== filtro) return false
    if (!q.trim()) return true
    const t = q.toLowerCase(); return a.nome.toLowerCase().includes(t) || (a.email ?? '').toLowerCase().includes(t) || a.cpfMasc.includes(t)
  }), [alunos, filtro, q])
  const chips: { k: typeof filtro; label: string; n: number }[] = [
    { k: 'todos', label: 'Todos', n: alunos.length },
    { k: 'concluiu', label: 'Concluíram', n: alunos.filter((a) => a.situacao === 'concluiu').length },
    { k: 'lendo', label: 'Lendo', n: alunos.filter((a) => a.situacao === 'lendo').length },
    { k: 'nao_abriu', label: 'Não abriram', n: alunos.filter((a) => a.situacao === 'nao_abriu').length },
  ]
  async function toggle(id: string) {
    if (aberto === id) { setAberto(null); return }
    setAberto(id)
    if (!reg[id]) {
      setReg((p) => ({ ...p, [id]: 'loading' }))
      const r = await carregarRegistroAluno(base!.id, id)
      setReg((p) => ({ ...p, [id]: { liberadoEm: r.liberadoEm, eventos: r.eventos } }))
    }
  }
  if (carregado === null) return <div className="emc" style={{ padding: 40 }}>Carregando alunos…</div>
  if (total === 0) return <div className="emc" style={{ padding: 40 }}>Nenhum aluno acessou ainda: o conteúdo não foi liberado.</div>
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 18, overflow: 'hidden', background: 'var(--card)' }}>
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12, borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 800 }}>Acesso de cada aluno a este conteúdo</span>
          <span style={{ fontSize: 12.5, color: 'var(--muted-foreground)' }}>mostrando {fmt(filtrados.length)} de {fmt(total)}</span>
          <span style={{ flex: 1 }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, height: 34, width: 230, padding: '0 10px', borderRadius: 10, border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar aluno" placeholder="Nome, e-mail ou CPF" style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', font: 'inherit', fontSize: 13, outline: 'none', color: 'var(--foreground)' }} />
          </label>
          <button className="gbtn sm" onClick={() => toast('Exportar CSV — em construção.')}>Exportar CSV</button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {chips.map((c) => <button key={c.k} className={filtro === c.k ? 'chip on' : 'chip'} onClick={() => setFiltro(c.k)} aria-pressed={filtro === c.k}>{c.label}<span className="c">{c.n}</span></button>)}
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}><div style={{ minWidth: 1000 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) 148px 104px 132px 58px 74px 60px 100px 22px', gap: 12, padding: '10px 16px', fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', color: 'var(--muted-foreground)', background: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
          <span>ALUNO</span><span>RECEBEU POR</span><span>SITUAÇÃO</span><span>ÚLTIMO ACESSO</span><span>{tp.colsAlunos[0].toUpperCase()}</span><span>{tp.colsAlunos[1].toUpperCase()}</span><span>TEMPO</span><span>{tp.colsAlunos[2].toUpperCase()}</span><span />
        </div>
        {filtrados.map((st) => {
          const s = sit(st.situacao); const op = aberto === st.id; const ini = st.nome.slice(0, 2).toUpperCase(); const r = reg[st.id]
          return (
            <div key={st.id}>
              <button className={op ? 'srow open' : 'srow'} onClick={() => toggle(st.id)} aria-expanded={op}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}><span style={{ width: 34, height: 34, borderRadius: '50%', background: st.cor || 'var(--primary)', color: '#fff', display: 'grid', placeItems: 'center', flex: '0 0 34px', fontSize: 12, fontWeight: 800 }}>{ini}</span><span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: 1 }}><strong style={{ fontSize: 13.5 }}>{st.nome}</strong><span className="mono" style={{ color: 'var(--muted-foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{st.email ?? '—'} · {st.cpfMasc}</span></span></span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><span className="pl" style={{ alignSelf: 'flex-start', background: 'var(--muted)', color: 'var(--muted-foreground)' }}>{viaTxt(st.recebidoPor.origem)}</span><span style={{ fontSize: 11.5, color: 'var(--muted-foreground)' }}>{st.recebidoPor.detalhe}</span></span>
                <span><span className="pl" style={{ background: s.bg, color: s.fg }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: s.fg }} />{s.t}</span></span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}><span className="mono" style={{ color: 'var(--foreground)' }}>{st.ultimoAcesso ? dt(st.ultimoAcesso) : '—'}</span></span>
                <span style={{ fontSize: 14, fontWeight: 800 }}>—</span>
                <span><strong style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>—</strong></span>
                <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>—</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--muted)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: st.grifos > 0 ? '100%' : '0%', background: 'var(--primary)' }} /></span></span>
                <span className="chev"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="m9 6 6 6-6 6" /></svg></span>
              </button>
              {op && (
                <div className="log">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0 8px', flexWrap: 'wrap' }}>
                    <span className="sec">REGISTRO DE ACESSOS A ESTE CONTEÚDO</span>
                    <span style={{ flex: 1 }} />
                    <button className="gbtn sm" style={{ height: 30 }} onClick={() => toast(tp.maisUm + ' — em construção.')}>{tp.maisUm}</button>
                    <button className="gbtn sm" style={{ height: 30 }} onClick={() => toast('Revogar — em construção.')}>Revogar só para este aluno</button>
                  </div>
                  {r === 'loading' && <div style={{ padding: '10px 0', fontSize: 13, color: 'var(--muted-foreground)' }}>Carregando…</div>}
                  {r && r !== 'loading' && (r.eventos ?? []).length === 0 && <div style={{ padding: '10px 0', fontSize: 13, color: 'var(--muted-foreground)' }}>Nenhum acesso registrado ainda.</div>}
                  {r && r !== 'loading' && (r.eventos ?? []).map((e, i) => (
                    <div className="ev" key={i}><span className="mono" style={{ color: 'var(--foreground)' }}>{dt(e.em)}</span><span style={{ width: 28, height: 26, borderRadius: 8, background: 'var(--muted)', color: 'var(--muted-foreground)', display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 800 }}>{e.tipo === 'grifou' ? 'GR' : e.tipo === 'baixou' ? 'DL' : 'ABR'}</span><span><strong style={{ color: 'var(--foreground)' }}>{e.acao}</strong> {e.detalhe ?? ''}</span><span style={{ fontSize: 12 }}>{e.dispositivo ?? '—'}</span><span className="mono" style={{ color: 'var(--muted-foreground)' }}>{e.ipMasc ?? '—'}</span></div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {filtrados.length === 0 && <div style={{ padding: 28, textAlign: 'center', fontSize: 13.5, color: 'var(--muted-foreground)' }}>Nenhum aluno com esse filtro.</div>}
      </div></div>
      <div style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--muted-foreground)', borderTop: '1px solid var(--border)' }}>Horários de Brasília · IP mascarado (LGPD)</div>
    </div>
  )
}

// ── UTILIZADO EM (§2.5) ──────────────────────────────────────────────────────────────
function AbaUso({ dados }: { dados: GestaoDados }) {
  const vincs = dados.vinculos ?? []
  const [f, setF] = useState('todos')
  const cats = ['todos', ...Array.from(new Set(vincs.map((v) => v.categoria)))]
  const lista = f === 'todos' ? vincs : vincs.filter((v) => v.categoria === f)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span className="sec">ONDE ESTE CONTEÚDO É UTILIZADO</span><span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <button className="gbtn sm" onClick={() => toast('Vincular a… — em construção.')}>Vincular a…</button>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{cats.map((c) => <button key={c} className={f === c ? 'chip on' : 'chip'} onClick={() => setF(c)} aria-pressed={f === c}>{c === 'todos' ? 'Todos' : c}<span className="c">{c === 'todos' ? vincs.length : vincs.filter((v) => v.categoria === c).length}</span></button>)}</div>
      {lista.length === 0 && <div className="emc">Nenhum vínculo neste filtro.</div>}
      {lista.map((u) => (
        <div className="lk" key={u.id}>
          <span style={{ width: 40, height: 40, borderRadius: 12, ...seloStyle('docx'), display: 'grid', placeItems: 'center', fontSize: 9.5, fontWeight: 800 }}>{u.selo}</span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}><span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><strong style={{ fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.nome}</strong><span style={{ fontSize: 11.5, color: 'var(--muted-foreground)' }}>{u.categoria}</span></span><span style={{ fontSize: 12.5, color: 'var(--muted-foreground)' }}>{u.comoLigado}</span></span>
          <span />
          <span><span className="pl" style={{ background: 'color-mix(in oklab,#13804B 14%,var(--card))', color: '#13804B' }}>{u.status}</span></span>
          <span style={{ display: 'flex', gap: 6 }}><button className="gbtn sm" onClick={() => toast('Abrir — em construção.')}>Abrir</button><button className="gbtn sm" onClick={() => toast('Desvincular — em construção.')}>Desvincular</button></span>
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 14, background: 'var(--tint)', fontSize: 12.5, color: 'var(--muted-foreground)' }}>Quando você publica uma nova versão, todos os vínculos passam a usar a versão nova. Desvincular não remove o acesso de quem já recebeu.</div>
    </div>
  )
}

// ── HISTÓRICO (§2.8) ───────────────────────────────────────────────────────────────
function AbaHistorico({ dados }: { dados: GestaoDados }) {
  const versoes = dados.historico?.versoes ?? []
  const entregas = dados.historico?.entregas ?? []
  const [sub, setSub] = useState<'ver' | 'ent'>('ver')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div className="seg" role="tablist">
          <button className={sub === 'ver' ? 'sg on' : 'sg'} onClick={() => setSub('ver')} role="tab" aria-selected={sub === 'ver'}>Versões do arquivo</button>
          <button className={sub === 'ent' ? 'sg on' : 'sg'} onClick={() => setSub('ent')} role="tab" aria-selected={sub === 'ent'}>Entregas e permissões</button>
        </div>
      </div>
      {sub === 'ver' && (
        <div className="kc" style={{ gap: 0, padding: '4px 18px' }}>
          {versoes.length === 0 && <div style={{ padding: 16, fontSize: 13, color: 'var(--muted-foreground)' }}>Sem versões.</div>}
          {versoes.map((v) => (
            <div className="ver" key={v.id}>
              <span className="vt" style={{ background: v.atual ? 'color-mix(in oklab,#13804B 14%,var(--card))' : 'var(--muted)', color: v.atual ? '#13804B' : 'var(--muted-foreground)' }}>v{v.numero}</span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><strong style={{ fontSize: 14.5 }}>{v.origem}</strong>{v.atual && <span className="pl" style={{ background: 'color-mix(in oklab,#13804B 14%,var(--card))', color: '#13804B' }}>Versão atual</span>}</span>
                <span style={{ fontSize: 12.5, color: 'var(--muted-foreground)' }}><span className="mono">{dt(v.em)}</span> · {v.status}</span>
              </span>
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}><button className="gbtn sm" onClick={() => toast('Visualizar — em construção.')}>Visualizar</button>{!v.atual && <button className="gbtn sm" onClick={() => toast('Restaurar — em construção.')}>Restaurar</button>}</span>
            </div>
          ))}
        </div>
      )}
      {sub === 'ent' && (
        <div className="kc" style={{ gap: 0, padding: '6px 18px' }}>
          {entregas.length === 0 && <div style={{ padding: 16, fontSize: 13, color: 'var(--muted-foreground)' }}>Sem eventos de entrega/permissão registrados.</div>}
          {entregas.map((h, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '150px 34px minmax(0,1fr) 180px', gap: 12, alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
              <span className="mono" style={{ color: 'var(--muted-foreground)' }}>{dt(h.em)}</span>
              <span style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--muted)', color: 'var(--muted-foreground)', display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 800 }}>{h.operacao.slice(0, 3)}</span>
              <span style={{ fontSize: 13.5 }}><strong>{h.titulo}</strong></span>
              <span style={{ fontSize: 12.5, color: 'var(--muted-foreground)', textAlign: 'right' }} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── CONFIGURAÇÕES (§2.9) ───────────────────────────────────────────────────────────
function AbaConfig({ base, tp }: { base: GestaoDados['base']; tp: ReturnType<typeof gestaoDe> }) {
  const b = base!
  const [vis, setVis] = useState(!b.oculto)
  const [prot, setProt] = useState(b.protecao)
  const [salvando, setSalvando] = useState(false)
  async function toggleVis() { const nv = !vis; setVis(nv); const r = await definirVisibilidadeConteudo(b.id, nv); if (!r.ok) { setVis(!nv); toast.error(r.error || 'Falha.') } else toast.success(nv ? 'Visível para os alunos.' : 'Oculto para os alunos.') }
  async function toggleProt(k: keyof typeof prot) { const nv = { ...prot, [k]: !prot[k] }; setProt(nv); setSalvando(true); const r = await salvarProtecaoConteudo(b.id, { [k]: nv[k] }); setSalvando(false); if (!r.ok) { setProt(prot); toast.error(r.error || 'Falha.') } }
  async function arquivar() { const r = await arquivarConteudo(b.id); if (!r.ok) return toast.error(r.error || 'Falha.'); toast.success('Conteúdo arquivado.') }
  const Sw = ({ on, onClick }: { on: boolean; onClick: () => void }) => <button className={on ? 'sw on' : 'sw'} role="switch" aria-checked={on} onClick={onClick} />
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(420px,1fr))', gap: 14, alignItems: 'start' }}>
        {/* Publicação */}
        <div className="kc" style={{ gap: 0, padding: '16px 18px' }}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 4 }}><strong style={{ fontSize: 15 }}>Publicação</strong><span style={{ fontSize: 12.5, color: 'var(--muted-foreground)' }}>Quem enxerga este conteúdo</span></span>
          <div className="crow"><span style={{ flex: 1 }}><strong style={{ fontSize: 13.5 }}>Visível para os alunos</strong><div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>Desligar oculta para todos, inclusive nos pacotes</div></span><Sw on={vis} onClick={toggleVis} /></div>
          <div className="crow"><span style={{ flex: 1 }}><strong style={{ fontSize: 13.5 }}>Marca d’água com nome e CPF</strong><div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>No leitor e no download</div></span><Sw on={prot.marca_dagua} onClick={() => toggleProt('marca_dagua')} /></div>
        </div>
        {/* Proteção */}
        <div className="kc" style={{ gap: 0, padding: '16px 18px' }}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 4 }}><strong style={{ fontSize: 15 }}>Proteção</strong><span style={{ fontSize: 12.5, color: 'var(--muted-foreground)' }}>Vale para todas as origens</span></span>
          <div className="crow"><span style={{ flex: 1 }}><strong style={{ fontSize: 13.5 }}>Permitir baixar</strong><div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>Download do arquivo pelo aluno</div></span><Sw on={prot.pode_baixar} onClick={() => toggleProt('pode_baixar')} /></div>
          <div className="crow"><span style={{ flex: 1 }}><strong style={{ fontSize: 13.5 }}>Permitir grifar/anotar</strong><div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>Grifos e notas no Caderno</div></span><Sw on={prot.pode_grifar} onClick={() => toggleProt('pode_grifar')} /></div>
          <div className="crow"><span style={{ flex: 1 }}><strong style={{ fontSize: 13.5 }}>Bloquear impressão</strong><div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>No leitor</div></span><Sw on={!prot.pode_imprimir} onClick={() => toggleProt('pode_imprimir')} /></div>
        </div>
        {/* Bloco do tipo (configBloco) — estado local, persistência futura */}
        <div className="kc" style={{ gap: 0, padding: '16px 18px' }}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 4 }}><strong style={{ fontSize: 15 }}>{tp.configBloco.titulo}</strong><span style={{ fontSize: 12.5, color: 'var(--muted-foreground)' }}>{tp.configBloco.sub}</span></span>
          {tp.configBloco.rows.map((r) => (
            <div className="crow" key={r.id}>
              <span style={{ flex: 1 }}><strong style={{ fontSize: 13.5 }}>{r.titulo}</strong>{r.sub && <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{r.sub}</div>}</span>
              {r.tipo === 'sw' && <Sw on={!!r.padrao} onClick={() => toast('Ajuste salvo localmente (persistência em construção).')} />}
              {r.tipo === 'op' && <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>{(r.opcoes ?? []).map(([val, lab]) => <button key={val} className={r.padrao === val ? 'opn on' : 'opn'} onClick={() => toast('Ajuste salvo localmente (persistência em construção).')}>{lab}</button>)}</span>}
              {r.tipo === 'perm' && <span style={{ fontSize: 11.5, color: 'var(--muted-foreground)' }}>nas entregas</span>}
            </div>
          ))}
        </div>
        {/* Versões e avisos */}
        <div className="kc" style={{ gap: 0, padding: '16px 18px' }}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 4 }}><strong style={{ fontSize: 15 }}>Versões e avisos</strong><span style={{ fontSize: 12.5, color: 'var(--muted-foreground)' }}>Migração de marcações e arquivamento</span></span>
          <div className="crow"><span style={{ flex: 1 }}><strong style={{ fontSize: 13.5 }}>{tp.migracao}</strong><div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>Ao publicar uma nova versão</div></span><Sw on onClick={() => toast('Ajuste salvo localmente (persistência em construção).')} /></div>
          <div className="crow"><span style={{ flex: 1 }}><strong style={{ fontSize: 13.5, color: '#B4232A' }}>Arquivar conteúdo</strong><div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>Some da biblioteca dos alunos; mantém histórico e grifos</div></span><button className="gbtn sm" style={{ color: '#B4232A' }} onClick={arquivar}>Arquivar</button></div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><span style={{ alignSelf: 'center', fontSize: 12.5, color: 'var(--muted-foreground)' }}>{salvando ? 'Salvando…' : 'Alterações de publicação e proteção são salvas na hora.'}</span></div>
    </div>
  )
}

// ── FONTE E LINK (§2.1 — vídeo/áudio) ────────────────────────────────────────────────
function AbaFonte({ base, linkAluno }: { base: GestaoDados['base']; linkAluno: string }) {
  const b = base!
  const [copied, setCopied] = useState(false)
  async function copiar() { try { await navigator.clipboard.writeText(linkAluno); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { toast.error('Falha ao copiar.') } }
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <section style={{ flex: '3 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="kc" style={{ gap: 14, padding: '18px 20px' }}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><strong style={{ fontSize: 15 }}>De onde vem o {b.kind === 'video' ? 'vídeo' : 'áudio'}</strong><span style={{ fontSize: 12.5, color: 'var(--muted-foreground)' }}>Troque a fonte sem perder alunos, vínculos, pacotes e marcadores</span></span>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }} role="radiogroup">
            <button className="srcopt on" role="radio" aria-checked style={{ flex: '1 1 220px', display: 'flex', gap: 12, padding: 14, border: '1.5px solid var(--primary)', borderRadius: 16, background: 'var(--tint)', textAlign: 'left', cursor: 'pointer' }}>
              <span style={{ width: 38, height: 38, borderRadius: 11, ...seloStyle(b.kind), display: 'grid', placeItems: 'center', flex: '0 0 38px', fontSize: 10, fontWeight: 800 }}>{b.kind === 'video' ? 'MP4' : 'MP3'}</span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><strong style={{ fontSize: 14 }}>Importado</strong><span style={{ fontSize: 12.5, color: 'var(--muted-foreground)', lineHeight: 1.45 }}>Arquivo na plataforma. Todas as proteções, offline no app e métricas completas.</span></span>
            </button>
            <button className="srcopt" role="radio" aria-checked={false} style={{ flex: '1 1 220px', display: 'flex', gap: 12, padding: 14, border: '1.5px solid var(--border)', borderRadius: 16, background: 'var(--card)', textAlign: 'left', cursor: 'pointer' }} onClick={() => toast('Fonte por link externo — em construção.')}>
              <span style={{ width: 38, height: 38, borderRadius: 11, background: 'var(--muted)', color: 'var(--muted-foreground)', display: 'grid', placeItems: 'center', flex: '0 0 38px', fontSize: 10, fontWeight: 800 }}>URL</span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><strong style={{ fontSize: 14 }}>Link externo</strong><span style={{ fontSize: 12.5, color: 'var(--muted-foreground)', lineHeight: 1.45 }}>{b.kind === 'video' ? 'YouTube, Vimeo, Panda, Google Drive' : 'Spotify, SoundCloud, YouTube'} — detecção e proteções condicionais (em construção).</span></span>
            </button>
          </div>
          <div className="emc">Arquivo importado, versões geradas (qualidades) e escolha de capa — em construção (depende do pipeline de transcodificação).</div>
        </div>
      </section>
      <aside style={{ flex: '2 1 340px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="kc" style={{ gap: 12, padding: '18px 20px' }}>
          <strong style={{ fontSize: 15 }}>Link para o aluno</strong>
          <span style={{ fontSize: 12.5, color: 'var(--muted-foreground)', lineHeight: 1.5 }}>Abre dentro da plataforma, com as permissões e o registro de acesso. É o link para mandar no WhatsApp, e-mail ou cronograma.</span>
          <div className="lkbox"><span className="mono" style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--foreground)' }}>{linkAluno}</span><button className={copied ? 'cpy ok' : 'cpy'} onClick={copiar}>{copied ? 'Copiado ✓' : 'Copiar'}</button></div>
        </div>
      </aside>
    </div>
  )
}
