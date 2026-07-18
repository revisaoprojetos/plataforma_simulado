'use client'

import { useMemo, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RefreshCw, Loader2, Check, Link2, AlertTriangle, Zap, Clock, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { salvarSyncSimples, sincronizarCurseducaAgora } from '@/app/admin/curseduca/actions'
import type { GrupoCurseducaDTO, GrupoSistema } from '@/app/admin/curseduca/actions'

const INTERVALOS: Record<string, string> = { '15': '15 minutos', '30': '30 minutos', '60': '1 hora', '120': '2 horas', '240': '4 horas' }

/** Normaliza nome p/ casar grupo da Curseduca × grupo do sistema (sem acento/caixa/espaços extras). */
const norm = (s?: string | null) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ')

/** Grupos da Curseduca que têm um grupo do sistema com o MESMO nome = "vinculados". */
function calcVinculados(grupos: { id: number; nome: string }[], sistema: { id: string; nome: string }[]) {
  const mapa = new Map(sistema.map((s) => [norm(s.nome), { id: s.id, nome: s.nome }]))
  return grupos
    .filter((g) => mapa.has(norm(g.nome)))
    .map((g) => { const s = mapa.get(norm(g.nome))!; return { id: g.id, nome: g.nome, sistemaId: s.id, sistemaNome: s.nome } })
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
  // Só grupos comuns podem casar com a Curseduca (pastas/mestre não são destino de sync).
  const comuns = useMemo(() => sistema.filter((s) => !s.is_mestre), [sistema])
  const vinculados = useMemo(() => calcVinculados(grupos, comuns), [grupos, comuns])
  const [ativo, setAtivo] = useState(inicialAtivo)
  const [intervalo, setIntervalo] = useState(String(inicialIntervalo || 30))
  const [sel, setSel] = useState<Set<number>>(() => {
    const ids = calcVinculados(grupos, comuns).map((v) => v.id)
    const pre = inicialGrupos.filter((id) => ids.includes(id))
    return new Set(pre.length ? pre : ids)
  })
  const [salvando, start] = useTransition()
  const [sincronizando, startSync] = useTransition()

  const toggle = (id: number) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const marcarTodos = () => setSel(new Set(vinculados.map((v) => v.id)))
  const limpar = () => setSel(new Set())

  function sincronizarAgora() {
    const pares = vinculados.filter((v) => sel.has(v.id)).map((v) => ({ canal: v.id, grupo: v.sistemaId }))
    if (!pares.length) { toast.error('Marque ao menos um grupo vinculado.'); return }
    startSync(async () => {
      const r = await sincronizarCurseducaAgora(pares)
      if (!r.ok) { toast.error(r.error ?? 'Falha na sincronização'); return }
      toast.success(`Sincronizado: ${r.canais} grupo(s) · ${r.vinculados ?? 0} vinculado(s)${r.novos ? ` · ${r.novos} novo(s)` : ''}`)
    })
  }
  function salvar() {
    if (ativo && sel.size === 0) { toast.error('Marque ao menos um grupo vinculado para sincronizar.'); return }
    start(async () => {
      const r = await salvarSyncSimples(Number(intervalo), ativo, [...sel])
      if (r.ok) toast.success(ativo ? `Automático ativado · a cada ${INTERVALOS[intervalo]} · ${sel.size} grupo(s)` : 'Sincronização automática desligada')
      else toast.error(r.error ?? 'Erro ao salvar')
    })
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold"><RefreshCw className="h-4 w-4 text-primary" /> Sincronização Curseduca</h3>
        <p className="text-sm text-muted-foreground">Mantém os grupos do sistema atualizados com os canais de acesso da Curseduca de <b>mesmo nome</b>. Só adiciona alunos novos — <b>nunca</b> remove nem sincroniza a conta inteira.</p>
      </div>

      {vinculados.length === 0 ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Nenhum canal da Curseduca corresponde a um grupo do sistema. Crie um grupo no sistema com o <b>mesmo nome</b> do canal da Curseduca — só grupos <b>vinculados</b> podem ser sincronizados (trava de segurança).</span>
        </div>
      ) : (
        <>
          {/* Grupos de acesso vinculados */}
          <div className="rounded-2xl border bg-card p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-sm font-medium"><Link2 className="h-4 w-4 text-primary" /> Grupos de acesso vinculados <span className="text-muted-foreground">({sel.size}/{vinculados.length})</span></span>
              <span className="flex gap-1.5 text-xs">
                <button type="button" onClick={marcarTodos} className="rounded px-2 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">Todos</button>
                <button type="button" onClick={limpar} className="rounded px-2 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">Nenhum</button>
              </span>
            </div>
            <div className="scroll-claro max-h-64 space-y-1 overflow-y-auto">
              {vinculados.map((v) => {
                const on = sel.has(v.id)
                return (
                  <button key={v.id} type="button" onClick={() => toggle(v.id)}
                    className={cn('flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left text-sm transition', on ? 'border-primary/40 bg-primary/5' : 'border-transparent hover:bg-muted')}>
                    <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                      {on && <Check className="h-3 w-3" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">{v.nome}</span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 max-w-[38%] shrink-0 truncate text-right text-xs text-muted-foreground" title={v.sistemaNome}>grupo: {v.sistemaNome}</span>
                    <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">#{v.id}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Opção 1: sincronização imediata */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-3 shadow-sm">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-semibold"><Zap className="h-4 w-4 text-primary" /> Sincronizar agora</p>
              <p className="text-xs text-muted-foreground">Traz na hora os alunos dos <b>{sel.size}</b> grupo(s) marcado(s) para os grupos do sistema.</p>
            </div>
            <Button onClick={sincronizarAgora} disabled={sincronizando || sel.size === 0}>
              {sincronizando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />} Sincronizar agora
            </Button>
          </div>

          {/* Opção 2: sincronização automática (por intervalo) */}
          <div className="space-y-2.5 rounded-2xl border bg-card p-3 shadow-sm">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="h-4 w-4 rounded border" />
              <Clock className="h-4 w-4 text-primary" /> Sincronização automática (de tempo em tempo)
            </label>
            <div className={cn('flex flex-wrap items-center gap-2 transition-opacity', !ativo && 'pointer-events-none opacity-50')}>
              <label className="shrink-0 text-xs font-medium text-muted-foreground">A cada</label>
              <Select value={intervalo} onValueChange={(v) => setIntervalo(v ?? '30')} items={INTERVALOS}>
                <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(INTERVALOS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
              <Button onClick={salvar} disabled={salvando} size="sm" className="shrink-0">
                {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} Salvar
              </Button>
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">Quando ativa, roda sozinha no servidor no intervalo escolhido — só os grupos vinculados marcados. Desmarque <b>Ativar</b> e salve para desligar.</p>
          </div>

          <p className="flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" /> Segurança: a sincronização cobre <b>só os grupos vinculados</b> (canal com grupo de mesmo nome) — é impossível arrastar a conta inteira. Nunca remove alunos.
          </p>
        </>
      )}
    </div>
  )
}
