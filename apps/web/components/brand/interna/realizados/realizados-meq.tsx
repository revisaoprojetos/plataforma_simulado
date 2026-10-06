'use client'

// Simulados realizados — MEQ (spec 03 §4, denso). 4 KPIs com sublinha + abas (raio menor) + filtros +
// Em andamento (grid 3, card compacto capa 52 + banca + Continuar →) + Concluídos em TABELA (Simulado/
// Banca/Data/Melhor nota [10 seg coloridos + valor]/Ações) + Personalizados (formulário inline → criar +
// tabela). Mobile: tabelas viram LISTA em card. DATA-DRIVEN: tudo de `data`; toda ação é <a>/<Link>.
// Prefixo CSS `rlzmq-`. Fonte Sora (link local).

import { useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { internaTokensStyle, type InternaTheme } from '../interna-tokens'
import { useTemaInterno } from '../use-tema-interno'
import { useIsMobile } from '../perfil/use-is-mobile'
import { Ic, PaneTabs, Filtros, SecaoHead, Segs, CoverMeq, notec, fnum, type Pane, type Filtro } from './shared'
import type { RealizadosData, RlzEmAndamento, RlzConcluido, RlzPersonalizado, RlzCapa } from './data'

const FALLBACK_GRAD = 'linear-gradient(150deg,#121A3A,#2B4A8F)'
const gradOf = (c?: RlzCapa) => c?.cor || FALLBACK_GRAD

function mqVars(theme: InternaTheme): CSSProperties {
  const dark = theme === 'escuro'
  const azul = theme === 'azul'
  // Tokens de abas/filtros/KPI por tema (spec 03 §1.3). No tema AZUL os títulos fora de card
  // ficam BRANCOS sobre o fundo gradiente azul (--head/--sub) e as abas usam vidro translúcido.
  return {
    ['--tBg' as string]: dark ? '#121A3A' : azul ? 'rgba(255,255,255,.18)' : '#E4EAF5',
    ['--tOn' as string]: dark ? '#2F64C8' : '#FFFFFF',
    ['--tOnInk' as string]: dark ? '#FFFFFF' : '#171E3B',
    ['--cnt' as string]: dark ? 'rgba(94,155,255,.14)' : '#EAF1FB',
    ['--cntInk' as string]: dark ? '#7FB2FF' : '#306AB5',
    // Filtro ATIVO = cor da MARCA + texto branco (igual a Lei Seca/Banco e demais áreas, que usam
    // var(--brand) no selecionado). Antes era um navy fixo (#171E3B) que destoava e, no claro, ainda
    // ficava navy-sobre-navy = texto invisível.
    ['--fOn' as string]: 'var(--brand)',
    ['--fOnInk' as string]: '#FFFFFF',
    ['--hoverLine' as string]: azul ? '#FFFFFF' : 'var(--brand2)',
    ['--head' as string]: dark || azul ? '#FFFFFF' : '#171E3B',
    ['--sub' as string]: dark ? '#8E9BC4' : azul ? '#DCEBFF' : '#66729A',
    ['--shadow' as string]: dark ? 'none' : azul ? '0 20px 40px -30px rgba(10,30,80,.6)' : '0 1px 2px rgba(16,30,70,.04)',
  } as CSSProperties
}

const Card = ({ children, pad = 20 }: { children: React.ReactNode; pad?: number }) => (
  <div className="rlzmq-card" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: pad, boxShadow: 'var(--shadow)' }}>{children}</div>
)
// CTA como LINK
const CtaLink = ({ href, children, h = 38 }: { href: string; children: React.ReactNode; h?: number }) => (
  <Link href={href} className="rlzmq-cta" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: h, padding: '0 16px', borderRadius: 10, color: '#FFF', fontSize: 13, fontWeight: 700, background: 'linear-gradient(180deg,#4A8BEA,#2F64C8)', textDecoration: 'none' }}>{children}</Link>
)
const cap = (t: string) => <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>{t}</span>

