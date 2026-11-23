'use client'

// Painel lateral (Sheet) para ver/editar/criar um problema. Usado pela Lista e pelo Mapa mental.
// Mutações por ROTAS DE API (server actions são rejeitadas em domínio custom).
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { confirmar } from '@/components/ui/confirm-dialog'
import {
  AREAS, STATUS, PRIORIDADES, ROTULO_AREA, ROTULO_STATUS, ROTULO_PRIORIDADE,
  type Problema, type Area, type HistoricoItem,
} from '@/lib/auditoria-problemas/tipos'
import { CAMPO, StatusChip, dataBr } from './comuns'

export type PermsProblemas = { criar: boolean; editar: boolean; excluir: boolean }

type Form = {
  area: string; assunto: string; razao: string; acao: string; status: string; prioridade: string
  prazo: string; prazo_texto: string; versao: string; relator: string; responsavel: string
}

const vazio = (area?: Area): Form => ({ area: area ?? 'cronograma', assunto: '', razao: '', acao: '', status: 'aberto', prioridade: 'media', prazo: '', prazo_texto: '', versao: '', relator: '', responsavel: '' })
const doProblema = (p: Problema): Form => ({
  area: p.area, assunto: p.assunto, razao: p.razao ?? '', acao: p.acao ?? '', status: p.status, prioridade: p.prioridade,
  prazo: p.prazo ?? '', prazo_texto: p.prazo_texto ?? '', versao: p.versao ?? '', relator: p.relator ?? '', responsavel: p.responsavel ?? '',
})

const ROTULO_ACAO: Record<string, string> = { criado: 'Criado', editado: 'Editado', status: 'Status alterado', excluido: 'Excluído', restaurado: 'Restaurado', importado: 'Importado' }

