'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { BarChart3, Pencil, Clock, Layers } from 'lucide-react'
import { confirmar } from '@/components/ui/confirm-dialog'
import { MaterialPdfCard } from '@/components/admin/banco-caderno-client'
import { removerMaterialPdf } from '@/app/admin/banco-questoes/estudantes-actions'
import type { CadernoTesteResumo } from '@/app/admin/cadernos-teste/actions'

/** Lista os cadernos de teste do banco; cada um com "Abrir editor" + os 2 PDFs (Gabarito/Enunciado). */
export function BancoCadernoTesteClient({ bancoId, cor, cadernos }: { bancoId: string; cor: string; cadernos: CadernoTesteResumo[] }) {
  return (
    <div className="space-y-4">
      {cadernos.map((c) => <CadernoTesteItem key={c.id} bancoId={bancoId} cor={cor} caderno={c} />)}
    </div>
  )
}

function CadernoTesteItem({ bancoId, cor, caderno }: { bancoId: string; cor: string; caderno: CadernoTesteResumo }) {
  const router = useRouter()
  const fmt = (d: string | null) => { if (!d) return ''; try { return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) } catch { return '' } }
  const [matUrl, setMatUrl] = useState(caderno.material.pdfUrl)
  const [matNome, setMatNome] = useState(caderno.material.pdfNome)
  const [matBusy, setMatBusy] = useState(false)
  const [enUrl, setEnUrl] = useState(caderno.materialEnunciado.pdfUrl)
  const [enNome, setEnNome] = useState(caderno.materialEnunciado.pdfNome)
  const [enBusy, setEnBusy] = useState(false)
  const fileMat = useRef<HTMLInputElement>(null)
  const fileEn = useRef<HTMLInputElement>(null)

  async function enviar(file: File, slot: 'material' | 'enunciado') {
    if (slot === 'enunciado' ? enBusy : matBusy) return
    if (file.type && file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) { toast.error('Envie um arquivo PDF.'); return }
    if (file.size > 8 * 1024 * 1024) { toast.error('PDF muito grande (máx. ~8 MB).'); return }
    const setBusy = slot === 'enunciado' ? setEnBusy : setMatBusy
    const rotulo = slot === 'enunciado' ? 'Enunciado de Questões' : 'Gabarito Comentado'
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file); fd.append('cadernoId', caderno.id); fd.append('bancoId', bancoId ?? ''); fd.append('slot', slot); fd.append('tabela', 'simulado_cadernos_teste')
      const resp = await fetch('/api/admin/material-pdf', { method: 'POST', body: fd })
      const r = await resp.json().catch(() => ({ ok: false, error: 'Resposta inválida do servidor.' }))
      if (!resp.ok || !r.ok) { toast.error(r.error ?? 'Falha ao enviar o PDF.'); return }
      if (slot === 'enunciado') { setEnUrl(r.url ?? ''); setEnNome(r.nome ?? file.name.replace(/\.pdf$/i, '')) }
      else { setMatUrl(r.url ?? ''); setMatNome(r.nome ?? file.name.replace(/\.pdf$/i, '')) }
      toast.success(`${rotulo} (PDF) enviado`)
      router.refresh()
    } catch { toast.error('Falha ao enviar o PDF (conexão instável). Tente de novo.') }
    finally { setBusy(false) }
  }

  async function remover(slot: 'material' | 'enunciado') {
    if (slot === 'enunciado' ? enBusy : matBusy) return
    const rotulo = slot === 'enunciado' ? 'Enunciado de Questões' : 'Gabarito Comentado'
    if (!(await confirmar({ mensagem: `Remover o ${rotulo} (PDF importado)?\n\nO aluno deixa de ver esse PDF.`, destrutivo: true }))) return
    const setBusy = slot === 'enunciado' ? setEnBusy : setMatBusy
    setBusy(true)
    const r = await removerMaterialPdf(caderno.id, bancoId, slot, 'simulado_cadernos_teste')
    setBusy(false)
    if (!r.ok) { toast.error(r.error ?? 'Erro'); return }
    if (slot === 'enunciado') { setEnUrl(''); setEnNome('') } else { setMatUrl(''); setMatNome('') }
    toast.success(`${rotulo} removido`)
    router.refresh()
  }

  return (
    <div className="rounded-xl border bg-background p-3 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white shadow-sm" style={{ background: cor }}><BarChart3 className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight" title={caderno.nome}>{caderno.nome}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Layers className="h-3 w-3" /> {caderno.grupos} grupo(s)</span>
            {caderno.atualizadoEm && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {fmt(caderno.atualizadoEm)}</span>}
          </div>
        </div>
        <Link href={`/admin/cadernos-teste/${caderno.id}`} className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:border-primary/50 hover:bg-primary/5">
          <Pencil className="h-3.5 w-3.5" /> Abrir editor
        </Link>
      </div>

      <input ref={fileMat} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) enviar(f, 'material'); e.currentTarget.value = '' }} />
      <input ref={fileEn} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) enviar(f, 'enunciado'); e.currentTarget.value = '' }} />
      <div className="grid gap-3 sm:grid-cols-2">
        <MaterialPdfCard cor={cor} titulo="Gabarito Comentado" hint="Ex.: caderno pronto da EBT · máx. ~8 MB"
          pdfUrl={matUrl} pdfNome={matNome} busy={matBusy} onUpload={() => fileMat.current?.click()} onRemover={() => remover('material')} />
        <MaterialPdfCard cor={cor} titulo="Enunciado de Questões" hint="Só as questões (sem gabarito) — o aluno baixa antes de iniciar · máx. ~8 MB"
          pdfUrl={enUrl} pdfNome={enNome} busy={enBusy} onUpload={() => fileEn.current?.click()} onRemover={() => remover('enunciado')} />
      </div>
    </div>
  )
}