// Ação primária da linha (Correção/Refazer) — CTA compacto h34 com ícone + rótulo (porte do mockup §4).
const ActCta = ({ href, icon, label }: { href: string; icon: string; label: string }) => (
  <Link href={href} className="rlzmq-cta" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 9, color: '#FFF', fontSize: 12.5, fontWeight: 700, background: 'linear-gradient(180deg,#4A8BEA,#2F64C8)', textDecoration: 'none' }}><Ic n={icon} s={13} />{label}</Link>
)
// Ação secundária com rótulo (Editar rascunho) — contorno h34.
const ActOutline = ({ href, label }: { href: string; label: string }) => (
  <Link href={href} className="rlzmq-ibtn" style={{ display: 'inline-flex', alignItems: 'center', height: 34, padding: '0 12px', borderRadius: 9, border: '1px solid var(--line)', color: 'var(--ink)', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>{label}</Link>
)
// Ação em ícone h34 (Refazer/Baixar) — porte da tabela (§4).
const ActIcon = ({ href, icon, label }: { href: string; icon: string; label: string }) => (
  <Link href={href} title={label} aria-label={label} className="rlzmq-ibtn" style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid var(--line)', color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Ic n={icon} s={14} /></Link>
)
// Selo de status com ponto (§4 personalizados): Concluído verde / Rascunho âmbar.
const StatusDot = ({ rascunho }: { rascunho: boolean }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: rascunho ? '#D9871A' : '#1FA868' }}>
    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />{rascunho ? 'Rascunho' : 'Concluído'}
  </span>
)

function Kpi({ l, v, sub }: { l: string; v: string; sub: string }) {
  return (
    <div style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em' }}>{l}</span>
      <b style={{ display: 'block', fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--ink)', margin: '2px 0' }}>{v}</b>
      <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{sub}</span>
    </div>
  )
}

function CardAndamento({ it }: { it: RlzEmAndamento }) {
  return (
    <Link href={it.continuarHref} className="rlzmq-card" style={{ display: 'block', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, boxShadow: 'var(--shadow)', color: 'inherit', textDecoration: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 52, height: 52, borderRadius: 10, overflow: 'hidden', flexShrink: 0 }}><CoverMeq titulo={it.capa.rotulo} grad={gradOf(it.capa)} img={it.capa.capa} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.titulo}</b>
          {it.banca ? <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{it.banca}</span> : null}
        </div>
      </div>
      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
          <span>Questão {it.questaoAtual} de {it.total}</span>
          <b style={{ color: 'var(--ink)' }}>{it.pct}%</b>
        </div>
        <Segs n={10} lit={Math.round(it.pct / 10)} h={6} on="var(--brand2)" gap={2} rad={2} />
      </div>
      <div style={{ marginTop: 14 }}><span className="rlzmq-cta" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 38, padding: '0 16px', borderRadius: 10, color: '#FFF', fontSize: 13, fontWeight: 700, background: 'linear-gradient(180deg,#4A8BEA,#2F64C8)' }}>Continuar<Ic n="arrow" s={14} /></span></div>
    </Link>
  )
}

