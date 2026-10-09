'use client'

// VISÃO "DENTRO DE UMA PASTA" (/aluno?pasta=<id>) no NOVO design branded (spec telas internas).
// Reconstrói a antiga `SimuladosCatalogoAluno` (visão de pasta) na linguagem das "Realizados":
// hero (eyebrow + título + subtítulo), subpastas em grade, e os simulados em SEÇÕES por estado
// (Disponíveis / Agendados / Refazer · Já concluídos) usando a MESMA lógica `bucketDe` do catálogo
// antigo. Capas reusam CoverRev/CoverVnd/CoverMeq (por marca). Toda cor via tokens (--ink/--muted/
// --brand…) p/ ficar correto em claro/escuro/azul — era a queixa principal (cores de texto erradas).
//
// DATA-DRIVEN: tudo vem de props; nenhuma ação/valor fabricado. Ações espelham o card antigo:
//  · "Fazer agora"/"Fazer" → /simulado/{embed_token} (podeFazer); "Entrar" → idem (podeAguardar).
//  · "Refazer" → /simulado/{embed_token} (refazer).
//  · "Baixar caderno" → download direto de item.enunciadoUrl (mesma URL do card antigo).
//  · "Ver resultados" → /aluno/simulados/{id}.

import Link from 'next/link'
import { ArrowLeft, Folder, FolderOpen, Play, RotateCcw, Clock, CalendarClock, CircleCheck, FileDown } from 'lucide-react'
import { internaTokensStyle, INTERNA_FONT, type Brand, type InternaTheme } from '../interna-tokens'
import { useTemaInterno } from '../use-tema-interno'
import { CoverRev, CoverVnd, CoverMeq } from '../realizados/shared'
import type { ItemSimuladoCat } from '@/components/aluno/simulados-catalogo-aluno'

type PastaCat = { id: string; nome: string; cor: string | null; capa: string | null; count: number }

type PlatformPastaProps = {
  brand: Brand
  theme: InternaTheme
  pastaInfo: { id: string; nome: string; cor?: string | null; capa?: string | null } | null
  subpastas: PastaCat[]
  breadcrumb: { id: string; nome: string }[]
  itens: ItemSimuladoCat[]
  progresso?: Record<string, { feitos: number; total: number }>
  /** Nota/liberação/data dos JÁ FEITOS (p/ o ticket de concluído com nota, igual a "Realizados").
   *  `ultimo` = ISO da conclusão mais recente (usado para ORDENAR os já feitos por data). */
  notas?: Record<string, { nota: number | null; notaLiberada: boolean; data: string; ultimo?: string | null }>
  /** Progresso dos EM ANDAMENTO (questão atual / total / %) — p/ o ticket "Continuar" com barra. */
  andamentos?: Record<string, { questaoAtual: number; total: number; pct: number }>
}

// Gradiente de fallback por marca (mesmos das telas "Realizados").
const FALLBACK_GRAD: Record<Brand, string> = {
  revisao: 'linear-gradient(135deg,#2A1E4A,#4A31B8)',
  vnd: 'linear-gradient(140deg,#062A1B,#16804F)',
  meq: 'linear-gradient(150deg,#121A3A,#2B4A8F)',
}

