'use client'

// Editor de perfil RICO (só Revisão): modal com pré-visualização AO VIVO do card + tabs Foto / Banner /
// Adesivos. Reusa os dados do sistema (avatares da Capi, fundos cadastrados, adesivos/carimbos liberados)
// e salva tudo num POST em /api/aluno/perfil/personalizar (avatar/capa/cor + perfilAdesivos).

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Pencil, X, Check, Loader2, Camera, ImageIcon, Sticker, Trash2, Plus, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { avatarPadraoDe } from '@/lib/aluno/avatar-padrao'
import type { PerfilAdesivo } from '@/lib/aluno/personalizacao'

const ehCor = (v: string | null): boolean => !!v && v.startsWith('#')
type Colecionado = { carimboId: string; url: string; titulo: string }
type Tab = 'foto' | 'banner' | 'adesivos'

export function PerfilEditorPro(props: {
  nome: string
  iniciais: string
  nivel: number
  tituloNivel: string
  avatar: string | null
  perfilCapa: string | null
  avatarCor: string | null
  adesivos: PerfilAdesivo[]
  avatares: string[]
  fundos: string[]
  cores: string[]
  colecionados: Colecionado[]
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [abaInicial, setAbaInicial] = useState<Tab>('foto')

  return (
    <>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => { setAbaInicial('adesivos'); setAberto(true) }} title="Decorar perfil"
          className="inline-flex items-center gap-1.5 rounded-xl border bg-card/85 px-3 py-2 text-xs font-semibold shadow-sm backdrop-blur transition-colors hover:bg-muted">
          <Sticker className="h-3.5 w-3.5" /> Decorar perfil
        </button>
        <button type="button" onClick={() => { setAbaInicial('foto'); setAberto(true) }} title="Editar perfil"
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground shadow-sm transition-opacity hover:opacity-90">
          <Pencil className="h-3.5 w-3.5" /> Editar perfil
        </button>
      </div>
      {aberto && typeof document !== 'undefined' && createPortal(
        <EditorModal {...props} abaInicial={abaInicial} onFechar={() => setAberto(false)} onSalvou={() => { setAberto(false); router.refresh() }} />,
        document.body,
      )}
    </>
  )
}

