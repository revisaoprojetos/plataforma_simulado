'use client'

// Modal "Salvar no caderno": o aluno escolhe um caderno existente OU cria um novo. Ao confirmar, o comentário
// (com a citação do trecho) é gravado em UMA chamada (POST /api/aluno/cadernos/item) — no modo "novo caderno" o
// servidor cria o caderno e já vincula o item (atômico; sem caderno vazio sobrando).
// Aberto pelos hosts do leitor ao receber 'leitor-jus-salvar-caderno' do iframe.
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { BookMarked, Check, Loader2, NotebookPen, Plus } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export type ComentarioParaCaderno = {
  comentario: string
  trecho: string
  prefix?: string
  suffix?: string
  inicio?: number | null
  fim?: number | null
  cor?: string | null
  /** id do grifo no servidor (dedupe por caderno). */
  grifo_ref?: string | null
  documento_id?: string | null
  documento_versao?: number | null
  titulo_documento?: string | null
}

/** Valida/normaliza o payload vindo do iframe (origem já checada pelo host via e.source). Devolve null se inválido. */
export function normalizarComentarioCaderno(
  g: unknown,
  doc: { documento_id?: string | null; documento_versao?: number | null; titulo_documento?: string | null },
): ComentarioParaCaderno | null {
  if (!g || typeof g !== 'object') return null
  const o = g as Record<string, unknown>
  const s = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.trunc(v) : null)
  const comentario = s(o.comentario, 5000)
  if (!comentario) return null
  return {
    comentario,
    trecho: s(o.trecho, 2000),
    prefix: s(o.prefix, 300),
    suffix: s(o.suffix, 300),
    inicio: n(o.inicio),
    fim: n(o.fim),
    cor: s(o.cor, 20) || null,
    grifo_ref: s(o.grifo_ref, 80) || null,
    documento_id: doc.documento_id ?? null,
    documento_versao: doc.documento_versao ?? null,
    titulo_documento: doc.titulo_documento ?? null,
  }
}

type Caderno = { id: string; nome: string; total: number }

export function SalvarComentarioCaderno({ dados, onClose }: { dados: ComentarioParaCaderno | null; onClose: () => void }) {
  const [cadernos, setCadernos] = useState<Caderno[] | null>(null)
  const [sel, setSel] = useState<string>('') // id do caderno ou 'novo'
  const [nome, setNome] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!dados) return
    let vivo = true
    setCadernos(null); setNome(''); setSel('')
    fetch('/api/aluno/cadernos', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : { cadernos: [] }))
      .then((j) => { if (!vivo) return; const l: Caderno[] = j.cadernos ?? []; setCadernos(l); setSel(l.length ? '' : 'novo') })
      .catch(() => { if (vivo) { setCadernos([]); setSel('novo') } })
    return () => { vivo = false }
  }, [dados])

  const criando = sel === 'novo'
  const podeSalvar = !busy && !!dados && (criando ? nome.trim().length > 0 : !!sel)

  async function salvar() {
    if (!dados || !podeSalvar) return
    setBusy(true)
    try {
      const res = await fetch('/api/aluno/cadernos/item', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ ...(criando ? { novo_caderno: { nome: nome.trim() } } : { caderno_id: sel }), ...dados }),
      })
      const j = await res.json().catch(() => null)
      if (res.ok && j?.ok) {
        toast.success(`Salvo em ${j.caderno?.nome ?? 'caderno'}`)
        onClose()
      } else {
        toast.error(j?.message || 'Não consegui salvar no caderno agora.')
      }
    } catch {
      toast.error('Não consegui salvar no caderno agora. Verifique a conexão.')
    } finally { setBusy(false) }
  }

  return (
    <Dialog open={!!dados} onOpenChange={(o) => { if (!o && !busy) onClose() }}>
      <DialogContent overlayClassName="z-[300]" className="z-[301]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><BookMarked className="h-4 w-4" /> Salvar no caderno</DialogTitle>
          <DialogDescription>Escolha um caderno ou crie um novo para guardar este comentário com o trecho.</DialogDescription>
        </DialogHeader>

        {dados && (
          <div className="space-y-1 rounded-lg border bg-muted/40 p-3 text-xs">
            <p className="line-clamp-3 italic text-muted-foreground">“{dados.trecho}”</p>
            <p className="line-clamp-3 text-foreground">{dados.comentario}</p>
          </div>
        )}

        <div className="max-h-56 space-y-1 overflow-auto">
          {cadernos === null ? (
            <div className="flex justify-center py-4 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></div>
          ) : (
            <>
              {cadernos.map((c) => (
                <button key={c.id} type="button" onClick={() => setSel(c.id)} disabled={busy}
                  className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${sel === c.id ? 'border-primary bg-muted' : ''}`}>
                  <NotebookPen className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{c.nome}</span>
                  <span className="text-xs text-muted-foreground">{c.total}</span>
                  {sel === c.id && <Check className="h-4 w-4 text-primary" />}
                </button>
              ))}
              <button type="button" onClick={() => setSel('novo')} disabled={busy}
                className={`flex w-full items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${criando ? 'border-primary bg-muted' : ''}`}>
                <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1">Criar novo caderno</span>
                {criando && <Check className="h-4 w-4 text-primary" />}
              </button>
            </>
          )}
        </div>

        {criando && (
          <Input autoFocus value={nome} maxLength={120} onChange={(e) => setNome(e.target.value)} disabled={busy}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void salvar() } }}
            placeholder="Nome do novo caderno" aria-label="Nome do novo caderno" />
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button onClick={salvar} disabled={!podeSalvar}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {criando ? 'Criar e salvar' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
