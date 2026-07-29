'use client'

import { useEffect, useState, useTransition } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Loader2, Copy, Database, Users, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { confirmar } from '@/components/ui/confirm-dialog'
import { listarPlataformas, listarBancosPlataforma, compartilharBancos, compartilharEstudantes } from '@/app/admin/compartilhar/actions'

type Plat = { id: string; nome: string; slug: string }
type Banco = { id: string; nome: string; questoes: number }

export function CompartilharClient() {
  const [plats, setPlats] = useState<Plat[]>([])
  const [origem, setOrigem] = useState('')
  const [destino, setDestino] = useState('')
  const [bancos, setBancos] = useState<Banco[]>([])
  const [estudantes, setEstudantes] = useState<number>(0)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [carregando, setCarregando] = useState(false)
  const [pending, start] = useTransition()

  useEffect(() => { listarPlataformas().then((r) => setPlats(r.plataformas ?? [])) }, [])

  useEffect(() => {
    if (!origem) { setBancos([]); setEstudantes(0); setSel(new Set()); return }
    setCarregando(true); setSel(new Set())
    listarBancosPlataforma(origem)
      .then((r) => { setBancos(r.bancos ?? []); setEstudantes(r.estudantes ?? 0) })
      .catch(() => { setBancos([]); setEstudantes(0) })
      .finally(() => setCarregando(false))
  }, [origem])

  const podeCopiar = origem && destino && origem !== destino
  const nomeDe = (id: string) => plats.find((p) => p.id === id)?.nome ?? '—'

  function toggle(id: string) {
    setSel((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function copiarBancos() {
    if (!podeCopiar || sel.size === 0) return
    const ok = await confirmar({ titulo: 'Copiar bancos', mensagem: `Copiar ${sel.size} banco(s) de "${nomeDe(origem)}" para "${nomeDe(destino)}"? As questões vão junto (cópia independente).`, confirmar: 'Copiar' })
    if (!ok) return
    start(async () => {
      const r = await compartilharBancos(origem, destino, [...sel])
      if (r.ok) { toast.success(`Copiado: ${r.bancos} banco(s), ${r.questoes} questão(ões).`); setSel(new Set()) }
      else toast.error(r.error ?? 'Erro ao copiar.')
    })
  }

  async function copiarEstudantes() {
    if (!podeCopiar) return
    const ok = await confirmar({ titulo: 'Copiar estudantes', mensagem: `Copiar TODOS os ${estudantes} estudante(s) de "${nomeDe(origem)}" para "${nomeDe(destino)}"? Dedup por e-mail (não duplica quem já existe).`, confirmar: 'Copiar todos' })
    if (!ok) return
    start(async () => {
      const r = await compartilharEstudantes(origem, destino)
      if (r.ok) toast.success(`Copiados: ${r.copiados} estudante(s).`)
      else toast.error(r.error ?? 'Erro ao copiar.')
    })
  }

  return (
    <div className="space-y-5">
      {/* Origem → Destino */}
      <Card><CardContent className="grid gap-4 p-4 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
        <div className="space-y-1">
          <Label>Plataforma de origem</Label>
          <select value={origem} onChange={(e) => setOrigem(e.target.value)} className="h-9 w-full rounded-lg border bg-background px-2 text-sm">
            <option value="">Selecione…</option>
            {plats.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </div>
        <div className="hidden pb-2 text-muted-foreground sm:block"><ArrowRight className="h-5 w-5" /></div>
        <div className="space-y-1">
          <Label>Plataforma de destino</Label>
          <select value={destino} onChange={(e) => setDestino(e.target.value)} className="h-9 w-full rounded-lg border bg-background px-2 text-sm">
            <option value="">Selecione…</option>
            {plats.filter((p) => p.id !== origem).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </div>
      </CardContent></Card>

      {origem && destino && origem === destino && (
        <p className="rounded-lg border border-amber-300/40 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">Origem e destino devem ser plataformas diferentes.</p>
      )}

      {podeCopiar && (
        <>
          {/* Bancos */}
          <Card><CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold"><Database className="h-4 w-4" /> Bancos (com questões)</div>
            {carregando ? (
              <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
            ) : bancos.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">Nenhum banco nesta plataforma.</p>
            ) : (
              <>
                <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border p-1">
                  {bancos.map((b) => (
                    <label key={b.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50">
                      <input type="checkbox" checked={sel.has(b.id)} onChange={() => toggle(b.id)} className="h-4 w-4" />
                      <span className="min-w-0 flex-1 truncate">{b.nome}</span>
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{b.questoes} questões</span>
                    </label>
                  ))}
                </div>
                <Button onClick={copiarBancos} disabled={pending || sel.size === 0}>
                  {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Copy className="mr-2 h-4 w-4" />}
                  Copiar {sel.size > 0 ? `${sel.size} banco(s)` : 'bancos'} para {nomeDe(destino)}
                </Button>
              </>
            )}
          </CardContent></Card>

          {/* Estudantes */}
          <Card><CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4" /> Estudantes</div>
            <p className="text-sm text-muted-foreground">{estudantes} estudante(s) em {nomeDe(origem)}. A cópia deduplica por e-mail (não recria quem já existe no destino).</p>
            <Button variant="outline" onClick={copiarEstudantes} disabled={pending || estudantes === 0}>
              {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Copy className="mr-2 h-4 w-4" />}
              Copiar todos os estudantes para {nomeDe(destino)}
            </Button>
          </CardContent></Card>
        </>
      )}
    </div>
  )
}
