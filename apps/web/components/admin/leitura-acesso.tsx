'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Save, Search, Users, UserCheck, Info, Check, ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  carregarAtribuicao, definirGruposDocumento,
  carregarEstudantesDocumento, definirEstudantesDocumento, listarEstudantesTenant,
  type EstudanteLinha,
} from '@/app/admin/leitura/actions'

type Grupo = { id: string; nome: string; cor: string | null; atribuido: boolean }
type OrdCampo = 'nome' | 'email' | 'cpf'
const POR_PAGINA = 50

// Aba "Acesso": define QUEM lê esta leitura — grupos (turmas) + tabela de alunos
// (estilo aba Estudantes do banco). Sem nenhuma atribuição = liberado a todos.
export function LeituraAcesso({ documentoId }: { documentoId: string }) {
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [alunos, setAlunos] = useState<EstudanteLinha[]>([])
  const [acesso, setAcesso] = useState<Set<string>>(new Set())
  const [busca, setBusca] = useState('')
  const [ordCampo, setOrdCampo] = useState<OrdCampo>('nome')
  const [ordDir, setOrdDir] = useState<'asc' | 'desc'>('asc')
  const [pagina, setPagina] = useState(0)

  useEffect(() => {
    ;(async () => {
      const [a, e, todos] = await Promise.all([carregarAtribuicao(documentoId), carregarEstudantesDocumento(documentoId), listarEstudantesTenant()])
      if (a.ok && a.grupos) { setGrupos(a.grupos); setMarcados(new Set(a.grupos.filter((g) => g.atribuido).map((g) => g.id))) }
      if (e.ok && e.itens) setAcesso(new Set(e.itens.map((x) => x.id)))
      if (todos.ok && todos.itens) setAlunos(todos.itens)
      setCarregando(false)
    })()
  }, [documentoId])

  function ordenar(campo: OrdCampo) {
    if (ordCampo === campo) setOrdDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setOrdCampo(campo); setOrdDir('asc') }
  }

  const filtrados = useMemo(() => {
    const q = busca.toLowerCase().trim()
    const base = q ? alunos.filter((a) => a.nome.toLowerCase().includes(q) || (a.email ?? '').toLowerCase().includes(q) || (a.cpf ?? '').includes(q)) : alunos
    const dir = ordDir === 'asc' ? 1 : -1
    return [...base].sort((x, y) => String(x[ordCampo] ?? '').localeCompare(String(y[ordCampo] ?? ''), 'pt-BR') * dir)
  }, [alunos, busca, ordCampo, ordDir])

  const totalPag = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))
  const paginaItens = useMemo(() => filtrados.slice(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA), [filtrados, pagina])
  useEffect(() => { setPagina(0) }, [busca, ordCampo, ordDir])
  useEffect(() => { if (pagina > totalPag - 1) setPagina(0) }, [totalPag, pagina])

  const filtradosTodosMarcados = filtrados.length > 0 && filtrados.every((a) => acesso.has(a.id))
  function toggleAcesso(id: string) { setAcesso((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  function toggleFiltrados() {
    setAcesso((p) => {
      const n = new Set(p)
      if (filtradosTodosMarcados) filtrados.forEach((a) => n.delete(a.id))
      else filtrados.forEach((a) => n.add(a.id))
      return n
    })
  }
  function toggleGrupo(id: string) { setMarcados((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }

  async function salvar() {
    setSalvando(true)
    const [rg, re] = await Promise.all([
      definirGruposDocumento(documentoId, [...marcados]),
      definirEstudantesDocumento(documentoId, [...acesso]),
    ])
    setSalvando(false)
    if (rg.ok && re.ok) toast.success('Acesso salvo')
    else toast.error(rg.error ?? re.error ?? 'Erro ao salvar acesso.')
  }

  const semRestricao = marcados.size === 0 && acesso.size === 0

  const SortHead = ({ label, campo, className }: { label: string; campo: OrdCampo; className?: string }) => {
    const ativo = ordCampo === campo
    return (
      <th className={cn('px-3 py-2 text-left font-medium', className)}>
        <button type="button" onClick={() => ordenar(campo)} className={cn('group -ml-1 flex items-center gap-1 rounded px-1 py-0.5 hover:text-foreground', ativo ? 'text-foreground' : 'text-muted-foreground')}>
          <span>{label}</span>
          {ativo ? (ordDir === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />) : <ChevronsUpDown className="h-3.5 w-3.5 opacity-40 group-hover:opacity-70" />}
        </button>
      </th>
    )
  }

  if (carregando) return <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando acesso…</div>

  return (
    <div className="space-y-4">
      <div className={cn('flex items-start gap-2 rounded-xl border px-4 py-2.5 text-sm', semRestricao ? 'border-sky-500/30 bg-sky-500/5 text-sky-700 dark:text-sky-300' : 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400')}>
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        {semRestricao
          ? <span>Sem nenhuma atribuição, esta leitura fica <strong>liberada para todos</strong> os alunos.</span>
          : <span>Restrito a <strong>{marcados.size}</strong> {marcados.size === 1 ? 'grupo' : 'grupos'} + <strong>{acesso.size}</strong> {acesso.size === 1 ? 'aluno' : 'alunos'} (a união dos dois).</span>}
      </div>

      {/* Grupos */}
      <div className="space-y-2 rounded-2xl border bg-card p-4 shadow-sm">
        <p className="flex items-center gap-1.5 text-sm font-semibold"><Users className="h-4 w-4 text-primary" /> Grupos com acesso</p>
        {grupos.length === 0 ? (
          <p className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">Nenhum grupo cadastrado neste tenant.</p>
        ) : (
          <div className="grid max-h-28 gap-1.5 overflow-auto sm:grid-cols-2 lg:grid-cols-3">
            {grupos.map((g) => (
              <label key={g.id} className={cn('flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm transition-colors', marcados.has(g.id) ? 'border-primary/40 bg-primary/5' : 'hover:bg-muted/40')}>
                <input type="checkbox" checked={marcados.has(g.id)} onChange={() => toggleGrupo(g.id)} className="h-4 w-4 rounded border" />
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: g.cor ?? '#94a3b8' }} />
                <span className="truncate">{g.nome}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Alunos — tabela (estilo aba Estudantes do banco) */}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold"><UserCheck className="h-4 w-4 text-primary" /> Alunos com acesso <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{acesso.size}</span></p>
          <div className="relative ml-auto min-w-48 flex-1 sm:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, e-mail ou CPF…" className="w-full rounded-lg border bg-[var(--input-bg,transparent)] py-2 pl-9 pr-3 text-sm outline-none focus:ring-1 focus:ring-ring" />
          </div>
        </div>

        <div className="max-h-[48vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-background">
              <tr className="border-b">
                <th className="w-10 px-3 py-2">
                  <button type="button" onClick={toggleFiltrados} title="Marcar/desmarcar os filtrados"
                    className={cn('flex h-4 w-4 items-center justify-center rounded border', filtradosTodosMarcados ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                    {filtradosTodosMarcados && <Check className="h-3 w-3" />}
                  </button>
                </th>
                <SortHead label="Nome" campo="nome" />
                <SortHead label="E-mail" campo="email" className="hidden sm:table-cell" />
                <SortHead label="CPF" campo="cpf" className="hidden md:table-cell" />
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 ? (
                <tr><td colSpan={4} className="py-10 text-center text-muted-foreground">{alunos.length === 0 ? 'Nenhum aluno cadastrado neste tenant.' : 'Nenhum aluno encontrado.'}</td></tr>
              ) : paginaItens.map((a) => {
                const on = acesso.has(a.id)
                return (
                  <tr key={a.id} onClick={() => toggleAcesso(a.id)} className={cn('cursor-pointer border-b transition-colors hover:bg-muted/40', on && 'bg-primary/5')}>
                    <td className="px-3 py-2">
                      <span className={cn('flex h-4 w-4 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>{on && <Check className="h-3 w-3" />}</span>
                    </td>
                    <td className="px-3 py-2"><span className="block truncate font-medium">{a.nome}</span></td>
                    <td className="hidden px-3 py-2 text-muted-foreground sm:table-cell"><span className="block truncate">{a.email ?? '—'}</span></td>
                    <td className="hidden px-3 py-2 font-mono text-xs text-muted-foreground md:table-cell">{a.cpf ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2 text-xs text-muted-foreground">
          <span>{filtrados.length.toLocaleString('pt-BR')} de {alunos.length.toLocaleString('pt-BR')} aluno(s)</span>
          {totalPag > 1 && (
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => setPagina((p) => Math.max(0, p - 1))} disabled={pagina === 0} className="rounded-md border px-2 py-1 font-medium transition-colors hover:bg-muted disabled:opacity-40">Anterior</button>
              <span className="px-1 tabular-nums">Pág. {pagina + 1}/{totalPag}</span>
              <button type="button" onClick={() => setPagina((p) => Math.min(totalPag - 1, p + 1))} disabled={pagina >= totalPag - 1} className="rounded-md border px-2 py-1 font-medium transition-colors hover:bg-muted disabled:opacity-40">Próxima</button>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={salvar} disabled={salvando} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar acesso
        </button>
      </div>
    </div>
  )
}