// Tabela de concluídos (desktop, 5 colunas c/ Ações) / lista em card (mobile) — §4
function TabelaConcluidos({ mobile, itens }: { mobile: boolean; itens: RlzConcluido[] }) {
  if (mobile) {
    return (
      <Card pad={0}>
        {itens.map((it, k) => {
          const nota = it.notaLiberada && it.nota != null ? it.nota : null
          const [c] = nota != null ? notec(nota) : ['var(--muted)']
          return (
            <Link key={it.id} href={it.href} className="rlzmq-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderTop: k ? '1px solid var(--line)' : undefined, color: 'inherit', textDecoration: 'none' }}>
              <div style={{ width: 46, height: 46, borderRadius: 10, overflow: 'hidden', flexShrink: 0 }}><CoverMeq titulo={it.capa.rotulo} grad={gradOf(it.capa)} img={it.capa.capa} big={11} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.titulo}</b>
                <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{it.banca ? `${it.banca} · ` : ''}{it.data}</span>
                {nota != null ? (
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1 }}><Segs n={10} lit={Math.round(nota / 10)} h={6} on={c} gap={2} rad={2} /></div>
                    <b style={{ width: 38, textAlign: 'right', fontSize: 13, color: c }}>{fnum(nota)}</b>
                  </div>
                ) : <span style={{ display: 'block', marginTop: 4, fontSize: 11.5, color: 'var(--muted)' }}>Nota em breve</span>}
              </div>
              <span className="rlzmq-ibtn" style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid var(--line)', color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic n="cr" s={15} /></span>
            </Link>
          )
        })}
      </Card>
    )
  }
  const cols = 'minmax(0,2.4fr) 1fr 0.8fr 1.6fr 200px'
  return (
    <Card pad={20}>
      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 16, padding: '0 10px 10px' }}>{['Simulado', 'Banca', 'Data', 'Melhor nota', 'Ações'].map((h) => <span key={h} style={{ textAlign: h === 'Ações' ? 'right' : undefined }}>{cap(h)}</span>)}</div>
      {itens.map((it) => {
        const nota = it.notaLiberada && it.nota != null ? it.nota : null
        const [c] = nota != null ? notec(nota) : ['var(--muted)']
        return (
          <div key={it.id} className="rlzmq-row" style={{ display: 'grid', gridTemplateColumns: cols, gap: 16, alignItems: 'center', padding: '12px 10px', borderTop: '1px solid var(--line)' }}>
            <Link href={it.href} style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, color: 'inherit', textDecoration: 'none' }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, overflow: 'hidden', flexShrink: 0 }}><CoverMeq titulo={it.capa.rotulo} grad={gradOf(it.capa)} img={it.capa.capa} big={11} /></div>
              <div style={{ minWidth: 0 }}>
                <b style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.titulo}</b>
                {it.area ? <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{it.area}</span> : null}
              </div>
            </Link>
            <span style={{ fontSize: 12.5, color: 'var(--ink)' }}>{it.banca ?? '—'}</span>
            <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{it.data}</span>
            {nota != null
              ? <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={{ flex: 1 }}><Segs n={10} lit={Math.round(nota / 10)} h={6} on={c} gap={2} rad={2} /></div><b style={{ width: 38, textAlign: 'right', fontSize: 13, color: c }}>{fnum(nota)}</b></div>
              : <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Nota em breve</span>}
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <ActCta href={it.correcaoHref} icon="chart" label="Correção" />
              <ActIcon href={it.refazerHref} icon="play" label="Refazer" />
              <ActIcon href={it.baixarHref ?? it.href} icon="dl" label="Baixar caderno" />
            </div>
          </div>
        )
      })}
    </Card>
  )
}

// Formulário inline + tabela de personalizados
function FormPersonalizados({ mobile, criarHref }: { mobile: boolean; criarHref: string }) {
  const field = (label: string, placeholder: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {cap(label)}
      <div style={{ height: 42, padding: '0 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface2)', color: 'var(--muted)', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>{placeholder}<Ic n="chev" s={14} /></div>
    </div>
  )
  return (
    <Card pad={20}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, height: 14 }}>
          {[[6, 0.45], [10, 0.7], [14, 1]].map(([h, o], i) => <span key={i} style={{ display: 'block', width: 3, height: h, borderRadius: 1, background: 'var(--brand2)', opacity: o }} />)}
        </span>
        <b style={{ fontSize: 15, color: 'var(--ink)' }}>Novo simulado personalizado</b>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1.4fr 1.2fr 1fr 0.8fr auto', gap: 12, alignItems: 'end' }}>
        {field('Nome', 'Ex.: Reta final administrativo')}
        {field('Matérias', 'Selecione as matérias')}
        {field('Banca', 'Todas as bancas')}
        {field('Questões', '40')}
        <CtaLink href={criarHref} h={42}><Ic n="plus" s={15} />Criar simulado</CtaLink>
      </div>
    </Card>
  )
}