// Baixa o caderno de questões (PDF) direto, com cache-buster — sem navegar (idêntico ao card antigo).
function baixarCaderno(url: string) {
  const sep = url.includes('?') ? '&' : '?'
  const a = document.createElement('a')
  a.href = `${url}${sep}v=${Date.now()}`
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

// ---- bucket (MESMA lógica do catálogo antigo: agendados/disponiveis/refazer) ----
type Bucket = 'agendados' | 'disponiveis' | 'refazer'
function bucketDe(i: ItemSimuladoCat): Bucket {
  if (i.emAndamento) return i.modo_aplicacao === 'janela_fixa' ? 'agendados' : 'disponiveis'
  if (i.refazer) return 'refazer'
  return i.modo_aplicacao === 'janela_fixa' ? 'agendados' : 'disponiveis'
}

// Metadados de cada seção: título + ícone chip + cores semânticas (verde/âmbar/azul).
const SECOES: { chave: Bucket; titulo: string; dot: string; chipBg: string }[] = [
  { chave: 'disponiveis', titulo: 'Disponíveis', dot: '#1FA868', chipBg: 'rgba(31,168,104,.14)' },
  { chave: 'agendados', titulo: 'Agendados', dot: '#D99A1E', chipBg: 'rgba(217,154,30,.16)' },
  { chave: 'refazer', titulo: 'Refazer / Já concluídos', dot: '#2F7DF6', chipBg: 'rgba(47,125,246,.14)' },
]

// Capa do card por marca — reusa a arte das "Realizados" (NÃO recriar). Imagem NORMAL = vis.capa.
function Capa({ brand, item }: { brand: Brand; item: ItemSimuladoCat }) {
  const img = item.vis?.capa ?? item.vis?.capaBanner ?? null
  const grad = item.vis?.cor || FALLBACK_GRAD[brand]
  // Capa full-bleed (object-cover), no MESMO formato dos cards de pasta. Na altura menor (112px) a arte
  // enquadra bem sem cortar demais (igual às pastas da home).
  if (brand === 'vnd') return <CoverVnd titulo={item.titulo} sub="" grad={grad} img={img} />
  if (brand === 'meq') return <CoverMeq titulo={item.titulo} grad={grad} img={img} />
  return <CoverRev titulo={item.titulo} sub="" grad={grad} img={img} />
}

// ---- botões (padrão IGUAL ao de "Simulados recentes": Fazer agora em gradiente de marca + Baixar com texto) ----
// "Fazer agora" — gradiente da marca (como o .hrv-cta dos recentes), texto branco, ocupa a largura.
function BtnPrimario({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="ip-btn-primary" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, height: 38, borderRadius: 11, padding: '0 12px', background: 'linear-gradient(180deg, var(--brand), color-mix(in srgb, var(--brand) 72%, #000 28%))', color: '#FFF', fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', textDecoration: 'none', border: 0, flex: 1, minWidth: 0, boxShadow: '0 10px 20px -12px color-mix(in srgb, var(--brand) 80%, transparent), inset 0 1px 0 rgba(255,255,255,.2)' }}>
      {children}
    </Link>
  )
}
function BtnSecundario({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="ip-btn-sec" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, height: 38, borderRadius: 11, padding: '0 14px', background: 'var(--surface)', color: 'var(--ink)', fontSize: 13, fontWeight: 700, textDecoration: 'none', border: '1px solid var(--line)', flexShrink: 0 }}>
      {children}
    </Link>
  )
}
// Download do caderno = botão COM TEXTO "Baixar" (igual ao dos recentes), ao lado da ação principal.
function BtnCaderno({ url }: { url: string }) {
  return (
    <button type="button" onClick={() => baixarCaderno(url)} title="Baixar caderno de questões" aria-label="Baixar caderno de questões"
      className="ip-btn-sec" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, height: 38, padding: '0 11px', borderRadius: 11, background: 'var(--surface)', color: 'var(--ink)', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer', border: '1px solid var(--line)', flexShrink: 0 }}>
      <FileDown size={14} />Baixar
    </button>
  )
}

