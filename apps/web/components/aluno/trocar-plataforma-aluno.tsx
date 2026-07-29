'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Building2, Loader2, X, Check } from 'lucide-react'
import { molduraSelecao } from '@/lib/selecao-moldura'

type Plat = { id: string; nome: string; slug: string; dominio: string | null; logo: string | null; cor: string | null; estilo?: string | null; semFundo?: boolean; atual?: boolean }

/** URL da plataforma destino, na página de identificação do aluno. A sessão do aluno é
 * POR-TENANT (não compartilhada entre subdomínios), então trocar = re-identificar no destino. */
function urlDaPlataforma(p: Plat): string {
  const { protocol, host } = window.location
  if (p.dominio) return `${protocol}//${p.dominio}/aluno/entrar`
  const partes = host.split('.')
  const base = partes.length > 1 ? partes.slice(1).join('.') : host // troca o subdomínio atual pelo slug
  return `${protocol}//${p.slug}.${base}/aluno/entrar`
}

/** Modal "Trocar de plataforma" do aluno. Lista as plataformas onde o e-mail dele é estudante;
 * ao escolher, navega pro subdomínio e o aluno se identifica de novo (sessão por-tenant). */
export function TrocarPlataformaAlunoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [carregando, setCarregando] = useState(false)
  const [plats, setPlats] = useState<Plat[] | null>(null)

  useEffect(() => {
    if (!open || plats) return
    setCarregando(true)
    fetch('/api/aluno/minhas-plataformas')
      .then((r) => r.json())
      .then((d) => setPlats(d.plataformas ?? []))
      .catch(() => setPlats([]))
      .finally(() => setCarregando(false))
  }, [open, plats])

  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  const outras = (plats ?? []).filter((p) => !p.atual)

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Trocar de plataforma</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-muted" aria-label="Fechar"><X className="h-4 w-4" /></button>
        </div>

        {carregando ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
        ) : outras.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Você só tem acesso a esta plataforma.</p>
        ) : (
          <>
            <p className="mb-2 text-xs text-muted-foreground">Ao trocar, você entra na outra plataforma com o mesmo e-mail.</p>
            <div className="space-y-1.5">
              {outras.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { window.location.href = urlDaPlataforma(p) }}
                  className="flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors hover:border-primary/50 hover:bg-muted/50"
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden ${molduraSelecao(p.estilo)} ${p.semFundo ? '' : 'border bg-background'}`} style={!p.semFundo && p.cor ? { borderColor: p.cor } : undefined}>
                    {p.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.logo} alt="" className={p.semFundo ? 'h-full w-full object-contain' : 'h-full w-full object-cover'} />
                    ) : (
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.nome}</span>
                    <span className="block truncate text-xs text-muted-foreground">{p.slug}</span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
