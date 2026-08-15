'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Pencil, X, Check, Loader2, ImageOff, Baseline, CircleOff, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

function iniciais(nome: string) {
  return nome.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]).join('').toUpperCase() || 'A'
}
const ehCor = (v: string | null): boolean => !!v && v.startsWith('#')

/**
 * Botão + modal de edição do perfil. Cada opção (avatar, cor atrás da foto, fundo do card, cor do
 * texto) fica COLAPSADA mostrando só a seleção atual; ao clicar, expande as opções (accordion).
 */
export function PerfilEditar({ nome, avatar, perfilCapa, perfilTexto = null, avatarCor = null, avatares, fundos, cores = [] }: {
  nome: string; avatar: string | null; perfilCapa: string | null; perfilTexto?: string | null; avatarCor?: string | null; avatares: string[]; fundos: string[]; cores?: string[]
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [exp, setExp] = useState<string | null>(null) // qual seletor está expandido
  const [av, setAv] = useState<string | null>(avatar)
  const [avCor, setAvCor] = useState<string | null>(avatarCor)
  const [capa, setCapa] = useState<string | null>(perfilCapa)
  const [txt, setTxt] = useState<string | null>(perfilTexto)
  const [salvando, setSalvando] = useState(false)

  const toggle = (k: string) => setExp((v) => (v === k ? null : k))
  const coresTexto = ['#ffffff', '#0f172a', ...cores]

  async function salvar() {
    setSalvando(true)
    try {
      const r = await fetch('/api/aluno/perfil/personalizar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar: av, perfilCapa: capa, perfilTexto: txt, avatarCor: avCor }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Erro ao salvar')
      toast.success('Perfil atualizado!')
      setAberto(false)
      router.refresh()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erro ao salvar') }
    finally { setSalvando(false) }
  }

  const previewAvatar = (
    <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border bg-white text-[10px] font-bold text-primary">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {av ? <img src={av} alt="" className="h-full w-full object-contain object-[center_82%]" /> : iniciais(nome)}
    </span>
  )
  const previewFundo = capa == null
    ? <ResumoVazio>Nenhum</ResumoVazio>
    : ehCor(capa)
      ? <span className="h-7 w-7 rounded-md border" style={{ background: capa }} />
      // eslint-disable-next-line @next/next/no-img-element
      : <span className="h-7 w-11 overflow-hidden rounded-md border"><img src={capa} alt="" className="h-full w-full object-cover" /></span>

  return (
    <>
      <button type="button" onClick={() => setAberto(true)} title="Editar perfil"
        className="inline-flex items-center gap-1.5 rounded-lg border bg-card/80 px-2.5 py-1.5 text-xs font-medium shadow-sm backdrop-blur transition-colors hover:bg-muted">
        <Pencil className="h-3.5 w-3.5" /> Editar perfil
      </button>

      {aberto && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => setAberto(false)}>
          <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-5 py-3.5">
              <h2 className="text-base font-bold">Editar perfil</h2>
              <button type="button" onClick={() => setAberto(false)} className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>

            <div className="space-y-2.5 overflow-y-auto p-4">
              {/* Foto de perfil */}
              <Seletor k="foto" label="Foto de perfil" preview={previewAvatar} aberto={exp === 'foto'} onToggle={toggle}>
                <div className="flex flex-wrap gap-2">
                  <Redonda ativo={av === null} onClick={() => setAv(null)}>
                    <span className="flex h-full w-full items-center justify-center bg-white text-sm font-bold text-primary">{iniciais(nome)}</span>
                  </Redonda>
                  {avatares.map((u) => (
                    <Redonda key={u} ativo={av === u} onClick={() => setAv(u)}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u} alt="" className="h-full w-full object-contain object-[center_82%]" />
                    </Redonda>
                  ))}
                </div>
              </Seletor>

              {/* Cor atrás da foto */}
              <Seletor k="avcor" label="Cor atrás da foto" preview={<ResumoCor cor={avCor} />} aberto={exp === 'avcor'} onToggle={toggle}>
                <LinhaCores>
                  <SwatchNenhum ativo={avCor === null} onClick={() => setAvCor(null)}><CircleOff className="h-4 w-4" /></SwatchNenhum>
                  {cores.map((c) => <Swatch key={c} cor={c} ativo={avCor === c} onClick={() => setAvCor(c)} />)}
                </LinhaCores>
              </Seletor>

              {/* Fundo do card: cor + imagem */}
              <Seletor k="fundo" label="Fundo do card" preview={previewFundo} aberto={exp === 'fundo'} onToggle={toggle}>
                <SubLabel>Cor</SubLabel>
                <LinhaCores>
                  <SwatchNenhum ativo={capa === null} onClick={() => setCapa(null)}><ImageOff className="h-4 w-4" /></SwatchNenhum>
                  {cores.map((c) => <Swatch key={c} cor={c} ativo={capa === c} onClick={() => setCapa(c)} />)}
                </LinhaCores>
                {fundos.length > 0 && (
                  <>
                    <SubLabel className="mt-3">Imagem</SubLabel>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {fundos.map((u) => (
                        <button key={u} type="button" onClick={() => setCapa(u)}
                          className={cn('relative aspect-[16/9] overflow-hidden rounded-lg border transition-colors', capa === u ? 'border-primary ring-2 ring-primary/30' : 'hover:border-primary/50')}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={u} alt="" className="h-full w-full object-cover" />
                          {capa === u && <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="h-3 w-3" /></span>}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </Seletor>

              {/* Cor do texto */}
              <Seletor k="texto" label="Cor do texto" hint="nome, XP e nível" preview={<ResumoCor cor={txt} />} aberto={exp === 'texto'} onToggle={toggle}>
                <LinhaCores>
                  <SwatchNenhum ativo={txt === null} onClick={() => setTxt(null)}><Baseline className="h-4 w-4" /></SwatchNenhum>
                  {coresTexto.map((c) => <Swatch key={c} cor={c} ativo={txt === c} onClick={() => setTxt(c)} />)}
                </LinhaCores>
              </Seletor>
            </div>

            <div className="flex justify-end gap-2 border-t px-5 py-3">
              <button type="button" onClick={() => setAberto(false)} className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted">Cancelar</button>
              <button type="button" onClick={salvar} disabled={salvando}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

/** Linha colapsável: mostra o rótulo + a seleção atual; expande as opções ao clicar. */
function Seletor({ k, label, hint, preview, aberto, onToggle, children }: {
  k: string; label: string; hint?: string; preview: React.ReactNode; aberto: boolean; onToggle: (k: string) => void; children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border bg-card">
      <button type="button" onClick={() => onToggle(k)} className="flex w-full items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 transition-colors hover:bg-muted/40">
        <span className="text-sm font-medium">{label}{hint && <span className="ml-1 text-xs font-normal text-muted-foreground">· {hint}</span>}</span>
        <span className="flex items-center gap-2">{preview}<ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', aberto && 'rotate-180')} /></span>
      </button>
      {aberto && <div className="border-t px-3 py-2.5">{children}</div>}
    </div>
  )
}

function ResumoCor({ cor }: { cor: string | null }) {
  if (!cor) return <ResumoVazio>Padrão</ResumoVazio>
  return <span className="h-7 w-7 rounded-md border" style={{ background: cor }} />
}
function ResumoVazio({ children }: { children: React.ReactNode }) {
  return <span className="rounded-md border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground">{children}</span>
}

function SubLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('mb-1.5 text-xs font-medium text-muted-foreground', className)}>{children}</div>
}
function LinhaCores({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-2.5 overflow-x-auto px-1 py-2">{children}</div>
}
function Swatch({ cor, ativo, onClick }: { cor: string; ativo: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} title={cor} style={{ background: cor }}
      className={cn('h-10 w-10 shrink-0 rounded-lg border transition-transform', ativo ? 'ring-2 ring-primary ring-offset-2 ring-offset-card' : 'hover:scale-110')} />
  )
}
function SwatchNenhum({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} title="Padrão"
      className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-card text-muted-foreground transition-colors', ativo ? 'ring-2 ring-primary ring-offset-2 ring-offset-card' : 'hover:border-primary/50')}>
      {children}
    </button>
  )
}
function Redonda({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={cn('h-14 w-14 shrink-0 overflow-hidden rounded-full border-2 bg-muted transition-all', ativo ? 'border-primary ring-2 ring-primary/30' : 'border-transparent hover:border-primary/40')}>
      {children}
    </button>
  )
}
