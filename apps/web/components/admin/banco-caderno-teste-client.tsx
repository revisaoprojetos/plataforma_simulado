'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { BarChart3, Pencil, Clock, Layers, ExternalLink, Loader2, FileText, ClipboardList, Trash2 } from 'lucide-react'
import { confirmar } from '@/components/ui/confirm-dialog'
import { MaterialPdfCard } from '@/components/admin/banco-caderno-client'
import { removerMaterialPdf } from '@/app/admin/banco-questoes/estudantes-actions'
import { apagarCadernoTeste, type CadernoTesteResumo, type CadernoTesteGrupo } from '@/app/admin/cadernos-teste/actions'

/** Lista os cadernos de teste do banco; cada um com a prévia dos grupos + "Abrir editor" + os 2 PDFs. */
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
  const [apagando, setApagando] = useState(false)

  async function apagar() {
    const ok = await confirmar({ titulo: 'Apagar caderno de teste', mensagem: `Isto remove "${caderno.nome}" definitivamente. Esta ação não pode ser desfeita.`, confirmar: 'Apagar', destrutivo: true })
    if (!ok) return
    setApagando(true)
    try {
      const r = await apagarCadernoTeste(caderno.id, bancoId)
      if (!r.ok) { toast.error(r.error ?? 'Falha ao apagar.'); return }
      toast.success('Caderno de teste apagado')
      router.refresh()
    } finally { setApagando(false) }
  }

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
            <span className="inline-flex items-center gap-1"><Layers className="h-3 w-3" /> {caderno.itens.length} grupo(s)</span>
            {caderno.atualizadoEm && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {fmt(caderno.atualizadoEm)}</span>}
          </div>
        </div>
        <Link href={`/admin/cadernos-teste/${caderno.id}`} className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:border-primary/50 hover:bg-primary/5">
          <Pencil className="h-3.5 w-3.5" /> Abrir editor
        </Link>
        <button onClick={apagar} disabled={apagando} title="Apagar caderno de teste"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium text-destructive transition-colors hover:border-destructive/50 hover:bg-destructive/10 disabled:opacity-60">
          {apagando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Apagar
        </button>
      </div>

      <input ref={fileMat} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) enviar(f, 'material'); e.currentTarget.value = '' }} />
      <input ref={fileEn} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) enviar(f, 'enunciado'); e.currentTarget.value = '' }} />

      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Material do aluno</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {caderno.itens.map((g) => <PreviaGrupoCard key={g.id} cadernoId={caderno.id} grupo={g} cor={cor} />)}
        <MaterialPdfCard cor={cor} titulo="Gabarito Comentado" hint="Ex.: caderno pronto da EBT · máx. ~8 MB"
          pdfUrl={matUrl} pdfNome={matNome} busy={matBusy} onUpload={() => fileMat.current?.click()} onRemover={() => remover('material')} />
        <MaterialPdfCard cor={cor} titulo="Enunciado de Questões" hint="Só as questões (sem gabarito) — o aluno baixa antes de iniciar · máx. ~8 MB"
          pdfUrl={enUrl} pdfNome={enNome} busy={enBusy} onUpload={() => fileEn.current?.click()} onRemover={() => remover('enunciado')} />
      </div>
    </div>
  )
}

/** Preview (iframe) de um grupo do caderno de teste — renderizado pela rota /imprimir/caderno-teste. */
function PreviaGrupoCard({ cadernoId, grupo, cor }: { cadernoId: string; grupo: CadernoTesteGrupo; cor: string }) {
  const BASE_W = 794, BASE_H = 1123 // uma folha A4 (a prévia é paginada; o card mostra a 1ª folha)
  const boxRef = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(320)
  const [carregado, setCarregado] = useState(false)
  useEffect(() => {
    const el = boxRef.current; if (!el) return
    const upd = () => setW(el.clientWidth || 320)
    upd(); const ro = new ResizeObserver(upd); ro.observe(el); return () => ro.disconnect()
  }, [])
  const s = w / BASE_W
  const boxH = Math.round(w * (BASE_H / BASE_W))
  const Icon = grupo.modalidade === 'diagnostico' ? BarChart3 : grupo.modalidade === 'folha_respostas' ? ClipboardList : FileText
  const src = `/imprimir/caderno-teste/${cadernoId}?grupo=${grupo.id}&embed=1`
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b px-2.5 py-2" style={{ background: `linear-gradient(90deg, ${cor}1f, transparent)` }}>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white shadow-sm" style={{ background: cor }}><Icon className="h-3.5 w-3.5" /></span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold" title={grupo.label}>{grupo.label}</span>
        <a href={src} target="_blank" rel="noreferrer" title="Abrir em tela cheia" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><ExternalLink className="h-4 w-4" /></a>
      </div>
      <div ref={boxRef} className="relative w-full overflow-hidden bg-neutral-200 dark:bg-neutral-800" style={{ height: boxH }}>
        {!carregado && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-neutral-100 text-muted-foreground dark:bg-neutral-900">
            <Loader2 className="h-6 w-6 animate-spin" /><span className="text-xs">Carregando prévia…</span>
          </div>
        )}
        <iframe src={src} title={grupo.label} loading="lazy" onLoad={() => setCarregado(true)}
          style={{ width: BASE_W, height: BASE_H, transform: `scale(${s})`, transformOrigin: 'top left', border: 0, background: '#fff' }} />
      </div>
    </div>
  )
}