// MODELO PÔSTER (salvo): layout antigo em pôster (capa no TOPO, 120px, + corpo com botões empilhados).
// Mantido para referência; a versão viva (CardSim) usa o layout TICKET (capa à ESQUERDA). Não apagar.
function CardSimPoster({ brand, item }: { brand: Brand; item: ItemSimuladoCat }) {
  const feito = item.finalizadas > 0
  const fazerHref = item.embed_token ? `/simulado/${item.embed_token}` : null
  const statusTxt = item.tom === 'sky' ? item.quando : item.statusLabel
  return (
    <div className="ip-card" style={{ display: 'flex', flexDirection: 'column', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
      <div style={{ position: 'relative', height: 120, overflow: 'hidden' }}>
        <Capa brand={brand} item={item} />
        {item.novo && (
          <span style={{ position: 'absolute', left: 12, top: 12, height: 22, padding: '0 9px', borderRadius: 99, background: '#E5484D', color: '#FFF', fontSize: 10, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center' }}>Novo</span>
        )}
        {item.emAndamento && (
          <span style={{ position: 'absolute', right: 12, top: 12, height: 22, padding: '0 9px', borderRadius: 99, background: '#F1C232', color: '#2A1A55', fontSize: 10, fontWeight: 800, letterSpacing: '.03em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center' }}>Em andamento</span>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px 16px', flex: 1 }}>
        <b style={{ fontSize: 14.5, lineHeight: 1.3, color: 'var(--ink)', fontWeight: 800, letterSpacing: '-0.01em', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.titulo}</b>
        {statusTxt ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
            <Clock size={13} style={{ flexShrink: 0 }} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{statusTxt}</span>
          </span>
        ) : null}
        {item.refazer && !item.emAndamento ? (
          <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Já feito {item.finalizadas.toLocaleString('pt-BR')}x{Number.isFinite(item.restantes) ? ` · ${item.restantes.toLocaleString('pt-BR')} restante(s)` : ''}</span>
        ) : null}

        {/* Ações — espelham o card antigo, agora sobre tokens. */}
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {item.podeFazer && fazerHref ? (
            <BtnPrimario href={fazerHref}>
              {item.emAndamento ? <><RotateCcw size={15} /> Continuar</> : item.refazer ? <><RotateCcw size={15} /> Refazer</> : <><Play size={15} /> Fazer agora</>}
            </BtnPrimario>
          ) : item.podeAguardar && fazerHref ? (
            <BtnPrimario href={fazerHref}><Clock size={15} /> Entrar</BtnPrimario>
          ) : (
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 38, borderRadius: 11, background: 'var(--surface2)', color: 'var(--muted)', fontSize: 12.5, fontWeight: 700 }}>
              {item.statusLabel === 'Agendado' ? 'Ainda não abriu' : item.statusLabel === 'Em manutenção' ? 'Em manutenção' : 'Indisponível'}
            </span>
          )}
          {(item.enunciadoUrl || feito) ? (
            <div style={{ display: 'flex', gap: 8 }}>
              {item.enunciadoUrl ? <BtnCaderno url={item.enunciadoUrl} /> : null}
              {feito ? (
                <BtnSecundario href={`/aluno/simulados/${item.id}`}><CircleCheck size={15} /> Ver resultados</BtnSecundario>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
// Evita "unused" no lint — o modelo pôster fica disponível mas não renderizado.
void CardSimPoster

// TICKET (vivo): capa à ESQUERDA (largura fixa 160, altura cheia do card) + corpo à direita
// com título, status e a LINHA de ações (ação principal + download em ícone, lado a lado;
// "Ver resultados" quando já concluído). Mesmos hrefs/handlers do modelo pôster.
function CardSim({ brand, item }: { brand: Brand; item: ItemSimuladoCat }) {
  const fazerHref = item.embed_token ? `/simulado/${item.embed_token}` : null
  const statusTxt = item.tom === 'sky' ? item.quando : item.statusLabel
  return (
    <div className="ip-card" style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r)', overflow: 'hidden', minHeight: 112 }}>
      {/* capa à esquerda (altura cheia) */}
      <div style={{ position: 'relative', width: '36%', maxWidth: 160, flexShrink: 0, overflow: 'hidden' }}>
        <Capa brand={brand} item={item} />
        {item.novo && (
          <span style={{ position: 'absolute', left: 10, top: 10, height: 22, padding: '0 9px', borderRadius: 99, background: '#E5484D', color: '#FFF', fontSize: 10, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center' }}>Novo</span>
        )}
        {item.emAndamento && (
          <span style={{ position: 'absolute', left: 8, bottom: 8, maxWidth: 'calc(100% - 16px)', height: 20, padding: '0 8px', borderRadius: 99, background: '#F1C232', color: '#2A1A55', fontSize: 9.5, fontWeight: 800, letterSpacing: '.02em', textTransform: 'uppercase', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center' }}>Em andamento</span>
        )}
      </div>
      {/* corpo à direita */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7, padding: '12px 14px' }}>
        <b style={{ fontSize: 14, lineHeight: 1.25, color: 'var(--ink)', fontWeight: 800, letterSpacing: '-0.01em', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.titulo}</b>
        {statusTxt ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
            <Clock size={13} style={{ flexShrink: 0 }} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{statusTxt}</span>
          </span>
        ) : null}
        {item.refazer && !item.emAndamento ? (
          <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Já feito {item.finalizadas.toLocaleString('pt-BR')}x{Number.isFinite(item.restantes) ? ` · ${item.restantes.toLocaleString('pt-BR')} restante(s)` : ''}</span>
        ) : null}

        {/* Ações — LINHA única (igual aos "Simulados recentes"): Fazer agora + Baixar lado a lado. */}
        <div style={{ marginTop: 'auto', display: 'flex', gap: 8 }}>
          {item.podeFazer && fazerHref ? (
            <BtnPrimario href={fazerHref}>
              {item.emAndamento ? <><RotateCcw size={15} /> Continuar</> : <><Play size={15} /> Fazer agora</>}
            </BtnPrimario>
          ) : item.podeAguardar && fazerHref ? (
            <BtnPrimario href={fazerHref}><Clock size={15} /> Entrar</BtnPrimario>
          ) : (
            <span style={{ flex: 1, minWidth: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 38, borderRadius: 11, background: 'var(--surface2)', color: 'var(--muted)', fontSize: 12.5, fontWeight: 700 }}>
              {item.statusLabel === 'Agendado' ? 'Ainda não abriu' : item.statusLabel === 'Em manutenção' ? 'Em manutenção' : 'Indisponível'}
            </span>
          )}
          {item.enunciadoUrl ? <BtnCaderno url={item.enunciadoUrl} /> : null}
        </div>
      </div>
    </div>
  )
}

// TICKET "EM ANDAMENTO" (igual ao de "Simulados realizados"): capa + selo EM ANDAMENTO + título +
// barra de progresso (Questão X de Y · %) + Continuar + Baixar. Mesmo tamanho dos demais tickets.
function CardAndamento({ brand, item, prog }: { brand: Brand; item: ItemSimuladoCat; prog?: { questaoAtual: number; total: number; pct: number } }) {
  const fazerHref = item.embed_token ? `/simulado/${item.embed_token}` : null
  const pct = prog?.pct ?? 0
  return (
    <div className="ip-card" style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r)', overflow: 'hidden', minHeight: 112 }}>
      <div style={{ position: 'relative', width: '36%', maxWidth: 160, flexShrink: 0, overflow: 'hidden' }}>
        <Capa brand={brand} item={item} />
        <span style={{ position: 'absolute', left: 8, top: 8, maxWidth: 'calc(100% - 16px)', height: 20, padding: '0 8px', borderRadius: 99, background: '#F1C232', color: '#2A1A55', fontSize: 9.5, fontWeight: 800, letterSpacing: '.02em', textTransform: 'uppercase', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#2A1A55', flexShrink: 0 }} />Em andamento
        </span>
      </div>
      <div style={{ flex: 1, minWidth: 0, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <b style={{ fontSize: 14, lineHeight: 1.25, color: 'var(--ink)', fontWeight: 800, letterSpacing: '-0.01em', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.titulo}</b>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Questão {(prog?.questaoAtual ?? 0).toLocaleString('pt-BR')} de {(prog?.total ?? 0).toLocaleString('pt-BR')}</span>
            <b style={{ color: 'var(--ink)', flexShrink: 0 }}>{pct}%</b>
          </div>
          <div style={{ height: 5, borderRadius: 3, background: 'var(--surface2)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, pct))}%`, borderRadius: 3, background: 'var(--brand)' }} />
          </div>
        </div>
        <div style={{ marginTop: 'auto', display: 'flex', gap: 8 }}>
          {fazerHref ? <BtnPrimario href={fazerHref}><RotateCcw size={15} /> Continuar</BtnPrimario> : <span style={{ flex: 1, minWidth: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 38, borderRadius: 11, background: 'var(--surface2)', color: 'var(--muted)', fontSize: 12.5, fontWeight: 700 }}>Indisponível</span>}
          {item.enunciadoUrl ? <BtnCaderno url={item.enunciadoUrl} /> : null}
        </div>
      </div>
    </div>
  )
}

// TICKET "JÁ FEITO" (igual ao Concluído de "Simulados realizados"): capa à esquerda + Concluído · data +
// título + NOTA (pílula) ou "Nota em breve". Card inteiro leva ao resultado (/aluno/simulados/{id}).
function CardFeito({ brand, item, nota }: { brand: Brand; item: ItemSimuladoCat; nota?: { nota: number | null; notaLiberada: boolean; data: string } }) {
  const n = nota?.notaLiberada && nota?.nota != null ? nota.nota : null
  return (
    <Link href={`/aluno/simulados/${item.id}`} className="ip-card" style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r)', overflow: 'hidden', minHeight: 112, color: 'inherit', textDecoration: 'none' }}>
      <div style={{ position: 'relative', width: '36%', maxWidth: 160, flexShrink: 0, overflow: 'hidden' }}>
        <Capa brand={brand} item={item} />
      </div>
      <div style={{ flex: 1, minWidth: 0, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: '#1FA868' }}><CircleCheck size={13} />Concluído</span>
          {nota?.data ? <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{nota.data}</span> : null}
        </div>
        <span style={{ fontSize: 14.5, lineHeight: 1.3, color: 'var(--ink)', fontWeight: 700, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.titulo}</span>
        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {n != null
            ? <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 3, height: 28, padding: '0 11px', borderRadius: 9, background: '#1FA86822', color: '#1FA868', fontSize: 14, fontWeight: 800 }}>{n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}<span style={{ fontSize: 10, fontWeight: 700, opacity: .8 }}>nota</span></span>
            : <span style={{ display: 'inline-flex', alignItems: 'center', height: 28, padding: '0 10px', borderRadius: 9, background: 'var(--surface2)', color: 'var(--muted)', fontSize: 11.5, fontWeight: 700 }}>Nota em breve</span>}
        </div>
      </div>
    </Link>
  )
}

function CardSubpasta({ sp }: { sp: PastaCat }) {
  const grad = sp.cor || 'linear-gradient(150deg,#3C4458,#5B6478)'
  return (
    <Link href={`/aluno?pasta=${sp.id}`} className="ip-card" style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r)', overflow: 'hidden', minHeight: 96, color: 'inherit', textDecoration: 'none' }}>
      <div style={{ position: 'relative', width: 96, flexShrink: 0, overflow: 'hidden', background: sp.capa ? undefined : grad }}>
        {sp.capa ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={sp.capa} alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <FolderOpen size={30} style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', color: 'rgba(255,255,255,.85)' }} />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0, padding: '12px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, width: 'fit-content', padding: '2px 8px', borderRadius: 7, background: 'var(--chip)', color: 'var(--brand)', fontSize: 9.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase' }}><Folder size={11} /> Pasta</span>
        <b style={{ fontSize: 14, lineHeight: 1.25, color: 'var(--ink)', fontWeight: 800, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{sp.nome}</b>
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{sp.count.toLocaleString('pt-BR')} simulado{sp.count !== 1 ? 's' : ''}</span>
      </div>
    </Link>
  )
}

const CSS = `
/* adaptativo ao CONTAINER (nao ao viewport) — nao corta em tablet/iframe; min(100%,440px) = 1 coluna quando estreito.
   Cards mais LARGOS: min 440px → menos colunas (ticket capa+infos com mais respiro). */
.ip-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,440px),1fr));gap:16px;align-items:stretch}
.ip-card{height:100%;transition:transform .4s cubic-bezier(.22,1,.36,1),box-shadow .4s cubic-bezier(.22,1,.36,1),border-color .25s}
.ip-card:hover{transform:translateY(-3px);border-color:var(--brandLine,var(--line));box-shadow:0 22px 40px -28px rgba(0,0,0,.45)}
.ip-card .rlz-cov{transition:transform .6s cubic-bezier(.22,1,.36,1)}.ip-card:hover .rlz-cov{transform:scale(1.05)}
.ip-btn-primary{transition:filter .25s,transform .25s}.ip-btn-primary:hover{filter:brightness(1.08);transform:translateY(-1px)}
.ip-btn-sec{transition:background .2s,color .2s,border-color .2s}.ip-btn-sec:hover{background:var(--chip);color:var(--brand);border-color:var(--brandLine,var(--line))}
.ip-crumb{transition:background .2s,color .2s}.ip-crumb:hover{background:var(--surface2);color:var(--ink)}
@media (prefers-reduced-motion:reduce){.ip-card,.ip-card .rlz-cov,.ip-btn-primary{transition:none!important}}
`

export function PlatformPasta({ brand, theme, pastaInfo, subpastas, breadcrumb, itens, progresso, notas, andamentos }: PlatformPastaProps) {
  // progresso é aceito no contrato por pasta (não usado nos cards de simulado); evita "unused".
  void progresso
  const tema = useTemaInterno(theme)
  const nome = pastaInfo?.nome ?? 'Pasta'
  const cor = pastaInfo?.cor || 'var(--brand)'

  // Organização igual a "Simulados realizados": EM ANDAMENTO (Continuar + barra) e JÁ FEITOS (nota) em
  // seções próprias; os demais NÃO FEITOS seguem em Disponíveis/Agendados (ticket "recente": Fazer + Baixar).
  // ORDENAÇÃO: já feitos por data de conclusão (mais recente 1º, igual a Realizados); os demais por
  // nome (numérico: Simulado 01, 02, 03…) — antes a ordem vinha "crua" do banco (por id) e ficava embaralhada.
  const porNome = (a: ItemSimuladoCat, b: ItemSimuladoCat) => (a.titulo || '').localeCompare(b.titulo || '', 'pt-BR', { numeric: true, sensitivity: 'base' })
  const emAndamento = itens.filter((i) => i.emAndamento && i.finalizadas <= 0).sort(porNome)
  const feitos = itens
    .filter((i) => i.finalizadas > 0)
    .sort((a, b) => (notas?.[b.id]?.ultimo ?? '').localeCompare(notas?.[a.id]?.ultimo ?? '') || porNome(a, b))
  const naoFeitos = itens.filter((i) => i.finalizadas <= 0 && !i.emAndamento)
  const buckets: Record<Bucket, ItemSimuladoCat[]> = { disponiveis: [], agendados: [], refazer: [] }
  for (const i of naoFeitos) buckets[bucketDe(i)].push(i)
  for (const k of Object.keys(buckets) as Bucket[]) buckets[k].sort(porNome)

  return (
    <div style={{ ...internaTokensStyle(brand, tema), minHeight: '100%', padding: 24, fontFamily: INTERNA_FONT[brand] }}>
      <style>{CSS}</style>
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Breadcrumb: Início › … › atual */}
        <nav style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, fontSize: 13, color: 'var(--muted)' }}>
          <Link href="/aluno" className="ip-crumb" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 8, color: 'inherit', textDecoration: 'none', fontWeight: 600 }}>
            <ArrowLeft size={15} /> Início
          </Link>
          {breadcrumb.map((c, i) => {
            const ultimo = i === breadcrumb.length - 1
            return (
              <span key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                <span style={{ opacity: 0.5, padding: '0 2px' }}>/</span>
                {ultimo ? (
                  <span style={{ padding: '3px 8px', borderRadius: 8, fontWeight: 800, color: 'var(--ink)' }}>{c.nome}</span>
                ) : (
                  <Link href={`/aluno?pasta=${c.id}`} className="ip-crumb" style={{ padding: '3px 8px', borderRadius: 8, fontWeight: 700, color: 'inherit', textDecoration: 'none' }}>{c.nome}</Link>
                )}
              </span>
            )
          })}
        </nav>

        {/* Hero: badge de pasta + título + subtítulo */}
        <header style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ width: 48, height: 48, flexShrink: 0, borderRadius: 14, background: cor, color: '#FFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 22px -12px rgba(0,0,0,.5)' }}>
            <FolderOpen size={22} />
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <span style={{ display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--brand)' }}>Pasta de simulados</span>
            <h1 style={{ margin: '2px 0 0', fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nome}</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13.5, color: 'var(--muted)' }}>
              {itens.length.toLocaleString('pt-BR')} simulado{itens.length !== 1 ? 's' : ''} nesta pasta.
              {subpastas.length ? ` · ${subpastas.length.toLocaleString('pt-BR')} subpasta${subpastas.length !== 1 ? 's' : ''}.` : ''}
            </p>
          </div>
        </header>

        {/* Subpastas (estilo Drive) */}
        {subpastas.length > 0 ? (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 12 }}>
              {subpastas.map((sp) => <CardSubpasta key={sp.id} sp={sp} />)}
            </div>
          </section>
        ) : null}

        {/* Seções por estado */}
        {itens.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '48px 20px', borderRadius: 'var(--r)', border: '1.5px dashed var(--line)', color: 'var(--muted)', textAlign: 'center' }}>
            <FolderOpen size={28} />
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Nenhum simulado nesta pasta.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
            {/* EM ANDAMENTO: ticket "Continuar" com barra de progresso (igual a "Simulados realizados") */}
            {emAndamento.length > 0 ? (
              <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 28, height: 28, borderRadius: 9, background: 'rgba(217,154,30,.16)', color: '#D99A1E', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Clock size={15} /></span>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>Em andamento</h2>
                  <span style={{ fontSize: 12.5, fontWeight: 800, padding: '2px 9px', borderRadius: 99, background: 'var(--chip)', color: 'var(--brand)' }}>{emAndamento.length.toLocaleString('pt-BR')}</span>
                </div>
                <div className="ip-grid">
                  {emAndamento.map((it) => <CardAndamento key={it.id} brand={brand} item={it} prog={andamentos?.[it.id]} />)}
                </div>
              </section>
            ) : null}

            {/* NÃO FEITOS: Disponíveis / Agendados (ticket "recente": Fazer agora + Baixar) */}
            {SECOES.filter((s) => s.chave !== 'refazer').map((sec) => {
              const arr = buckets[sec.chave]
              if (arr.length === 0) return null
              return (
                <section key={sec.chave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 28, height: 28, borderRadius: 9, background: sec.chipBg, color: sec.dot, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      {sec.chave === 'agendados' ? <CalendarClock size={15} /> : <Play size={15} />}
                    </span>
                    <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>{sec.titulo}</h2>
                    <span style={{ fontSize: 12.5, fontWeight: 800, padding: '2px 9px', borderRadius: 99, background: 'var(--chip)', color: 'var(--brand)' }}>{arr.length.toLocaleString('pt-BR')}</span>
                  </div>
                  <div className="ip-grid">
                    {arr.map((it) => <CardSim key={it.id} brand={brand} item={it} />)}
                  </div>
                </section>
              )
            })}

            {/* JÁ FEITOS: ticket de concluído com NOTA (igual a "Simulados realizados") */}
            {feitos.length > 0 ? (
              <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 28, height: 28, borderRadius: 9, background: 'rgba(31,168,104,.14)', color: '#1FA868', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><CircleCheck size={15} /></span>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>Já feitos</h2>
                  <span style={{ fontSize: 12.5, fontWeight: 800, padding: '2px 9px', borderRadius: 99, background: 'var(--chip)', color: 'var(--brand)' }}>{feitos.length.toLocaleString('pt-BR')}</span>
                </div>
                <div className="ip-grid">
                  {feitos.map((it) => <CardFeito key={it.id} brand={brand} item={it} nota={notas?.[it.id]} />)}
                </div>
              </section>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
