'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { BookOpen, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, History, Search } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { faixaSemanal } from '@/lib/cronograma/faixa'
import type { CronogramaDoAluno } from '@/lib/cronograma/acesso'
import type { EmissaoResumo } from './emissoes-actions'

const POR_PAGINA = 10
const fmtData = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—')
const VIA_ROTULO: Record<string, string> = { pacote: 'Pacote', matricula: 'Matrícula', avulso: 'Avulso', testador: 'Testador' }
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function Paginacao({ pagina, setPagina, total }: { pagina: number; setPagina: (n: number) => void; total: number }) {
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))
  if (paginas <= 1) return null
  const btn = 'flex h-8 min-w-8 items-center justify-center rounded-lg border px-1.5 text-xs transition hover:bg-muted disabled:opacity-40'
  return (
    <div className="mt-auto flex items-center justify-between gap-2 pt-3">
      <span className="text-xs text-muted-foreground">Página {pagina + 1} de {paginas}</span>
      <div className="flex gap-1">
        <button className={btn} onClick={() => setPagina(0)} disabled={pagina === 0} title="Início"><ChevronsLeft className="h-3.5 w-3.5" /></button>
        <button className={btn} onClick={() => setPagina(Math.max(0, pagina - 1))} disabled={pagina === 0} title="Anterior"><ChevronLeft className="h-3.5 w-3.5" /></button>
        <button className={btn} onClick={() => setPagina(Math.min(paginas - 1, pagina + 1))} disabled={pagina >= paginas - 1} title="Próxima"><ChevronRight className="h-3.5 w-3.5" /></button>
        <button className={btn} onClick={() => setPagina(paginas - 1)} disabled={pagina >= paginas - 1} title="Final"><ChevronsRight className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  )
}

