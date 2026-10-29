'use client'
// Card "Novidades" (O que mudou) da Início nova — FUNCIONAL: filtro por categoria, item em destaque,
// estado "lida" por aluno (ponto de não lida + "Marcar tudo como lido"). Dados reais vêm do servidor.
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Card, Btn, Muted } from '@/components/nova/ui'
import { Icon } from '@/components/nova/icons'
import { CATEGORIAS, CAT_LABEL, CAT_KIND, type NovidadeComLeitura, type CategoriaNovidade, type NovidadeKind } from '@/lib/novidades/tipos'
import { marcarNovidadeLida, marcarTodasNovidadesLidas } from './novidades-actions'

const COR: Record<NovidadeKind, { bg: string; fg: string; dot: string }> = {
  brand: { bg: 'var(--chip)', fg: 'var(--brand)', dot: 'var(--brand)' },
  gold: { bg: 'var(--peachBg)', fg: 'var(--accentInk)', dot: 'var(--gold)' },
  green: { bg: 'var(--okBg)', fg: 'var(--ok)', dot: 'var(--ok)' },
  blue: { bg: 'var(--infoBg)', fg: 'var(--info)', dot: 'var(--info)' },
  pink: { bg: 'var(--pinkBg)', fg: 'var(--pink)', dot: 'var(--pink)' },
  gray: { bg: 'var(--surface2)', fg: 'var(--muted)', dot: 'var(--muted2)' },
}

