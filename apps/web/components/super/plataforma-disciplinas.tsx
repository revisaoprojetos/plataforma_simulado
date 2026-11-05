'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Loader2, Plus, Search, BookOpen, CheckCircle2, Copy } from 'lucide-react'
import { listarDisciplinasPlataforma, adicionarDisciplinasPlataforma, type DisciplinaAtual, type DisciplinaDisponivel, type PlataformaCol, type DisciplinaTodas } from '@/app/admin/tenants/disciplinas-actions'
import { chaveSemantica } from '@/lib/taxonomia/disciplina-semantica'

const ROT_CLASS: Record<string, string> = { essencial: 'Essencial', complementar: 'Complementar', especifica: 'Específica' }

/** Disciplinas da plataforma + adicionar as que existem nas outras (linhas próprias → controle por plataforma). */
export function PlataformaDisciplinas({ tenantId, nomePlataforma }: { tenantId: string; nomePlataforma: string }) {
  const [atuais, setAtuais] = useState<DisciplinaAtual[] | null>(null)
  const [disp, setDisp] = useState<DisciplinaDisponivel[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [plataformas, setPlataformas] = useState<PlataformaCol[]>([])
  const [todas, setTodas] = useState<DisciplinaTodas[]>([])
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [herdar, setHerdar] = useState(true)
  const [busca, setBusca] = useState('')
  const [pending, start] = useTransition()

  const carregar = useCallback(async () => {
    const r = await listarDisciplinasPlataforma(tenantId)
    if (!r.ok) { setErro(r.error ?? 'Falha ao carregar.'); setAtuais([]); return }
    setErro(null); setAtuais(r.atuais ?? []); setDisp(r.disponiveis ?? []); setPlataformas(r.plataformas ?? []); setTodas(r.todas ?? []); setSel(new Set())
  }, [tenantId])
  useEffect(() => { carregar() }, [carregar])

  // MATRIZ: uma linha por matéria (mesma chave semântica), uma coluna por PLATAFORMA (nomeada) — a atual vem primeiro
  const matriz = useMemo(() => {
    const m = new Map<string, { nome: string; cel: Map<string, DisciplinaTodas> }>()
    for (const d of todas) {
      const k = chaveSemantica(d.nome) || d.nome.toLowerCase()
      const g = m.get(k) ?? { nome: d.nome, cel: new Map<string, DisciplinaTodas>() }
      if (!g.cel.has(d.tenant_id)) g.cel.set(d.tenant_id, d)
      if (d.tenant_id === tenantId) g.nome = d.nome
      m.set(k, g)
    }
    return [...m.entries()].map(([k, g]) => ({ k, ...g })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [todas, tenantId])
  const q = busca.trim().toLowerCase()
  const dispFiltradas = useMemo(() => (q ? disp.filter((d) => d.nome.toLowerCase().includes(q)) : disp), [disp, q])
  const todasMarcadas = dispFiltradas.length > 0 && dispFiltradas.every((d) => sel.has(d.chave))

  function alternar(chave: string) { setSel((s) => { const n = new Set(s); if (n.has(chave)) n.delete(chave); else n.add(chave); return n }) }
  function marcarTodas() { setSel((s) => { const n = new Set(s); for (const d of dispFiltradas) { if (todasMarcadas) n.delete(d.chave); else n.add(d.chave) } return n }) }

  function adicionar() {
    const itens = disp.filter((d) => sel.has(d.chave)).map((d) => ({ nome: d.nome, classificacao: d.classificacao, cor: d.cor, ordem: d.ordem }))
    if (!itens.length) return
    start(async () => {
      const r = await adicionarDisciplinasPlataforma(tenantId, itens, herdar)
      if (!r.ok) { toast.error(r.error || 'Não foi possível adicionar.'); await carregar(); return }
      toast.success(`${r.criadas} disciplina${r.criadas === 1 ? '' : 's'} adicionada${r.criadas === 1 ? '' : 's'}${r.jaExistiam ? ` · ${r.jaExistiam} já existia${r.jaExistiam === 1 ? '' : 'm'}` : ''}.`)
      await carregar()
    })
  }

  if (atuais === null) return <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando disciplinas…</div>

  return (
    <div className="space-y-6">
      {erro && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{erro}</div>}

      <section className="space-y-3">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold"><BookOpen className="h-4 w-4" /> Disciplinas de {nomePlataforma} <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{atuais.length}</span></h3>
          <p className="text-xs text-muted-foreground">Cada plataforma tem as suas disciplinas, com classificação, cor e ordem independentes das outras.</p>
        </div>
        {atuais.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">Nenhuma disciplina ainda. Adicione abaixo as que existem nas outras plataformas.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-3 py-2">Disciplina</th><th className="hidden px-3 py-2 sm:table-cell">Classificação</th><th className="hidden px-3 py-2 sm:table-cell">Cor</th></tr>
              </thead>
              <tbody>
                {atuais.map((d) => (
                  <tr key={d.id} className="border-b last:border-0">
                    <td className="px-3 py-2 font-medium">{d.nome}</td>
                    <td className="hidden px-3 py-2 text-muted-foreground sm:table-cell">{d.classificacao ? ROT_CLASS[d.classificacao] ?? d.classificacao : '—'}</td>
                    <td className="hidden px-3 py-2 sm:table-cell">
                      {d.cor ? <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><span className="h-3 w-3 rounded-full border" style={{ background: d.cor }} />{d.cor}</span> : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {plataformas.length > 1 && matriz.length > 0 && (
        <section className="space-y-3 border-t pt-5">
          <div>
            <h3 className="text-sm font-semibold">Comparativo entre plataformas</h3>
            <p className="text-xs text-muted-foreground">Cada coluna é uma plataforma; a atual vem primeiro. A letra é a classificação (E essencial · C complementar · Esp. específica); ✓ = existe sem classificação; — = não tem.</p>
          </div>
          <div className="max-h-[28rem] overflow-auto rounded-2xl border bg-card shadow-sm">
            <table className="w-full min-w-max text-sm">
              <thead className="sticky top-0 z-10 border-b bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="sticky left-0 bg-muted px-3 py-2">Disciplina</th>
                  {plataformas.map((p) => (
                    <th key={p.id} className={`px-3 py-2 text-center ${p.id === tenantId ? 'bg-primary/10 text-primary' : ''}`} title={p.nome}>{p.nome}{p.id === tenantId ? ' (esta)' : ''}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matriz.map((r) => (
                  <tr key={r.k} className="border-b last:border-0">
                    <td className="sticky left-0 bg-card px-3 py-1.5 font-medium">{r.nome}</td>
                    {plataformas.map((p) => {
                      const c = r.cel.get(p.id)
                      const rot = c?.classificacao === 'essencial' ? 'E' : c?.classificacao === 'complementar' ? 'C' : c?.classificacao === 'especifica' ? 'Esp.' : null
                      return (
                        <td key={p.id} className={`px-3 py-1.5 text-center ${p.id === tenantId ? 'bg-primary/5' : ''}`} title={c ? `${c.nome}${c.classificacao ? ` · ${ROT_CLASS[c.classificacao] ?? c.classificacao}` : ''}` : 'não tem'}>
                          {!c ? <span className="text-muted-foreground/50">—</span> : rot ? <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-semibold">{rot}</span> : <span className="text-emerald-600">✓</span>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="space-y-3 border-t pt-5">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Copy className="h-4 w-4" /> Adicionar das outras plataformas <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{disp.length}</span></h3>
          <p className="text-xs text-muted-foreground">Só aparecem as que esta plataforma ainda não tem. O cruzamento considera nome igual, alias e a mesma matéria escrita de outro jeito (ex.: “Processo Civil” ≡ “Direito Processual Civil”), então não cria duplicada.</p>
        </div>
        {disp.length === 0 ? (
          <p className="flex items-center gap-1.5 rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Esta plataforma já tem todas as disciplinas das outras.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-52 flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar disciplina…" aria-label="Buscar disciplina" className="h-9 w-full rounded-lg border bg-background pl-8 pr-2 text-sm" />
              </div>
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={herdar} onChange={(e) => setHerdar(e.target.checked)} /> Copiar classificação, cor e ordem</label>
              <button type="button" onClick={adicionar} disabled={pending || sel.size === 0}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40">
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Adicionar {sel.size > 0 ? `(${sel.size})` : ''}
              </button>
            </div>
            <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="w-10 px-3 py-2"><input type="checkbox" checked={todasMarcadas} onChange={marcarTodas} aria-label="Marcar todas" /></th>
                    <th className="px-3 py-2">Disciplina</th>
                    <th className="hidden px-3 py-2 sm:table-cell">Classificação</th>
                    <th className="hidden px-3 py-2 md:table-cell">Existe em</th>
                  </tr>
                </thead>
                <tbody>
                  {dispFiltradas.map((d) => (
                    <tr key={d.chave} onClick={() => alternar(d.chave)} className={`cursor-pointer border-b last:border-0 hover:bg-muted/40 ${sel.has(d.chave) ? 'bg-primary/5' : ''}`}>
                      <td className="px-3 py-2"><input type="checkbox" checked={sel.has(d.chave)} onChange={() => alternar(d.chave)} onClick={(e) => e.stopPropagation()} aria-label={`Selecionar ${d.nome}`} /></td>
                      <td className="px-3 py-2 font-medium">{d.nome}</td>
                      <td className="hidden px-3 py-2 text-muted-foreground sm:table-cell">{d.classificacao ? ROT_CLASS[d.classificacao] ?? d.classificacao : '—'}</td>
                      <td className="hidden px-3 py-2 text-xs text-muted-foreground md:table-cell">{d.origens.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