/** Histórico de criação: emissões do aluno, com busca (nome), filtro (cronograma base) e paginação 10. */
export function HistoricoTabela({ itens, salvos }: { itens: EmissaoResumo[]; salvos: number }) {
  const [busca, setBusca] = useState('')
  const [base, setBase] = useState('todos')
  const [pagina, setPagina] = useState(0)
  useEffect(() => setPagina(0), [busca, base])

  const bases = useMemo(() => [...new Set(itens.map((i) => i.cronograma_nome))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [itens])
  const filtrados = useMemo(() => {
    const q = norm(busca.trim())
    return itens.filter((i) => (base === 'todos' || i.cronograma_nome === base) && (!q || norm(`${i.titulo ?? ''} ${i.cronograma_nome}`).includes(q)))
  }, [itens, busca, base])
  const pag = filtrados.slice(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA)

  return (
    <Card className="flex flex-col p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4 text-primary" /> Histórico de criação</h2>
        {salvos > 0 && <Link href="/aluno/cronograma/meus" className="text-xs font-medium text-primary hover:underline">Ver todos ({salvos})</Link>}
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar…" className="h-9 pl-8" />
        </div>
        <Select value={base} onValueChange={(v) => setBase(v ?? 'todos')}>
          <SelectTrigger className="h-9 w-40"><SelectValue>{base === 'todos' ? 'Todos os cronogramas' : base}</SelectValue></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os cronogramas</SelectItem>
            {bases.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {filtrados.length === 0 ? (
        <p className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">
          {itens.length === 0 ? 'Você ainda não gerou nenhum cronograma. Monte o primeiro acima.' : 'Nada encontrado.'}
        </p>
      ) : (
        <>
          <table className="w-full table-fixed text-sm">
            <colgroup><col /><col className="w-24 sm:w-28" /><col className="w-8" /></colgroup>
            <thead>
              <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="py-2 font-medium">Cronograma</th>
                <th className="py-2 font-medium">Criado em</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pag.map((e) => (
                <tr key={e.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="py-2">
                    <Link href={`/aluno/cronograma/${e.id}`} className="block">
                      <span className="block truncate font-medium">{e.titulo || e.cronograma_nome}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {e.titulo ? e.cronograma_nome : ''}{e.resumo?.totalSemanas ? `${e.titulo ? ' · ' : ''}${e.resumo.totalSemanas} semanas` : ''}
                      </span>
                    </Link>
                  </td>
                  <td className="py-2 text-xs tabular-nums text-muted-foreground">{fmtData(e.criado_em)}</td>
                  <td className="py-2 text-right"><Link href={`/aluno/cronograma/${e.id}`} aria-label="Abrir"><ChevronRight className="h-4 w-4 text-muted-foreground" /></Link></td>
                </tr>
              ))}
              {/* Preenche até 10 linhas: mantém a altura fixa e o espaço embaixo vazio. */}
              {Array.from({ length: POR_PAGINA - pag.length }).map((_, i) => (
                <tr key={`f${i}`} aria-hidden>
                  <td className="py-2"><span className="block">&nbsp;</span><span className="block text-xs">&nbsp;</span></td>
                  <td className="py-2" /><td className="py-2" />
                </tr>
              ))}
            </tbody>
          </table>
          <Paginacao pagina={pagina} setPagina={setPagina} total={filtrados.length} />
        </>
      )}
    </Card>
  )
}

/** Cronogramas liberados: catálogo do aluno, com busca (nome), filtro (via) e paginação 10. */
export function LiberadosTabela({ itens }: { itens: CronogramaDoAluno[] }) {
  const [busca, setBusca] = useState('')
  const [via, setVia] = useState('todas')
  const [pagina, setPagina] = useState(0)
  useEffect(() => setPagina(0), [busca, via])

  const vias = useMemo(() => [...new Set(itens.map((i) => i.via))], [itens])
  const filtrados = useMemo(() => {
    const q = norm(busca.trim())
    return itens.filter((c) => (via === 'todas' || c.via === via) && (!q || norm(c.nome).includes(q)))
  }, [itens, busca, via])
  const pag = filtrados.slice(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA)

  return (
    <Card className="flex flex-col p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><BookOpen className="h-4 w-4 text-primary" /> Cronogramas liberados para você</h2>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar…" className="h-9 pl-8" />
        </div>
        <Select value={via} onValueChange={(v) => setVia(v ?? 'todas')}>
          <SelectTrigger className="h-9 w-36"><SelectValue>{via === 'todas' ? 'Todas as vias' : VIA_ROTULO[via] ?? via}</SelectValue></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as vias</SelectItem>
            {vias.map((v) => <SelectItem key={v} value={v}>{VIA_ROTULO[v] ?? v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {filtrados.length === 0 ? (
        <p className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">
          {itens.length === 0 ? 'Nenhum cronograma liberado no momento.' : 'Nada encontrado.'}
        </p>
      ) : (
        <>
          <table className="w-full table-fixed text-sm">
            <colgroup><col /><col className="w-24 sm:w-28" /><col className="w-20" /></colgroup>
            <thead>
              <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="py-2 font-medium">Cronograma</th>
                <th className="py-2 font-medium">Desde</th>
                <th className="py-2 font-medium">Via</th>
              </tr>
            </thead>
            <tbody>
              {pag.map((c) => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="py-2">
                    <span className="block truncate font-medium">{c.nome}</span>
                    <span className="block truncate text-xs text-muted-foreground">{c.carga_horaria}h · {faixaSemanal(c.dias_curso)}</span>
                  </td>
                  <td className="py-2 text-xs tabular-nums text-muted-foreground">{fmtData(c.criado_em)}</td>
                  <td className="py-2">
                    <span className="inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{VIA_ROTULO[c.via] ?? c.via}</span>
                  </td>
                </tr>
              ))}
              {/* Preenche até 10 linhas: mantém a altura fixa e o espaço embaixo vazio. */}
              {Array.from({ length: POR_PAGINA - pag.length }).map((_, i) => (
                <tr key={`f${i}`} aria-hidden>
                  <td className="py-2"><span className="block">&nbsp;</span><span className="block text-xs">&nbsp;</span></td>
                  <td className="py-2" /><td className="py-2" />
                </tr>
              ))}
            </tbody>
          </table>
          <Paginacao pagina={pagina} setPagina={setPagina} total={filtrados.length} />
        </>
      )}
    </Card>
  )
}