function quando(iso: string): string {
  const d0 = (dt: Date) => Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate())
  const dias = Math.round((d0(new Date()) - d0(new Date(iso))) / 86400000)
  if (dias <= 0) return 'hoje'
  if (dias === 1) return 'ontem'
  if (dias < 7) return `há ${dias} dias`
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function CatTag({ cat }: { cat: CategoriaNovidade }) {
  const c = COR[CAT_KIND[cat]]
  return <span style={{ display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 9px', borderRadius: 99, background: c.bg, color: c.fg, fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>{CAT_LABEL[cat]}</span>
}

export function NovidadesCard({ novidades }: { novidades: NovidadeComLeitura[] }) {
  const router = useRouter()
  const [filtro, setFiltro] = React.useState<'tudo' | CategoriaNovidade>('tudo')
  const [pending, startTransition] = React.useTransition()

  const naoLidas = novidades.filter((n) => !n.lida).length
  const lista = filtro === 'tudo' ? novidades : novidades.filter((n) => n.categoria === filtro)
  const destaque = lista.find((n) => n.destaque) ?? lista[0] ?? null
  const resto = lista.filter((n) => n.id !== destaque?.id)

  const abrir = (n: NovidadeComLeitura) => {
    if (!n.lida) startTransition(() => { marcarNovidadeLida(n.id).then(() => router.refresh()) })
    if (n.cta_url && n.cta_url !== '#') router.push(n.cta_url)
  }
  const marcarTudo = () => startTransition(() => { marcarTodasNovidadesLidas().then(() => router.refresh()) })

  const chips: { v: 'tudo' | CategoriaNovidade; label: string }[] = [{ v: 'tudo', label: 'Tudo' }, ...CATEGORIAS.map((c) => ({ v: c.value, label: c.label }))]

  return (
    <Card>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--muted)' }}>O que mudou</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>Novidades</h2>
            {naoLidas > 0 ? <span style={{ display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px', borderRadius: 99, background: 'var(--danger)', color: '#fff', fontSize: 11, fontWeight: 800 }}>{naoLidas} novas</span> : null}
          </div>
        </div>
        {naoLidas > 0 ? (
          <button type="button" onClick={marcarTudo} disabled={pending} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'transparent', border: 0, color: 'var(--brand)', fontSize: 13, fontWeight: 800, cursor: pending ? 'default' : 'pointer', opacity: pending ? 0.6 : 1 }}>
            Marcar tudo como lido <Icon n="chev" size={14} />
          </button>
        ) : null}
      </div>

      {/* Filtro por categoria */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {chips.map((c) => {
          const on = filtro === c.v
          return (
            <button key={c.v} type="button" onClick={() => setFiltro(c.v)} style={{ height: 32, padding: '0 14px', borderRadius: 99, border: `1px solid ${on ? 'var(--brand)' : 'var(--line)'}`, background: on ? 'var(--brand)' : 'var(--surface)', color: on ? '#fff' : 'var(--ink)', fontSize: 12.5, fontWeight: on ? 800 : 700, cursor: 'pointer' }}>{c.label}</button>
          )
        })}
      </div>

      {lista.length === 0 ? (
        <div style={{ padding: '18px 14px', borderRadius: 12, background: 'var(--surface2)', textAlign: 'center' }}><Muted size={13}>Nenhuma novidade nesta categoria.</Muted></div>
      ) : (
        <>
          {/* Destaque */}
          {destaque ? (
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', width: 148, height: 118, flexShrink: 0, borderRadius: 14, overflow: 'hidden', background: destaque.cover_url ? undefined : 'linear-gradient(135deg,#241047,#5B2A9E)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {destaque.cover_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={destaque.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontFamily: 'var(--font-brand)', fontWeight: 800, fontSize: 22, color: 'var(--gold)', textAlign: 'center', lineHeight: 1 }}>{CAT_LABEL[destaque.categoria].split(' ')[0]}</span>
                )}
                <span style={{ position: 'absolute', top: 8, left: 8, display: 'inline-flex', alignItems: 'center', gap: 4, height: 18, padding: '0 7px', borderRadius: 6, background: 'var(--danger)', color: '#fff', fontSize: 9.5, fontWeight: 800 }}>REC</span>
              </div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <CatTag cat={destaque.categoria} />
                  <Muted size={11.5}>· {quando(destaque.publicado_em)}</Muted>
                  {!destaque.lida ? <span style={{ width: 7, height: 7, borderRadius: 99, background: 'var(--danger)' }} /> : null}
                </div>
                <div style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.3 }}>{destaque.titulo}</div>
                {destaque.descricao ? <Muted size={12.5}>{destaque.descricao}</Muted> : null}
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  {destaque.cta_label ? <Btn kind="gold" size="sm" icon="play" onClick={() => abrir(destaque)}>{destaque.cta_label}</Btn> : null}
                  {destaque.cta2_label ? <Btn kind="secondary" size="sm" href={destaque.cta2_url && destaque.cta2_url !== '#' ? destaque.cta2_url : undefined} onClick={() => { if (!destaque.lida) marcarNovidadeLida(destaque.id) }}>{destaque.cta2_label}</Btn> : null}
                </div>
              </div>
            </div>
          ) : null}

          {/* Lista */}
          {resto.map((n, i) => (
            <div key={n.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 0', borderTop: i === 0 && !destaque ? 'none' : '1px solid var(--line)' }}>
              <span style={{ width: 7, height: 7, borderRadius: 99, marginTop: 6, flexShrink: 0, background: n.lida ? 'transparent' : COR[CAT_KIND[n.categoria]].dot, border: n.lida ? '1px solid var(--line2)' : 'none' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <CatTag cat={n.categoria} />
                  <Muted size={11.5}>· {quando(n.publicado_em)}</Muted>
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.3 }}>{n.titulo}</div>
                {n.descricao ? <Muted size={12}>{n.descricao}</Muted> : null}
                <button type="button" onClick={() => abrir(n)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6, background: 'transparent', border: 0, color: 'var(--brand)', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>
                  {n.cta_label || 'Ver agora'} <Icon n="chev" size={13} />
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {/* Rodapé */}
      <div style={{ textAlign: 'center', paddingTop: 6 }}>
        <Muted size={12.5}>Ver todas as novidades ({novidades.length})</Muted>
      </div>
    </Card>
  )
}
