'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Save, Search, Users, UserCheck, Info, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ClassificacaoBadge } from '@/components/admin/classificacao-badge'
import {
  carregarAtribuicaoPasta, definirGruposPasta,
  carregarEstudantesPasta, definirEstudantesPasta, listarEstudantesTenantPag,
  type EstudanteAcessoLinha,
} from '@/app/admin/leitura/actions'

type Grupo = { id: string; nome: string; cor: string | null; atribuido: boolean }
const POR_PAGINA = 50

function iniciais(n: string) {
  return n.split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join('')
}

// Aba "Acessos" do MÓDULO — visual da aba Estudantes do banco (avatar + badge + colunas), porém
// com paginação SERVER-SIDE (busca + range no banco): não puxa todos os ~18k alunos. Define QUEM vê a
// trilha do módulo: grupos + alunos (união). SEM atribuição = liberado a todos.
export function ModuloAcesso({ pastaId }: { pastaId: string }) {
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [acesso, setAcesso] = useState<Set<string>>(new Set())
  const [busca, setBusca] = useState('')
  const [alunos, setAlunos] = useState<EstudanteAcessoLinha[]>([])
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(0)
  const [carregandoLista, setCarregandoLista] = useState(true)

  // Grupos + alunos já atribuídos (seleção) — leve, só os vinculados.
  useEffect(() => {
    ;(async () => {
      const [a, e] = await Promise.all([carregarAtribuicaoPasta(pastaId), carregarEstudantesPasta(pastaId)])
      if (a.ok && a.grupos) { setGrupos(a.grupos); setMarcados(new Set(a.grupos.filter((g) => g.atribuido).map((g) => g.id))) }
      if (e.ok && e.itens) setAcesso(new Set(e.itens.map((x) => x.id)))
      setCarregando(false)
    })()
  }, [pastaId])

  // Reset de página ao buscar.
  useEffect(() => { setPagina(0) }, [busca])
  // Lista paginada no SERVIDOR (debounce na busca).
  useEffect(() => {
    let vivo = true
    setCarregandoLista(true)
    const t = setTimeout(async () => {
      const r = await listarEstudantesTenantPag(busca, pagina * POR_PAGINA, POR_PAGINA)
      if (!vivo) return
      setCarregandoLista(false)
      if (r.ok) { setAlunos(r.itens ?? []); setTotal(r.total ?? 0) }
      else toast.error(r.error ?? 'Erro ao listar alunos')
    }, 250)
    return () => { vivo = false; clearTimeout(t) }
  }, [busca, pagina])

  const totalPag = Math.max(1, Math.ceil(total / POR_PAGINA))
  const pageMarcada = alunos.length > 0 && alunos.every((a) => acesso.has(a.id))
  function toggleAcesso(id: string) { setAcesso((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  function togglePagina() {
    setAcesso((p) => { const n = new Set(p); if (pageMarcada) alunos.forEach((a) => n.delete(a.id)); else alunos.forEach((a) => n.add(a.id)); return n })
  }
  function toggleGrupo(id: string) { setMarcados((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }

  async function salvar() {
    setSalvando(true)
    const [rg, re] = await Promise.all([definirGruposPasta(pastaId, [...marcados]), definirEstudantesPasta(pastaId, [...acesso])])
    setSalvando(false)
    if (rg.ok && re.ok) toast.success('Acesso do módulo salvo')
    else toast.error(rg.error ?? re.error ?? 'Erro ao salvar acesso.')
  }

  const semRestricao = marcados.size === 0 && acesso.size === 0

  if (carregando) return <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando acesso…</div>

  return (
    <div className="space-y-4">
      <div className={cn('flex items-start gap-2 rounded-xl border px-4 py-2.5 text-sm', semRestricao ? 'border-sky-500/30 bg-sky-500/5 text-sky-700 dark:text-sky-300' : 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400')}>
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        {semRestricao
          ? <span>Sem nenhuma atribuição, este módulo fica <strong>liberado para todos</strong> os alunos.</span>
          : <span>Restrito a <strong>{marcados.size}</strong> {marcados.size === 1 ? 'grupo' : 'grupos'} + <strong>{acesso.size}</strong> {acesso.size === 1 ? 'aluno' : 'alunos'} (a união dos dois).</span>}
      </div>

      {/* Grupos com acesso */}
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

      {/* Alunos — tabela estilo aba Estudantes do banco (server-paginada) */}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold"><UserCheck className="h-4 w-4 text-primary" /> Alunos com acesso <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{acesso.size}</span></p>
          <div className="relative ml-auto min-w-48 flex-1 sm:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, e-mail ou CPF…" className="w-full rounded-lg border bg-[var(--input-bg,transparent)] py-2 pl-9 pr-3 text-sm outline-none focus:ring-1 focus:ring-ring" />
          </div>
        </div>

        <div className="max-h-[52vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-background">
              <tr className="border-b text-left text-muted-foreground">
                <th className="w-10 px-3 py-2">
                  <button type="button" onClick={togglePagina} title="Marcar/desmarcar os desta página"
                    className={cn('flex h-4 w-4 items-center justify-center rounded border', pageMarcada ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                    {pageMarcada && <Check className="h-3 w-3" />}
                  </button>
                </th>
                <th className="px-3 py-2 font-medium">Nome</th>
                <th className="hidden px-3 py-2 font-medium sm:table-cell">E-mail</th>
                <th className="hidden px-3 py-2 font-medium md:table-cell">Documento</th>
              </tr>
            </thead>
            <tbody>
              {carregandoLista ? (
                <tr><td colSpan={4} className="py-10 text-center text-muted-foreground"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></td></tr>
              ) : alunos.length === 0 ? (
                <tr><td colSpan={4} className="py-10 text-center text-muted-foreground">Nenhum aluno encontrado.</td></tr>
              ) : alunos.map((a) => {
                const on = acesso.has(a.id)
                return (
                  <tr key={a.id} onClick={() => toggleAcesso(a.id)} className={cn('cursor-pointer border-b transition-colors hover:bg-muted/40', on && 'bg-primary/5')}>
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
          <span>{total.toLocaleString('pt-BR')} aluno(s){acesso.size > 0 && <> · <strong className="text-foreground">{acesso.size}</strong> com acesso</>}</span>
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
