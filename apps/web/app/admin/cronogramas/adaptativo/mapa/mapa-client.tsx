'use client'

import { Fragment, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, Pencil, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { EntradaMapa, ResumoMapa } from '@/lib/cronograma/adaptativo/mapa-motor'

const POR_PAGINA = 25
const ROTULO_TIPO: Record<string, string> = { limite: 'Limite', limiar: 'Limiar', prioridade: 'Prioridade', interruptor: 'Interruptor', restricao: 'Restrição', constante: 'Constante' }
const CAMADAS = [1, 2, 3, 4, 5, 6, 7, 8]
type Col = 'nome' | 'grupo' | 'tipo' | 'valorVigente' | 'camada'

const chave = (e: EntradaMapa, c: Col): string | number => (c === 'camada' ? (e.camada ?? 99) : c === 'valorVigente' ? e.valorVigente : e[c])
const arquivoCurto = (a: string) => a.replace('lib/cronograma/adaptativo/', '')

export function MapaClient({ linhas, resumo, versao }: { linhas: EntradaMapa[]; resumo: ResumoMapa; versao: number }) {
  const [q, setQ] = useState('')
  const [grupo, setGrupo] = useState('')
  const [tipo, setTipo] = useState('')
  const [camada, setCamada] = useState('')
  const [soDifere, setSoDifere] = useState(false)
  const [ord, setOrd] = useState<Col>('grupo')
  const [asc, setAsc] = useState(true)
  const [pag, setPag] = useState(0)
  const [aberta, setAberta] = useState<string | null>(null)

  const lista = useMemo(() => {
    const b = q.trim().toLowerCase()
    const f = linhas.filter((e) =>
      (!grupo || e.grupo === grupo) && (!tipo || e.tipo === tipo) && (!camada || String(e.camada) === camada) && (!soDifere || e.diferePadrao) &&
      (!b || `${e.nome} ${e.descricao} ${e.path}`.toLowerCase().includes(b)))
    return f.map((e, k) => ({ e, k })).sort((a, c) => {
      const x = chave(a.e, ord), y = chave(c.e, ord)
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'pt-BR', { numeric: true })
      return (r || a.k - c.k) * (asc ? 1 : -1)
    }).map((z) => z.e)
  }, [linhas, q, grupo, tipo, camada, soDifere, ord, asc])

  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA))
  const p = Math.min(pag, paginas - 1)
  const visiveis = lista.slice(p * POR_PAGINA, (p + 1) * POR_PAGINA)
  const filtrar = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPag(0) }

  const Th = ({ c, children }: { c: Col; children: string }) => (
    <th className="px-3 py-2 text-left font-medium">
      <button type="button" onClick={() => { if (ord === c) setAsc(!asc); else { setOrd(c); setAsc(true) } }} className="inline-flex items-center gap-1 hover:text-foreground">
        {children}{ord === c ? (asc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </th>
  )

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border bg-card p-4 shadow-sm"><p className="text-xs text-muted-foreground">Parâmetros mapeados</p><p className="text-2xl font-bold tabular-nums">{resumo.total}</p></div>
        <div className="rounded-2xl border bg-card p-4 shadow-sm"><p className="text-xs text-muted-foreground">Diferem do padrão</p><p className={cn('text-2xl font-bold tabular-nums', resumo.diferem > 0 && 'text-primary')}>{resumo.diferem}</p></div>
        <div className="rounded-2xl border bg-card p-4 shadow-sm"><p className="text-xs text-muted-foreground">Regras vigentes</p><p className="text-2xl font-bold tabular-nums">{versao ? `versão ${versao}` : 'padrão'}</p></div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {resumo.porGrupo.map((g) => (
          <button key={g.grupo} type="button" onClick={() => filtrar(setGrupo)(grupo === g.grupo ? '' : g.grupo)}
            className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium transition', grupo === g.grupo ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
            {g.grupo} · {g.total}{g.diferem > 0 && <span className="ml-1 font-semibold text-primary">({g.diferem} alterado{g.diferem > 1 ? 's' : ''})</span>}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => filtrar(setQ)(e.target.value)} placeholder="Buscar por nome, descrição ou caminho" className="h-9 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <select value={grupo} onChange={(e) => filtrar(setGrupo)(e.target.value)} className="h-9 rounded-xl border border-input bg-background px-3 text-sm">
          <option value="">Todos os grupos</option>
          {resumo.porGrupo.map((g) => <option key={g.grupo} value={g.grupo}>{g.grupo}</option>)}
        </select>
        <select value={tipo} onChange={(e) => filtrar(setTipo)(e.target.value)} className="h-9 rounded-xl border border-input bg-background px-3 text-sm">
          <option value="">Todos os tipos</option>
          {Object.entries(ROTULO_TIPO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={camada} onChange={(e) => filtrar(setCamada)(e.target.value)} className="h-9 rounded-xl border border-input bg-background px-3 text-sm">
          <option value="">Todas as camadas</option>
          {CAMADAS.map((c) => <option key={c} value={c}>Camada {c}</option>)}
        </select>
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xl border border-input bg-background px-3 text-sm">
          <input type="checkbox" checked={soDifere} onChange={(e) => filtrar(setSoDifere)(e.target.checked)} /> Só o que difere do padrão
        </label>
      </div>

      <p className="text-xs text-muted-foreground">{lista.length} parâmetro(s) · página {p + 1} de {paginas}</p>

      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground"><tr>
            <th className="w-8 px-2 py-2" />
            <Th c="nome">Parâmetro</Th><Th c="grupo">Grupo</Th><Th c="tipo">Tipo</Th><Th c="valorVigente">Vigente</Th><th className="px-3 py-2 text-left font-medium">Padrão</th><Th c="camada">Camada</Th>
          </tr></thead>
          <tbody>
            {visiveis.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Nenhum parâmetro encontrado.</td></tr>}
            {visiveis.map((e) => {
              const aberto = aberta === e.path
              return (
                <Fragment key={e.path}>
                  <tr onClick={() => setAberta(aberto ? null : e.path)} className={cn('cursor-pointer border-t border-border transition hover:bg-muted/40', aberto && 'bg-primary/5')}>
                    <td className="px-2 py-2 text-muted-foreground">{aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                    <td className="px-3 py-2 font-medium">{e.nome}</td>
                    <td className="px-3 py-2 text-muted-foreground">{e.grupo}</td>
                    <td className="px-3 py-2"><span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">{ROTULO_TIPO[e.tipo]}</span></td>
                    <td className={cn('max-w-64 truncate px-3 py-2 tabular-nums', e.diferePadrao && 'font-semibold text-primary')} title={e.valorVigente}>{e.valorVigente}</td>
                    <td className="max-w-48 truncate px-3 py-2 tabular-nums text-muted-foreground" title={e.valorPadrao}>{e.valorPadrao}</td>
                    <td className="px-3 py-2 tabular-nums">{e.camada ?? '—'}</td>
                  </tr>
                  {aberto && (
                    <tr className="border-t border-border bg-muted/20">
                      <td colSpan={7} className="px-4 py-3"><Detalhe e={e} /></td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {paginas > 1 && (
        <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
          <button type="button" disabled={p === 0} onClick={() => setPag(0)} className="h-8 rounded-lg border px-3 disabled:opacity-40">Início</button>
          <button type="button" disabled={p === 0} onClick={() => setPag(p - 1)} className="h-8 rounded-lg border px-3 disabled:opacity-40">Anterior</button>
          <button type="button" disabled={p >= paginas - 1} onClick={() => setPag(p + 1)} className="h-8 rounded-lg border px-3 disabled:opacity-40">Próxima</button>
          <button type="button" disabled={p >= paginas - 1} onClick={() => setPag(paginas - 1)} className="h-8 rounded-lg border px-3 disabled:opacity-40">Final</button>
        </div>
      )}
    </div>
  )
}

function Detalhe({ e }: { e: EntradaMapa }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">O que é</p><p className="mt-1 text-sm">{e.descricao}</p></div>
        <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Impacto ao alterar</p><p className="mt-1 text-sm">{e.impacto}</p></div>
        <div className="grid grid-cols-2 gap-3">
          <div className={cn('rounded-xl border p-3', e.diferePadrao ? 'border-primary/40 bg-primary/5' : 'border-border bg-card')}>
            <p className="text-xs text-muted-foreground">Vigente{e.diferePadrao ? ' (difere do padrão)' : ''}</p><p className={cn('mt-0.5 break-words text-sm font-semibold', e.diferePadrao && 'text-primary')}>{e.valorVigente}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3"><p className="text-xs text-muted-foreground">Padrão</p><p className="mt-0.5 break-words text-sm font-semibold">{e.valorPadrao}</p></div>
        </div>
      </div>
      <div className="space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Onde é aplicado</p>
          {e.onde.length ? <ul className="mt-1 space-y-1 text-sm">{e.onde.map((o) => <li key={o.arquivo + o.funcao}><code className="rounded-md bg-muted px-1.5 py-0.5 text-xs">{arquivoCurto(o.arquivo)}</code> › <code className="rounded-md bg-muted px-1.5 py-0.5 text-xs">{o.funcao}</code></li>)}</ul>
            : <p className="mt-1 text-sm text-muted-foreground">Só dados (sem efeito direto no cálculo).</p>}
        </div>
        <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Camada da precedência</p><p className="mt-1 text-sm">{e.camada ? `${e.camada}. ${e.nomeCamada}` : 'Fora das 8 camadas (parâmetro geral ou de diagnóstico).'}</p></div>
        <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Testes que cobrem</p><ul className="mt-1 space-y-1 text-sm">{e.testes.map((t) => <li key={t}><code className="rounded-md bg-muted px-1.5 py-0.5 text-xs">{t.replace('lib/cronograma/adaptativo/', '')}</code></li>)}</ul></div>
        <div className="flex flex-wrap items-center gap-3">
          <code className="rounded-md bg-muted px-1.5 py-0.5 text-xs">{e.path}</code>
          <Link href={e.href} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-input bg-background px-3 text-sm font-medium text-primary hover:bg-muted"><Pencil className="h-3.5 w-3.5" />Editar</Link>
        </div>
      </div>
    </div>
  )
}
