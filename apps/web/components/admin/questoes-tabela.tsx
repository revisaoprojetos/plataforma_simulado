'use client'

import { useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { Check, Loader2, Trash2, Pencil, X, AlertTriangle, ArrowUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { confirmar } from '@/components/ui/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { CopiarCodigo } from '@/components/admin/copiar-codigo'
import { codigoQuestao } from '@/lib/codigo-questao'
import { verificarUsoQuestoes, excluirQuestoes, type UsoQuestao } from '@/app/admin/questoes/actions'

export type LinhaQuestao = {
  id: string; codigo: string | null; enunciado: string; status: string | null; tipo: string | null; formato: string | null
  nivel_dificuldade: string | null; ano: number | null; cargo: string | null; assunto_detalhe: string | null
  disciplina: string | null; assunto: string | null; banca: string | null; orgao: string | null
}

const statusCfg: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  publicada: { label: 'Publicada', variant: 'default' },
  rascunho: { label: 'Rascunho', variant: 'outline' },
  arquivada: { label: 'Arquivada', variant: 'secondary' },
}
const difLabel: Record<string, string> = { facil: 'Fácil', medio: 'Médio', dificil: 'Difícil' }
/** Tipo exibido: discursiva, ou (objetiva) Certo/Errado vs Múltipla, conforme o formato. */
function tipoLabel(q: LinhaQuestao): string {
  if (q.tipo === 'discursiva') return 'Discursiva'
  if (q.formato === 'certo_errado') return 'Certo/Errado'
  return 'Múltipla'
}

type CampoOrd = 'codigo' | 'enunciado' | 'disciplina' | 'assunto' | 'assunto_detalhe' | 'orgao' | 'cargo' | 'ano' | 'banca' | 'dificuldade' | 'tipo' | 'status'

/** Quadradinho de seleção (mesmo visual da aba Unificação). */
function CaixaSel({ on }: { on: boolean }) {
  return <span className={cn('flex h-4 w-4 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>{on && <Check className="h-3 w-3" />}</span>
}

export function QuestoesTabela({ questoes }: { questoes: LinhaQuestao[] }) {
  const router = useRouter()
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [excluindo, setExcluindo] = useState(false)
  const [uso, setUso] = useState<UsoQuestao[] | null>(null) // dialog de salvaguarda (itens em uso)
  const [pendentes, setPendentes] = useState<string[]>([]) // ids aguardando confirmação do dialog

  const idsPagina = useMemo(() => questoes.map((q) => q.id), [questoes])
  const todosMarcados = idsPagina.length > 0 && idsPagina.every((id) => sel.has(id))

  // Ordenação (da página atual). Clique no cabeçalho alterna asc/desc.
  const [campo, setCampo] = useState<CampoOrd | null>(null)
  const [dir, setDir] = useState<'asc' | 'desc'>('asc')
  function ordenar(c: CampoOrd) {
    if (campo === c) setDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setCampo(c); setDir('asc') }
  }
  const linhas = useMemo(() => {
    if (!campo) return questoes
    const difIdx: Record<string, number> = { facil: 0, medio: 1, dificil: 2 }
    const val = (q: LinhaQuestao): string | number => {
      switch (campo) {
        case 'codigo': return codigoQuestao(q.id, q.codigo)
        case 'enunciado': return q.enunciado ?? ''
        case 'disciplina': return q.disciplina ?? ''
        case 'assunto': return q.assunto ?? ''
        case 'assunto_detalhe': return q.assunto_detalhe ?? ''
        case 'orgao': return q.orgao ?? ''
        case 'cargo': return q.cargo ?? ''
        case 'ano': return q.ano ?? -1
        case 'banca': return q.banca ?? ''
        case 'dificuldade': return q.nivel_dificuldade ? (difIdx[q.nivel_dificuldade] ?? 9) : 9
        case 'tipo': return tipoLabel(q)
        case 'status': return q.status ?? ''
      }
    }
    return [...questoes].sort((a, b) => {
      const va = val(a), vb = val(b)
      const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR')
      return dir === 'asc' ? c : -c
    })
  }, [questoes, campo, dir])

  const ThOrd = ({ campo: c, children, className }: { campo: CampoOrd; children: ReactNode; className?: string }) => (
    <th className={cn('px-3 py-2 font-medium', className)}>
      <button type="button" onClick={() => ordenar(c)} className="inline-flex items-center gap-1 hover:text-foreground">
        {children}<ArrowUpDown className={cn('h-3 w-3', campo === c ? 'text-primary' : 'text-muted-foreground/50')} />
      </button>
    </th>
  )

  function toggle(id: string) { setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  function toggleTodos() { setSel((p) => (todosMarcados ? new Set([...p].filter((id) => !idsPagina.includes(id))) : new Set([...p, ...idsPagina]))) }
  const limpar = () => setSel(new Set())

  async function iniciarExclusao() {
    const ids = [...sel]
    if (!ids.length) return
    setExcluindo(true)
    const r = await verificarUsoQuestoes(ids)
    setExcluindo(false)
    if (!r.ok) { toast.error(r.error ?? 'Erro ao verificar uso.'); return }
    if (r.itens && r.itens.length) { setPendentes(ids); setUso(r.itens); return } // salvaguarda
    const ok = await confirmar({ titulo: `Excluir ${ids.length} questão(ões)?`, mensagem: 'Vão para a lixeira (reversível). Deseja continuar?', confirmar: 'Excluir', destrutivo: true })
    if (ok) await efetivar(ids)
  }

  async function efetivar(ids: string[]) {
    setExcluindo(true)
    const r = await excluirQuestoes(ids)
    setExcluindo(false)
    setUso(null); setPendentes([])
    if (r.ok) { toast.success(`${r.count ?? ids.length} questão(ões) excluída(s)`); limpar(); router.refresh() }
    else toast.error(r.error ?? 'Erro ao excluir.')
  }

  return (
    <div className="space-y-3">
      {/* Barra de ação (só com seleção) */}
      {sel.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-4 py-2.5">
          <span className="text-sm font-medium">{sel.size} selecionada(s)</span>
          <button onClick={limpar} className="rounded-lg border px-2.5 py-1.5 text-xs text-muted-foreground transition hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
          <button onClick={iniciarExclusao} disabled={excluindo}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-sm font-semibold text-destructive-foreground transition hover:opacity-90 disabled:opacity-50">
            {excluindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Excluir {sel.size}
          </button>
        </div>
      )}

      {/* Tabela com rolagem horizontal */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1720px] text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="w-10 px-3 py-2"><button type="button" onClick={toggleTodos} aria-label="Selecionar todos"><CaixaSel on={todosMarcados} /></button></th>
              <ThOrd campo="codigo" className="w-[136px] whitespace-nowrap">Código</ThOrd>
              <ThOrd campo="enunciado" className="w-[48rem]">Enunciado</ThOrd>
              <ThOrd campo="disciplina">Disciplina</ThOrd>
              <ThOrd campo="assunto">Assunto</ThOrd>
              <ThOrd campo="assunto_detalhe">Assunto específico</ThOrd>
              <ThOrd campo="orgao">Órgão</ThOrd>
              <ThOrd campo="cargo">Cargo</ThOrd>
              <ThOrd campo="ano">Ano</ThOrd>
              <ThOrd campo="banca">Banca</ThOrd>
              <ThOrd campo="dificuldade">Dificuldade</ThOrd>
              <ThOrd campo="tipo">Tipo</ThOrd>
              <ThOrd campo="status">Status</ThOrd>
              <th className="w-12 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 ? (
              <tr><td colSpan={14} className="py-8 text-center text-muted-foreground">Nenhuma questão encontrada.</td></tr>
            ) : linhas.map((q) => {
              const on = sel.has(q.id)
              const cfg = statusCfg[q.status ?? 'rascunho'] ?? statusCfg.rascunho
              return (
                <tr key={q.id} className={cn('border-b transition-colors hover:bg-muted/30', on && 'bg-primary/5')}>
                  <td className="px-3 py-2"><button type="button" onClick={() => toggle(q.id)} aria-label="Selecionar questão"><CaixaSel on={on} /></button></td>
                  <td className="whitespace-nowrap px-3 py-2"><CopiarCodigo codigo={codigoQuestao(q.id, q.codigo)} /></td>
                  <td className="max-w-[48rem] px-3 py-2"><Link href={`/admin/questoes/${q.id}/editar`} title={q.enunciado || undefined} className="block truncate hover:text-primary hover:underline">{q.enunciado || '—'}</Link></td>
                  <td className="whitespace-nowrap px-3 py-2">{q.disciplina ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2">{q.assunto ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2">{q.assunto_detalhe ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2">{q.orgao ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2">{q.cargo ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{q.ano ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2">{q.banca ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2">{q.nivel_dificuldade ? (difLabel[q.nivel_dificuldade] ?? q.nivel_dificuldade) : '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2">{tipoLabel(q)}</td>
                  <td className="px-3 py-2"><Badge variant={cfg.variant}>{cfg.label}</Badge></td>
                  <td className="px-3 py-2"><Link href={`/admin/questoes/${q.id}/editar`} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></Link></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Salvaguarda: dialog listando as questões em uso (banco/simulado/respostas) */}
      {uso && createPortal(
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !excluindo && setUso(null)} />
          <div role="dialog" aria-modal="true" className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
            <div className="flex items-center gap-2 border-b px-5 py-3.5">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <h3 className="text-sm font-semibold">Atenção: {uso.length} questão(ões) em uso</h3>
              <button type="button" onClick={() => !excluindo && setUso(null)} aria-label="Fechar" className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-auto p-4">
              <p className="text-sm text-muted-foreground">Estas questões já estão em algum <strong>banco</strong>/<strong>simulado</strong> ou foram <strong>respondidas</strong>. Excluir manda tudo para a lixeira (reversível), mas pode afetar simulados existentes.</p>
              {uso.map((u) => (
                <div key={u.id} className="rounded-lg border p-2.5 text-sm">
                  <p className="font-medium">{codigoQuestao(u.id, u.codigo)} <span className="font-normal text-muted-foreground">— {u.enunciado}…</span></p>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                    {u.bancos.map((b) => <span key={b} className="rounded-full bg-sky-500/10 px-2 py-0.5 text-sky-700 dark:text-sky-300">Banco: {b}</span>)}
                    {u.simulados.map((s) => <span key={s} className="rounded-full bg-violet-500/10 px-2 py-0.5 text-violet-700 dark:text-violet-300">Simulado: {s}</span>)}
                    {u.respostas > 0 && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-300">{u.respostas.toLocaleString('pt-BR')} resposta(s)</span>}
                  </div>
                </div>
              ))}
              {pendentes.length > uso.length && <p className="text-xs text-muted-foreground">(+ {pendentes.length - uso.length} sem uso serão excluídas junto.)</p>}
            </div>
            <div className="flex justify-end gap-2 border-t px-5 py-3.5">
              <button type="button" onClick={() => setUso(null)} disabled={excluindo} className="rounded-lg border px-4 py-2 text-sm font-medium transition hover:bg-muted disabled:opacity-50">Cancelar</button>
              <button type="button" onClick={() => efetivar(pendentes)} disabled={excluindo} className="inline-flex items-center gap-1.5 rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground transition hover:opacity-90 disabled:opacity-50">
                {excluindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Excluir mesmo assim
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