function TabelaPersonalizados({ mobile, itens }: { mobile: boolean; itens: RlzPersonalizado[] }) {
  if (mobile) {
    return (
      <Card pad={0}>
        {itens.map((it, k) => {
          const rascunho = it.status === 'rascunho'
          const [c] = it.nota != null ? notec(it.nota) : ['var(--muted)']
          return (
            <Link key={it.id} href={it.href} className="rlzmq-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderTop: k ? '1px solid var(--line)' : undefined, color: 'inherit', textDecoration: 'none' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{it.nome}</b>
                <div style={{ marginTop: 3 }}><StatusDot rascunho={rascunho} /></div>
                <span style={{ display: 'block', marginTop: 2, fontSize: 11.5, color: 'var(--muted)' }}>{it.materias ? `${it.materias} · ` : ''}{it.nQuestoes != null ? `${it.nQuestoes} questões` : ''}</span>
              </div>
              {it.nota != null ? <b style={{ fontSize: 14, color: c }}>{fnum(it.nota)}</b> : <Ic n={rascunho ? 'edit' : 'cr'} s={16} />}
            </Link>
          )
        })}
      </Card>
    )
  }
  const cols = 'minmax(0,2.2fr) 1.4fr 0.8fr 1.6fr 200px'
  return (
    <Card pad={20}>
      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 16, padding: '0 10px 10px' }}>{['Simulado', 'Matérias', 'Questões', 'Melhor nota', 'Ações'].map((h) => <span key={h} style={{ textAlign: h === 'Ações' ? 'right' : undefined }}>{cap(h)}</span>)}</div>
      {itens.map((it) => {
        const rascunho = it.status === 'rascunho'
        const [c] = it.nota != null ? notec(it.nota) : ['var(--muted)']
        return (
          <div key={it.id} className="rlzmq-row" style={{ display: 'grid', gridTemplateColumns: cols, gap: 16, alignItems: 'center', padding: '12px 10px', borderTop: '1px solid var(--line)' }}>
            <Link href={it.href} style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, color: 'inherit', textDecoration: 'none' }}>
              <span style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0, background: 'linear-gradient(150deg,#1F2A55,#306AB5)', color: '#8BEAEA', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Ic n="edit" s={16} /></span>
              <div style={{ minWidth: 0 }}>
                <b style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.nome}</b>
                <div style={{ marginTop: 2 }}><StatusDot rascunho={rascunho} /></div>
              </div>
            </Link>
            <span style={{ fontSize: 12.5, color: 'var(--ink)' }}>{it.materias ?? '—'}</span>
            <span style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 600 }}>{it.nQuestoes ?? '—'}</span>
            {it.nota != null
              ? <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={{ flex: 1 }}><Segs n={10} lit={Math.round(it.nota / 10)} h={6} on={c} gap={2} rad={2} /></div><b style={{ width: 38, textAlign: 'right', fontSize: 13, color: c }}>{fnum(it.nota)}</b></div>
              : <span style={{ fontSize: 12, color: 'var(--muted)' }}>—</span>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
              {rascunho
                ? <ActOutline href={it.editarHref ?? it.href} label="Editar" />
                : <ActCta href={it.refazerHref ?? it.href} icon="play" label="Refazer" />}
              <ActIcon href={it.baixarHref ?? it.href} icon="dl" label="Baixar caderno" />
            </div>
          </div>
        )
      })}
    </Card>
  )
}

const CSS = `
.rlzmq-pv{animation:rlzmqpv .45s cubic-bezier(.22,1,.36,1) both}
@keyframes rlzmqpv{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.rlzmq-tab{transition:background .25s,color .25s}.rlzmq-fbtn{transition:background .2s,color .2s,border-color .2s}
.rlzmq-card{transition:transform .4s cubic-bezier(.22,1,.36,1),box-shadow .4s cubic-bezier(.22,1,.36,1),border-color .3s}
.rlzmq-card:hover{transform:translateY(-4px);border-color:var(--hoverLine)}
.rlzmq-card .rlz-cov{transition:transform .7s cubic-bezier(.22,1,.36,1)}.rlzmq-card:hover .rlz-cov{transform:scale(1.06)}
.rlzmq-ibtn{transition:background .15s,color .15s,border-color .15s}.rlzmq-ibtn:hover{background:var(--chip);color:var(--brand2);border-color:var(--brand2)}
.rlzmq-cta{transition:filter .2s,transform .2s}.rlzmq-cta:hover{filter:brightness(1.08);transform:translateY(-1px)}
.rlzmq-row{transition:background .15s}.rlzmq-row:hover{background:var(--surface2)}
.rlz-sg{animation:rlzmqseg .5s ease-out both}@keyframes rlzmqseg{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.rlzmq-pv,.rlz-sg{animation:none!important}}
`

