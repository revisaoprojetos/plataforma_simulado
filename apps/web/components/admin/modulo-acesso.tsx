'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Save, Search, Users, UserCheck, Info, Check, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ClassificacaoBadge } from '@/components/admin/classificacao-badge'
import { AdicionarEstudantesDialog, type AlunoSel } from '@/components/admin/adicionar-estudantes-dialog'
import { AdicionarGrupoModuloDialog } from '@/components/admin/adicionar-grupo-modulo-dialog'
import {
  carregarAtribuicaoPasta, definirGruposPasta,
  carregarEstudantesPasta, definirEstudantesPasta,
  type EstudanteAcessoLinha,
} from '@/app/admin/leitura/actions'

type Grupo = { id: string; nome: string; cor: string | null }
const POR_PAGINA = 50

function iniciais(n: string) {
  return n.split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join('')
}

// Aba "Acessos" do MÓDULO — MESMO padrão da aba Estudantes do banco: mostra QUEM tem acesso
// (grupos + alunos individuais) com os botões "Adicionar grupo" e "Adicionar estudantes". SEM
// atribuição = liberado a todos. A lista carregada é só a dos VINCULADOS (leve), nunca os ~18k.
export function ModuloAcesso({ pastaId }: { pastaId: string }) {
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [alunos, setAlunos] = useState<EstudanteAcessoLinha[]>([])
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [busca, setBusca] = useState('')
  const [pagina, setPagina] = useState(0)

  useEffect(() => {
    ;(async () => {
      const [a, e] = await Promise.all([carregarAtribuicaoPasta(pastaId), carregarEstudantesPasta(pastaId)])
      if (a.ok && a.grupos) { setGrupos(a.grupos.map((g) => ({ id: g.id, nome: g.nome, cor: g.cor }))); setMarcados(new Set(a.grupos.filter((g) => g.atribuido).map((g) => g.id))) }
      if (e.ok && e.itens) setAlunos(e.itens)
      setCarregando(false)
    })()
  }, [pastaId])

  const gruposComAcesso = useMemo(() => grupos.filter((g) => marcados.has(g.id)), [grupos, marcados])

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return q ? alunos.filter((a) => a.nome.toLowerCase().includes(q) || (a.email ?? '').toLowerCase().includes(q) || (a.cpf ?? '').includes(q)) : alunos
  }, [alunos, busca])
  const totalPag = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))
  const paginaItens = useMemo(() => filtrados.slice(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA), [filtrados, pagina])
  useEffect(() => { setPagina(0) }, [busca])
  useEffect(() => { if (pagina > totalPag - 1) setPagina(0) }, [totalPag, pagina])

  function adicionarAlunos(novos: AlunoSel[]) {
    setAlunos((p) => {
      const existentes = new Set(p.map((a) => a.id))
      const add = novos.filter((n) => !existentes.has(n.id)).map((n): EstudanteAcessoLinha => ({ id: n.id, nome: n.nome, email: n.email, cpf: n.cpf, classificacao: n.classificacao, avatar: n.avatar, perfil_avatar_cor: n.perfil_avatar_cor }))
      return [...add, ...p].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    })
  }
  function adicionarGrupos(ids: string[]) { setMarcados((p) => { const n = new Set(p); ids.forEach((id) => n.add(id)); return n }) }
  function removerGrupo(id: string) { setMarcados((p) => { const n = new Set(p); n.delete(id); return n }) }
  function toggleSel(id: string) { setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  function toggleTodosFiltrados() {
    setSel((p) => { const n = new Set(p); const todos = filtrados.length > 0 && filtrados.every((a) => n.has(a.id)); filtrados.forEach((a) => (todos ? n.delete(a.id) : n.add(a.id))); return n })
  }
  function removerSelecionados() {
    setAlunos((p) => p.filter((a) => !sel.has(a.id)))
    setSel(new Set())
  }

  async function salvar() {
    setSalvando(true)
    const [rg, re] = await Promise.all([definirGruposPasta(pastaId, [...marcados]), definirEstudantesPasta(pastaId, alunos.map((a) => a.id))])
    setSalvando(false)
    if (rg.ok && re.ok) toast.success('Acesso do módulo salvo')
    else toast.error(rg.error ?? re.error ?? 'Erro ao salvar acesso.')
  }

  const acessoIds = useMemo(() => new Set(alunos.map((a) => a.id)), [alunos])
  const semRestricao = marcados.size === 0 && alunos.length === 0
  const filtradosTodosSel = filtrados.length > 0 && filtrados.every((a) => sel.has(a.id))

  if (carregando) return <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando acesso…</div>

  return (
    <div className="space-y-4">
      <div className={cn('flex items-start gap-2 rounded-xl border px-4 py-2.5 text-sm', semRestricao ? 'border-sky-500/30 bg-sky-500/5 text-sky-700 dark:text-sky-300' : 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400')}>
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        {semRestricao
          ? <span>Sem nenhuma atribuição, este módulo fica <strong>liberado para todos</strong> os alunos.</span>
          : <span>Restrito a <strong>{marcados.size}</strong> {marcados.size === 1 ? 'grupo' : 'grupos'} + <strong>{alunos.length}</strong> {alunos.length === 1 ? 'aluno' : 'alunos'} (a união dos dois).</span>}
      </div>

      {/* Grupos com acesso — chips removíveis */}
      <div className="space-y-2 rounded-2xl border bg-card p-4 shadow-sm">
        <p className="flex items-center gap-1.5 text-sm font-semibold"><Users className="h-4 w-4 text-primary" /> Grupos com acesso <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{gruposComAcesso.length}</span></p>
        {gruposComAcesso.length === 0 ? (
          <p className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">Nenhum grupo com acesso. Use “Adicionar grupo”.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {gruposComAcesso.map((g) => (
              <span key={g.id} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] font-medium">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: g.cor ?? '#94a3b8' }} />
                <span className="max-w-[200px] truncate">{g.nome}</span>
                <button type="button" onClick={() => removerGrupo(g.id)} className="rounded-full p-0.5 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600" aria-label="Remover grupo"><X className="h-3.5 w-3.5" /></button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Alunos com acesso — tabela estilo aba Estudantes do banco */}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold"><UserCheck className="h-4 w-4 text-primary" /> Alunos com acesso <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{alunos.length}</span></p>
          <div className="relative ml-auto min-w-48 flex-1 sm:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nos vinculados…" className="w-full rounded-lg border bg-[var(--input-bg,transparent)] py-2 pl-9 pr-3 text-sm outline-none focus:ring-1 focus:ring-ring" />
          </div>
          {sel.size > 0 && (
            <button type="button" onClick={removerSelecionados} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-400/50 px-3 py-2 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-500/10 dark:text-rose-400"><Trash2 className="h-4 w-4" /> Remover {sel.size}</button>
          )}
          <AdicionarGrupoModuloDialog grupos={grupos} jaMarcados={marcados} onSelecionar={adicionarGrupos} />
          <AdicionarEstudantesDialog jaIds={acessoIds} onSelecionar={adicionarAlunos} />
        </div>

        <div className="max-h-[52vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-background">
              <tr className="border-b text-left text-muted-foreground">
                <th className="w-10 px-3 py-2">
                  <button type="button" onClick={toggleTodosFiltrados} title="Marcar/desmarcar os filtrados"
                    className={cn('flex h-4 w-4 items-center justify-center rounded border', filtradosTodosSel ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                    {filtradosTodosSel && <Check className="h-3 w-3" />}
                  </button>
                </th>
                <th className="px-3 py-2 font-medium">Nome</th>
                <th className="hidden px-3 py-2 font-medium sm:table-cell">E-mail</th>
                <th className="hidden px-3 py-2 font-medium md:table-cell">Documento</th>
              </tr>
            </thead>
            <tbody>
              {alunos.length === 0 ? (
                <tr><td colSpan={4} className="py-10 text-center text-muted-foreground">Nenhum aluno individual. Use “Adicionar estudantes” (ou libere por grupo).</td></tr>
              ) : filtrados.length === 0 ? (
                <tr><td colSpan={4} className="py-10 text-center text-muted-foreground">Nenhum aluno encontrado.</td></tr>
              ) : paginaItens.map((a) => {
                const on = sel.has(a.id)
                return (
                  <tr key={a.id} onClick={() => toggleSel(a.id)} className={cn('cursor-pointer border-b transition-colors hover:bg-muted/40', on && 'bg-primary/5')}>
                    <td className="px-3 py-2">
                      <span className={cn('flex h-4 w-4 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>{on && <Check className="h-3 w-3" />}</span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-bold text-primary" style={{ backgroundColor: a.perfil_avatar_cor ?? 'color-mix(in srgb, var(--primary) 12%, transparent)' }}>
                          {a.avatar ? <img src={a.avatar} alt="" className="h-full w-full object-contain object-[center_82%]" /> : iniciais(a.nome)}
                        </span>
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate font-medium">{a.nome}</span>
                          <ClassificacaoBadge classificacao={a.classificacao} />
                        </div>
                      </div>
                    </td>
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