function EditorModal({
  nome, iniciais, nivel, tituloNivel, avatar, perfilCapa, avatarCor, adesivos, avatares, fundos, cores, colecionados, abaInicial, onFechar, onSalvou,
}: Parameters<typeof PerfilEditorPro>[0] & { abaInicial: Tab; onFechar: () => void; onSalvou: () => void }) {
  const [tab, setTab] = useState<Tab>(abaInicial)
  const [av, setAv] = useState<string | null>(avatar)
  const [avCor, setAvCor] = useState<string | null>(avatarCor)
  const [capa, setCapa] = useState<string | null>(perfilCapa)
  const [lista, setLista] = useState<PerfilAdesivo[]>(adesivos)
  const [sel, setSel] = useState<number | null>(null)
  const [salvando, setSalvando] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ idx: number } | null>(null)

  const patch = (idx: number, p: Partial<PerfilAdesivo>) => setLista((l) => l.map((a, i) => (i === idx ? { ...a, ...p } : a)))
  // tamanho = % da ALTURA do banner (consistente entre a prévia e o banner real, que tem larguras bem diferentes).
  const addAdesivo = (c: Colecionado) => { setLista((l) => { setSel(l.length); return [...l, { carimboId: c.carimboId, url: c.url, x: 62, y: 40, tamanho: 34, rotacao: 0 }] }) }

  // Arrastar adesivo sobre a PRÉVIA (posição/tamanho em % do card).
  useEffect(() => {
    const mv = (e: PointerEvent) => {
      if (!dragRef.current) return
      const b = boxRef.current?.getBoundingClientRect(); if (!b) return
      e.preventDefault()
      patch(dragRef.current.idx, {
        x: Math.round(Math.max(0, Math.min(100, ((e.clientX - b.left) / b.width) * 100))),
        y: Math.round(Math.max(0, Math.min(100, ((e.clientY - b.top) / b.height) * 100))),
      })
    }
    const up = () => { dragRef.current = null }
    window.addEventListener('pointermove', mv, { passive: false })
    window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function salvar() {
    setSalvando(true)
    try {
      const r = await fetch('/api/aluno/perfil/personalizar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar: av, perfilCapa: capa, avatarCor: avCor, perfilAdesivos: lista }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Erro ao salvar')
      toast.success('Perfil atualizado!')
      onSalvou()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erro ao salvar') }
    finally { setSalvando(false) }
  }

  const ehAnimado = capa == null || capa === 'anim'
  const bannerStyle = ehAnimado
    ? { background: 'linear-gradient(120deg,#24166A,#4B30BE 55%,#6449E0)' }
    : ehCor(capa) ? { background: capa } : undefined

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={onFechar}>
      <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b px-5 py-3.5">
          <div>
            <h2 className="text-base font-bold">Editar perfil</h2>
            <p className="text-xs text-muted-foreground">Veja as mudanças na hora. Nada é salvo até você confirmar.</p>
          </div>
          <button type="button" onClick={onFechar} className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        <div className="overflow-y-auto">
          {/* ── PRÉVIA AO VIVO ── */}
          <div className="px-4 pt-4">
            <div ref={boxRef} className="relative h-40 overflow-hidden rounded-2xl border" style={bannerStyle}>
              {capa && !ehCor(capa) && capa !== 'anim' && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={capa} alt="" className="absolute inset-0 h-full w-full object-cover" />
              )}
              {ehAnimado && (
                <span aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px)', backgroundSize: '26px 26px' }} />
              )}
              <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
              {/* adesivos na prévia */}
              {lista.map((a, i) => (
                <button key={i} type="button"
                  onPointerDown={(e) => { e.preventDefault(); setSel(i); dragRef.current = { idx: i } }}
                  className={cn('absolute touch-none select-none', sel === i && 'outline-dashed outline-2 outline-white/70')}
                  style={{ left: `${a.x}%`, top: `${a.y}%`, height: `${a.tamanho}%`, width: 'auto', transform: `translate(-50%,-50%) rotate(${a.rotacao || 0}deg)` }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.url} alt="" draggable={false} className="pointer-events-none h-full w-auto object-contain drop-shadow" />
                </button>
              ))}
              {tab === 'adesivos' && (
                <span className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-[11px] font-semibold text-white">✥ Arraste os adesivos · use os botões pra o tamanho</span>
              )}
              {/* avatar + nome */}
              <div className="absolute bottom-3 left-4 flex items-end gap-3">
                <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-4 border-card shadow" style={{ background: avCor || 'linear-gradient(160deg,#F7C25A,#E8952A)' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {av ? <img src={av} alt="" className="h-full w-full object-contain object-[center_82%]" /> : <span className="text-xl font-extrabold text-white">{iniciais}</span>}
                </span>
                <span className="pb-1">
                  <b className="block text-sm font-extrabold leading-tight text-white drop-shadow">{nome}</b>
                  <span className="text-[11px] font-semibold text-white/85 drop-shadow">Nv {nivel} · {tituloNivel}</span>
                </span>
              </div>
            </div>
            {sel != null && lista[sel] && (
              <div className="mt-2 flex items-center justify-center gap-1.5">
                <MiniBtn onClick={() => patch(sel, { tamanho: Math.max(12, (lista[sel].tamanho || 34) - 4) })}><Minus className="h-3.5 w-3.5" /></MiniBtn>
                <span className="w-16 text-center text-[11px] font-semibold text-muted-foreground">tamanho</span>
                <MiniBtn onClick={() => patch(sel, { tamanho: Math.min(80, (lista[sel].tamanho || 34) + 4) })}><Plus className="h-3.5 w-3.5" /></MiniBtn>
                <MiniBtn onClick={() => { setLista((l) => l.filter((_, i) => i !== sel)); setSel(null) }} destrutivo><Trash2 className="h-3.5 w-3.5" /></MiniBtn>
              </div>
            )}
          </div>

          {/* ── TABS ── */}
          <div className="sticky top-0 z-[1] mt-3 flex gap-2 bg-card px-4 pb-2">
            <TabBtn ativo={tab === 'foto'} onClick={() => setTab('foto')} icon={<Camera className="h-3.5 w-3.5" />}>Foto</TabBtn>
            <TabBtn ativo={tab === 'banner'} onClick={() => setTab('banner')} icon={<ImageIcon className="h-3.5 w-3.5" />}>Banner</TabBtn>
            <TabBtn ativo={tab === 'adesivos'} onClick={() => setTab('adesivos')} icon={<Sticker className="h-3.5 w-3.5" />}>Adesivos</TabBtn>
          </div>

          <div className="px-4 pb-4">
            {tab === 'foto' && (
              <>
                <SubTitulo>Escolha sua foto de perfil</SubTitulo>
                <div className="flex flex-wrap gap-2.5">
                  <Redonda ativo={av === null} onClick={() => setAv(null)} cor={avCor}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={avatarPadraoDe(nome)} alt="Padrão" title="Padrão" className="h-full w-full object-contain" />
                  </Redonda>
                  {avatares.map((u) => (
                    <Redonda key={u} ativo={av === u} onClick={() => setAv(u)} cor={avCor}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u} alt="" className="h-full w-full object-contain object-[center_82%]" />
                    </Redonda>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">As fotos são da própria plataforma. Novos avatares chegam com as conquistas.</p>
                <SubTitulo className="mt-4">Cor de fundo da foto</SubTitulo>
                <div className="flex flex-wrap gap-2.5">
                  <SwatchNenhum ativo={avCor === null} onClick={() => setAvCor(null)} />
                  {cores.map((c) => <Swatch key={c} cor={c} ativo={avCor === c} onClick={() => setAvCor(c)} />)}
                </div>
              </>
            )}

            {tab === 'banner' && (
              <>
                <SubTitulo>Fundo animado</SubTitulo>
                <button type="button" onClick={() => setCapa('anim')}
                  className={cn('relative h-16 w-full overflow-hidden rounded-xl border transition-colors', ehAnimado ? 'border-primary ring-2 ring-primary/30' : 'hover:border-primary/50')}
                  style={{ background: 'linear-gradient(120deg,#24166A,#4B30BE 55%,#6449E0)' }}>
                  <span aria-hidden className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.08) 1px,transparent 1px)', backgroundSize: '18px 18px' }} />
                  <span className="absolute left-3 top-2 text-[11px] font-bold tracking-wider text-[#F1C232]">RUMO À PROCURADORIA · ANIMADO</span>
                  {ehAnimado && <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="h-3 w-3" /></span>}
                </button>
                <SubTitulo className="mt-4">Cor do banner</SubTitulo>
                <div className="flex flex-wrap gap-2.5">
                  {cores.map((c) => <Swatch key={c} cor={c} ativo={capa === c} onClick={() => setCapa(c)} />)}
                </div>
                {fundos.length > 0 && (
                  <>
                    <SubTitulo className="mt-4">Imagens de fundo</SubTitulo>
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                      {fundos.map((u) => (
                        <button key={u} type="button" onClick={() => setCapa(u)}
                          className={cn('relative aspect-[16/9] overflow-hidden rounded-xl border transition-colors', capa === u ? 'border-primary ring-2 ring-primary/30' : 'hover:border-primary/50')}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={u} alt="" className="h-full w-full object-cover" />
                          {capa === u && <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="h-3 w-3" /></span>}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}

            {tab === 'adesivos' && (
              <>
                <SubTitulo>Seus adesivos · {colecionados.length} liberados</SubTitulo>
                {colecionados.length === 0 ? (
                  <p className="rounded-xl border border-dashed bg-muted/30 px-3 py-6 text-center text-xs text-muted-foreground">Você ainda não liberou adesivos. Eles chegam com as conquistas.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
                      {colecionados.map((c) => (
                        <button key={c.carimboId} type="button" onClick={() => addAdesivo(c)} title={`Adicionar ${c.titulo}`}
                          className="flex flex-col items-center gap-1 rounded-xl border bg-card p-2 transition-colors hover:bg-muted">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={c.url} alt="" className="h-9 w-9 object-contain" />
                          <span className="line-clamp-1 w-full text-center text-[9px] font-medium text-muted-foreground">{c.titulo}</span>
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">Toque num adesivo para colocá-lo na prévia acima. Arraste pra posicionar e use − / + pro tamanho.</p>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <button type="button" onClick={onFechar} className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted">Cancelar</button>
          <button type="button" onClick={salvar} disabled={salvando}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar alterações
          </button>
        </div>
      </div>
    </div>
  )
}

function TabBtn({ ativo, onClick, icon, children }: { ativo: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={cn('inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors', ativo ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70')}>
      {icon} {children}
    </button>
  )
}
function SubTitulo({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('mb-2 text-xs font-semibold text-foreground', className)}>{children}</div>
}
function Swatch({ cor, ativo, onClick }: { cor: string; ativo: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} title={cor} style={{ background: cor }}
    className={cn('h-9 w-9 shrink-0 rounded-full border transition-transform', ativo ? 'ring-2 ring-primary ring-offset-2 ring-offset-card' : 'hover:scale-110')} />
}
function SwatchNenhum({ ativo, onClick }: { ativo: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} title="Padrão"
    className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-card text-[10px] font-semibold text-muted-foreground transition-colors', ativo ? 'ring-2 ring-primary ring-offset-2 ring-offset-card' : 'hover:border-primary/50')}>Pad</button>
}
function Redonda({ ativo, onClick, cor, children }: { ativo: boolean; onClick: () => void; cor: string | null; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} style={{ background: cor || undefined }}
      className={cn('h-14 w-14 shrink-0 overflow-hidden rounded-full border-2 bg-muted transition-all', ativo ? 'border-primary ring-2 ring-primary/30' : 'border-transparent hover:border-primary/40')}>
      {children}
    </button>
  )
}
function MiniBtn({ onClick, destrutivo, children }: { onClick: () => void; destrutivo?: boolean; children: React.ReactNode }) {
  return <button type="button" onClick={onClick}
    className={cn('flex h-7 w-7 items-center justify-center rounded-lg border transition-colors', destrutivo ? 'text-destructive hover:bg-destructive/10' : 'text-muted-foreground hover:bg-muted')}>{children}</button>
}
