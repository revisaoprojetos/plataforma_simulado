'use client'

import { useMemo, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RefreshCw, Loader2, Check, Link2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { salvarSyncSimples } from '@/app/admin/curseduca/actions'
import type { GrupoCurseducaDTO, GrupoSistema } from '@/app/admin/curseduca/actions'

const INTERVALOS: Record<string, string> = { '15': '15 minutos', '30': '30 minutos', '60': '1 hora', '120': '2 horas', '240': '4 horas' }

/** Normaliza nome p/ casar grupo da Curseduca × grupo do sistema (sem acento/caixa/espaços extras). */
const norm = (s?: string | null) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ')

/** Grupos da Curseduca que têm um grupo do sistema com o MESMO nome = "vinculados". */
function calcVinculados(grupos: { id: number; nome: string }[], sistema: { id: string; nome: string }[]) {
  const mapa = new Map(sistema.map((s) => [norm(s.nome), s.nome]))
  return grupos
    .filter((g) => mapa.has(norm(g.nome)))
    .map((g) => ({ id: g.id, nome: g.nome, sistemaNome: mapa.get(norm(g.nome))! }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

/**
 * Card da sincronização automática. IMPORTANTE (correção do incidente 17k):
 * a sync SÓ pode cobrir os grupos da Curseduca que já correspondem a um grupo do
 * sistema (mesmo nome) — nunca todos os ~200 grupos. Aqui detectamos esses grupos
 * "vinculados" por nome e o admin confirma quais entram. `salvarSyncSimples` recebe
 * apenas os ids marcados.
 */
export function CurseducaSyncCard({ grupos, sistema = [], inicialAtivo, inicialIntervalo, inicialGrupos = [] }: {
  grupos: GrupoCurseducaDTO[]; sistema?: GrupoSistema[]; inicialAtivo: boolean; inicialIntervalo: number; inicialGrupos?: number[]
}) {
  const vinculados = useMemo(() => calcVinculados(grupos, sistema), [grupos, sistema])
  const [ativo, setAtivo] = useState(inicialAtivo)
  const [intervalo, setIntervalo] = useState(String(inicialIntervalo || 30))
  const [sel, setSel] = useState<Set<number>>(() => {
    const ids = calcVinculados(grupos, sistema).map((v) => v.id)
    const pre = inicialGrupos.filter((id) => ids.includes(id))
    return new Set(pre.length ? pre : ids)
  })
  const [salvando, start] = useTransition()

  const toggle = (id: number) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const marcarTodos = () => setSel(new Set(vinculados.map((v) => v.id)))
  const limpar = () => setSel(new Set())

  function salvar() {
    if (ativo && sel.size === 0) { toast.error('Marque ao menos um grupo vinculado para sincronizar.'); return }
    start(async () => {
      const r = await salvarSyncSimples(Number(intervalo), ativo, [...sel])
      if (r.ok) toast.success(ativo ? `Sincronização ativada · ${sel.size} grupo(s) vinculado(s)` : 'Sincronização automática desligada')
      else toast.error(r.error ?? 'Erro ao salvar')
    })
  }

  return (
    <div className="space-y-2.5 rounded-2xl border bg-card p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary"><RefreshCw className="h-4 w-4" /></span>
        <h3 className="text-sm font-semibold leading-tight">Sincronização automática</h3>
      </div>

      {vinculados.length === 0 ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Nenhum grupo da Curseduca corresponde a um grupo do sistema. Crie um grupo no sistema com o <b>mesmo nome</b> do grupo da Curseduca que deseja sincronizar — só grupos vinculados podem ser sincronizados.</span>
        </div>
      ) : (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="h-4 w-4 rounded border" />
            Ativar
          </label>

          <div className={cn('space-y-2 transition-opacity', !ativo && 'pointer-events-none opacity-50')}>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground"><Link2 className="h-3.5 w-3.5" /> Grupos vinculados ({sel.size}/{vinculados.length})</span>
              <span className="flex gap-1.5 text-[11px]">
                <button type="button" onClick={marcarTodos} className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">Todos</button>
                <button type="button" onClick={limpar} className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">Nenhum</button>
              </span>
            </div>

            <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border p-1">
              {vinculados.map((v) => {
                const on = sel.has(v.id)
                return (
                  <button key={v.id} type="button" onClick={() => toggle(v.id)}
                    className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition', on ? 'bg-primary/10' : 'hover:bg-muted')}>
                    <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                      {on && <Check className="h-3 w-3" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">{v.nome}</span>
                    <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">#{v.id}</span>
                  </button>
                )
              })}
            </div>

            <div className="flex items-center gap-2">
              <label className="shrink-0 text-xs font-medium text-muted-foreground">A cada</label>
              <Select value={intervalo} onValueChange={(v) => setIntervalo(v ?? '30')} items={INTERVALOS}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(INTERVALOS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
              <Button onClick={salvar} disabled={salvando} size="sm" className="shrink-0">
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <p className="text-[11px] leading-snug text-muted-foreground">Sincroniza só os <b>grupos vinculados</b> marcados (nunca a conta inteira). Só adiciona alunos novos — nunca remove.</p>
        </>
      )}

      {/* Botão salvar também disponível quando desativando sem grupos vinculados restantes */}
      {vinculados.length === 0 && inicialAtivo && (
        <Button onClick={() => { setAtivo(false); salvar() }} disabled={salvando} size="sm" variant="outline" className="w-full">
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Desligar sincronização'}
        </Button>
      )}
    </div>
  )
}
