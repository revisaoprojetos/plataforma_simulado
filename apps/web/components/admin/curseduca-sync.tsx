'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Search, X, Check, RefreshCw, Trash2, Play, Loader2, Clock, Users, Power } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { criarRegraSync, toggleRegraSync, excluirRegraSync, rodarRegraSyncAgora, type GrupoCurseducaDTO, type GrupoSistema, type RegraSyncDTO } from '@/app/admin/curseduca/actions'

const INTERVALOS: [number, string][] = [[15, '15 min'], [30, '30 min'], [60, '1 hora'], [120, '2 horas'], [240, '4 horas']]
const intervaloLabel = (m: number) => INTERVALOS.find(([v]) => v === m)?.[1] ?? `${m} min`

function fmt(iso: string | null) {
  if (!iso) return 'nunca'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? 'nunca' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
function resumo(r: RegraSyncDTO['ultimo_resultado']) {
  if (!r) return null
  if (!r.ok) return { txt: r.error ?? 'falha', erro: true }
  return { txt: `${r.novos ?? 0} novo(s) · ${r.atualizados ?? 0} atualizado(s)${r.removidos ? ` · ${r.removidos} removido(s)` : ''}`, erro: false }
}

export function CurseducaSync({ grupos, sistema, regras }: { grupos: GrupoCurseducaDTO[]; sistema: GrupoSistema[]; regras: RegraSyncDTO[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [alvo, setAlvo] = useState<string | null>(null)

  // Formulário de nova regra
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [destino, setDestino] = useState<'nenhum' | 'existente'>('nenhum')
  const [grupoId, setGrupoId] = useState('')
  const [sincronizar, setSincronizar] = useState(false)
  const [intervalo, setIntervalo] = useState(30)

  const nomeGrupo = useMemo(() => new Map(grupos.map((g) => [g.id, g.nome])), [grupos])
  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? grupos.filter((g) => g.nome.toLowerCase().includes(t)) : grupos
  }, [grupos, q])
  const toggle = (id: number) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  function criar() {
    if (!sel.size) { toast.error('Selecione ao menos um grupo.'); return }
    if (destino === 'existente' && !grupoId) { toast.error('Escolha o grupo de destino.'); return }
    start(async () => {
      const r = await criarRegraSync([...sel], { tipo: destino, grupoId: grupoId || undefined }, sincronizar, intervalo)
      if (!r.ok) { toast.error(r.error ?? 'Falha ao criar.'); return }
      toast.success('Regra de sincronização criada.')
      setSel(new Set()); setDestino('nenhum'); setGrupoId(''); setSincronizar(false)
      router.refresh()
    })
  }
  function agir(id: string, fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) {
    setAlvo(id)
    start(async () => {
      const r = await fn(); setAlvo(null)
      if (!r.ok) { toast.error(r.error ?? 'Falha.'); return }
      toast.success(msg); router.refresh()
    })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      {/* Regras ativas */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Regras de sincronização ({regras.length})</h2>
        {regras.length === 0 ? (
          <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">
            Nenhuma regra ainda. Crie uma ao lado para o sistema importar sozinho os alunos desses grupos.
          </div>
        ) : regras.map((r) => {
          const res = resumo(r.ultimo_resultado)
          return (
            <div key={r.id} className={cn('rounded-2xl border bg-card p-4', !r.ativo && 'opacity-60')}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"><Users className="h-3 w-3" /> {r.grupos.length} grupo(s)</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"><Clock className="h-3 w-3" /> a cada {intervaloLabel(r.intervalo_min)}</span>
                {r.destino?.tipo === 'existente'
                  ? <span className="rounded-full border px-2 py-0.5 text-xs">→ {r.grupoDestinoNome ?? 'grupo'}</span>
                  : <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">→ só sistema</span>}
                {r.sincronizar && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-400">remove quem saiu</span>}
                <span className="ml-auto text-[11px] text-muted-foreground">última: {fmt(r.ultima_execucao)}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {r.grupos.slice(0, 4).map((gid) => <span key={gid} className="max-w-[160px] truncate rounded bg-muted/60 px-1.5 py-0.5 text-[11px] text-muted-foreground">{nomeGrupo.get(gid) ?? `#${gid}`}</span>)}
                {r.grupos.length > 4 && <span className="text-[11px] text-muted-foreground">+{r.grupos.length - 4}</span>}
              </div>
              {res && <p className={cn('mt-2 text-xs', res.erro ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground')}>Último: {res.txt}</p>}
              <div className="mt-3 flex items-center gap-2">
                <button type="button" disabled={pending} onClick={() => agir(r.id, () => rodarRegraSyncAgora(r.id).then((x) => ({ ok: x.ok, error: x.error })), 'Sincronizado.')}
                  className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition hover:bg-muted disabled:opacity-50">
                  {alvo === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Rodar agora
                </button>
                <button type="button" disabled={pending} onClick={() => agir(r.id, () => toggleRegraSync(r.id, !r.ativo), r.ativo ? 'Pausada.' : 'Ativada.')}
                  className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition hover:bg-muted disabled:opacity-50">
                  <Power className="h-3.5 w-3.5" /> {r.ativo ? 'Pausar' : 'Ativar'}
                </button>
                <button type="button" disabled={pending} onClick={() => agir(r.id, () => excluirRegraSync(r.id), 'Regra excluída.')}
                  className="ml-auto inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-400">
                  <Trash2 className="h-3.5 w-3.5" /> Excluir
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Nova regra */}
      <div className="space-y-3 lg:sticky lg:top-20 lg:self-start">
        <div className="rounded-2xl border bg-card">
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <RefreshCw className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Nova sincronização</h3>
          </div>
          <div className="space-y-3 p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Buscar entre ${grupos.length} grupos…`}
                className="w-full rounded-lg border bg-transparent py-2 pl-9 pr-8 text-sm outline-none focus:ring-2 focus:ring-ring" />
              {q && <button type="button" onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
            </div>
            <div className="scroll-claro max-h-[32vh] overflow-y-auto rounded-lg border p-1">
              {filtrados.map((g) => {
                const on = sel.has(g.id)
                return (
                  <button key={g.id} type="button" onClick={() => toggle(g.id)} className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition', on ? 'bg-primary/10' : 'hover:bg-muted')}>
                    <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>{on && <Check className="h-3 w-3" />}</span>
                    <span className="min-w-0 flex-1 truncate">{g.nome}</span>
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-muted-foreground">{sel.size} grupo(s) selecionado(s)</p>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm"><input type="radio" checked={destino === 'nenhum'} onChange={() => setDestino('nenhum')} /> Só adicionar ao sistema</label>
              <label className="flex items-center gap-2 text-sm"><input type="radio" checked={destino === 'existente'} onChange={() => setDestino('existente')} /> Vincular a um grupo existente</label>
              {destino === 'existente' && (
                <Select value={grupoId} onValueChange={(v) => setGrupoId(v ?? '')}>
                  <SelectTrigger className="ml-5 h-9 w-[calc(100%-1.25rem)]"><SelectValue placeholder="Escolha o grupo…">{(v: string) => (v ? sistema.find((s) => s.id === v)?.nome : null) ?? 'Escolha o grupo…'}</SelectValue></SelectTrigger>
                  <SelectContent>{sistema.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}</SelectContent>
                </Select>
              )}
              {destino === 'existente' && (
                <label className="ml-5 flex items-start gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={sincronizar} onChange={(e) => setSincronizar(e.target.checked)} className="mt-0.5" /> Remover do grupo quem saiu dos grupos da Curseduca</label>
              )}
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">Rodar a cada</span>
              <Select value={String(intervalo)} onValueChange={(v) => setIntervalo(Number(v))}>
                <SelectTrigger className="h-9 w-36"><SelectValue>{(v: string) => intervaloLabel(Number(v))}</SelectValue></SelectTrigger>
                <SelectContent>{INTERVALOS.map(([v, l]) => <SelectItem key={v} value={String(v)}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <button type="button" onClick={criar} disabled={pending || sel.size === 0}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-violet-600 px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-60">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Criar sincronização
            </button>
            <p className="text-[11px] text-muted-foreground">O sistema reimporta esses grupos no intervalo escolhido. Novos alunos na Curseduca passam a aparecer sozinhos.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