/** `problema` = registro aberto; `novo` = formulário em branco (com `areaInicial` opcional). */
export function ProblemaPainel({ aberto, problema, novo, areaInicial, perms, onFechar }: {
  aberto: boolean; problema: Problema | null; novo?: boolean; areaInicial?: Area; perms: PermsProblemas; onFechar: () => void
}) {
  const router = useRouter()
  const [f, setF] = useState<Form>(vazio(areaInicial))
  const [salvando, setSalvando] = useState(false)
  const [hist, setHist] = useState<HistoricoItem[] | null>(null)
  const podeEditar = novo ? perms.criar : perms.editar

  useEffect(() => {
    if (!aberto) return
    setF(problema ? doProblema(problema) : vazio(areaInicial))
    setHist(null)
    if (!problema) return
    let vivo = true
    fetch(`/api/admin/auditoria-problemas/${problema.id}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { linhas: [] }))
      .then((j) => { if (vivo) setHist(j.linhas ?? []) })
      .catch(() => { if (vivo) setHist([]) })
    return () => { vivo = false }
  }, [aberto, problema, areaInicial])

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }))

  async function salvar() {
    if (f.assunto.trim().length < 3) { toast.error('Informe o assunto.'); return }
    setSalvando(true)
    try {
      const corpo = { ...f, prazo: f.prazo || null }
      const r = await fetch(novo ? '/api/admin/auditoria-problemas' : `/api/admin/auditoria-problemas/${problema!.id}`, {
        method: novo ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { toast.error(j.message ?? 'Não foi possível salvar.'); return }
      toast.success(novo ? 'Problema criado.' : 'Alterações salvas.')
      onFechar()
      router.refresh()
    } finally { setSalvando(false) }
  }

  async function excluir() {
    if (!problema || !(await confirmar({ titulo: 'Excluir problema', mensagem: `Excluir "${problema.assunto}"? O histórico fica guardado.`, confirmar: 'Excluir', destrutivo: true }))) return
    setSalvando(true)
    try {
      const r = await fetch(`/api/admin/auditoria-problemas/${problema.id}`, { method: 'DELETE' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { toast.error(j.message ?? 'Não foi possível excluir.'); return }
      toast.success('Problema excluído.')
      onFechar()
      router.refresh()
    } finally { setSalvando(false) }
  }

  const rot = 'text-xs font-medium text-muted-foreground'
  return (
    <Sheet open={aberto} onOpenChange={(o) => { if (!o) onFechar() }}>
      <SheetContent className="w-full overflow-y-auto data-[side=right]:sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{novo ? 'Novo problema' : 'Problema'}</SheetTitle>
          <SheetDescription className="flex flex-wrap items-center gap-2">
            {problema ? <><StatusChip status={problema.status} /> <span>Registrado em {dataBr(problema.data_registro)}{problema.origem !== 'manual' ? ` · origem: ${problema.origem}` : ''}</span></> : 'Preencha os campos e salve.'}
          </SheetDescription>
        </SheetHeader>

        <div className="grid gap-3 px-4 pb-2">
          <div className="grid gap-1"><Label className={rot}>Assunto</Label><input className={CAMPO} value={f.assunto} onChange={set('assunto')} disabled={!podeEditar} maxLength={300} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1"><Label className={rot}>Área</Label>
              <select className={CAMPO} value={f.area} onChange={set('area')} disabled={!podeEditar}>{AREAS.map((a) => <option key={a} value={a}>{ROTULO_AREA[a]}</option>)}</select></div>
            <div className="grid gap-1"><Label className={rot}>Status</Label>
              <select className={CAMPO} value={f.status} onChange={set('status')} disabled={!podeEditar}>{STATUS.map((a) => <option key={a} value={a}>{ROTULO_STATUS[a]}</option>)}</select></div>
            <div className="grid gap-1"><Label className={rot}>Prioridade</Label>
              <select className={CAMPO} value={f.prioridade} onChange={set('prioridade')} disabled={!podeEditar}>{PRIORIDADES.map((a) => <option key={a} value={a}>{ROTULO_PRIORIDADE[a]}</option>)}</select></div>
            <div className="grid gap-1"><Label className={rot}>Prazo de correção</Label>
              <input type="date" className={CAMPO} value={f.prazo} onChange={set('prazo')} disabled={!podeEditar} /></div>
          </div>
          <div className="grid gap-1"><Label className={rot}>Observação do prazo (sem data)</Label><input className={CAMPO} value={f.prazo_texto} onChange={set('prazo_texto')} disabled={!podeEditar} maxLength={200} placeholder='Ex.: Próximo "cpi"' /></div>
          <div className="grid gap-1"><Label className={rot}>Razão do problema</Label><textarea className={`${CAMPO} h-auto min-h-24 py-2`} value={f.razao} onChange={set('razao')} disabled={!podeEditar} maxLength={4000} /></div>
          <div className="grid gap-1"><Label className={rot}>Ação para correção</Label><textarea className={`${CAMPO} h-auto min-h-24 py-2`} value={f.acao} onChange={set('acao')} disabled={!podeEditar} maxLength={4000} /></div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1"><Label className={rot}>Versão</Label><input className={CAMPO} value={f.versao} onChange={set('versao')} disabled={!podeEditar} maxLength={80} /></div>
            <div className="grid gap-1"><Label className={rot}>Quem relatou</Label><input className={CAMPO} value={f.relator} onChange={set('relator')} disabled={!podeEditar} maxLength={120} /></div>
            <div className="grid gap-1"><Label className={rot}>Responsável</Label><input className={CAMPO} value={f.responsavel} onChange={set('responsavel')} disabled={!podeEditar} maxLength={120} /></div>
          </div>
        </div>

        {podeEditar && (
          <div className="flex flex-wrap items-center gap-2 px-4">
            <Button onClick={salvar} disabled={salvando}>{salvando && <Loader2 className="h-4 w-4 animate-spin" />}{novo ? 'Criar problema' : 'Salvar alterações'}</Button>
            <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
            {!novo && perms.excluir && <Button variant="destructive" className="ml-auto" onClick={excluir} disabled={salvando}><Trash2 className="h-4 w-4" /> Excluir</Button>}
          </div>
        )}

        {!novo && (
          <div className="px-4 pb-6">
            <h3 className="mb-2 text-sm font-semibold">Histórico de alterações</h3>
            {hist === null ? <p className="inline-flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…</p>
              : hist.length === 0 ? <p className="text-xs text-muted-foreground">Sem alterações registradas.</p> : (
                <ul className="grid gap-2">
                  {hist.map((h) => (
                    <li key={h.id} className="rounded-lg border bg-muted/30 p-2.5 text-xs">
                      <div className="flex flex-wrap justify-between gap-1"><span className="font-medium">{ROTULO_ACAO[h.acao] ?? h.acao} · {h.ator ?? 'Sistema'}</span><span className="text-muted-foreground">{new Date(h.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span></div>
                      <DiffCampos antes={h.antes} depois={h.depois} />
                    </li>
                  ))}
                </ul>
              )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

/** Mostra campo: antes → depois (só o que mudou). */
export function DiffCampos({ antes, depois }: { antes: Record<string, unknown> | null; depois: Record<string, unknown> | null }) {
  const chaves = [...new Set([...Object.keys(antes ?? {}), ...Object.keys(depois ?? {})])]
  if (chaves.length === 0) return null
  const v = (x: unknown) => (x == null || x === '' ? '—' : String(x))
  return (
    <ul className="mt-1.5 grid gap-1 text-muted-foreground">
      {chaves.slice(0, 12).map((k) => (
        <li key={k} className="break-words"><span className="font-medium text-foreground">{k}</span>: {antes ? <><span className="line-through">{v(antes[k]).slice(0, 80)}</span> {depois ? '→ ' : ''}</> : null}{depois ? v(depois[k]).slice(0, 80) : null}</li>
      ))}
    </ul>
  )
}