export function RealizadosMeq({ theme: themeProp, data }: { theme: InternaTheme; data: RealizadosData }) {
  const theme = useTemaInterno(themeProp)
  const mobile = useIsMobile()
  const [pt, setPt] = useState<Pane>('main')
  const [f, setF] = useState<Filtro>('all')
  const showAnd = f !== 'done'
  const showDone = f !== 'and'
  const S = data.stats
  const nAnd = data.emAndamento.length
  const nDone = data.concluidos.length
  const pers = data.personalizados
  const andCols = mobile ? '1fr' : 'repeat(3,1fr)'
  // Sublinha "N% do total" (usa o informado pelo backend ou deriva de concluídos/feitos).
  const pctConcluidos = S.pctConcluidos ?? (S.feitos > 0 ? Math.round((S.concluidos / S.feitos) * 100) : null)

  return (
    <div className="min-h-full" style={{ ...internaTokensStyle('meq', theme), ...mqVars(theme), minHeight: '100%' }}>
      {/* MEQ usa Sora (não carregada globalmente) — como em loading-meq-circuito */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&display=swap" />
      <style>{CSS}</style>
      <div style={{ padding: mobile ? '14px' : '24px', display: 'flex', flexDirection: 'column', gap: 20, background: 'var(--bg)', minHeight: '100%' }}>
        {mobile ? <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: '-0.04em', color: 'var(--head)' }}>Simulados realizados</h1> : null}
        <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: 10 }}>
          <Kpi l="Realizados" v={String(S.feitos)} sub={S.novosNoMes != null && S.novosNoMes > 0 ? `+${S.novosNoMes} este mês` : 'simulados feitos'} />
          <Kpi l="Concluídos" v={String(S.concluidos)} sub={pctConcluidos != null ? `${pctConcluidos}% do total` : 'finalizados'} />
          <Kpi l="Média geral" v={S.mediaGeral != null ? fnum(S.mediaGeral) : '—'} sub="nota de 0 a 100" />
          <Kpi l="Melhor nota" v={S.melhorNota != null ? fnum(S.melhorNota) : '—'} sub={S.melhorNotaOrigem || 'seu recorde'} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <PaneTabs marca="MEQ" pt={pt} onPane={setPt} nMain={S.feitos} nPers={pers.itens.length} radius={10} />
          {pt === 'main' ? <Filtros f={f} onFilter={setF} nAll={nAnd + nDone} nAnd={nAnd} nDone={nDone} /> : null}
        </div>

        {pt === 'main' ? (
          <div className="rlzmq-pv" key={`main-${f}`} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {showAnd && nAnd > 0 ? (
              <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <SecaoHead icon="clock" title="Em andamento" count={nAnd} color="#F2A93B" bg="#F2A93B22" />
                <div style={{ display: 'grid', gridTemplateColumns: andCols, gap: 12 }}>{data.emAndamento.map((it) => <CardAndamento key={it.id} it={it} />)}</div>
              </section>
            ) : null}
            {showDone && nDone > 0 ? (
              <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <SecaoHead icon="check" title="Concluídos" count={nDone} color="#2EC77A" bg="#2EC77A22" />
                <TabelaConcluidos mobile={mobile} itens={data.concluidos} />
              </section>
            ) : null}
          </div>
        ) : (
          <div className="rlzmq-pv" key="pers" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <FormPersonalizados mobile={mobile} criarHref={pers.criarHref} />
            <SecaoHead icon="clip" title="Seus simulados" count={pers.itens.length} color="var(--brand2)" bg="var(--chip)" />
            <TabelaPersonalizados mobile={mobile} itens={pers.itens} />
          </div>
        )}
      </div>
    </div>
  )
}
