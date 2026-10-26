'use client'
// 03b §2.4 — Alunos COM acesso a este conteúdo. Dados REAIS: aluno, recebeu por, situação, último acesso,
// grifos. Expandir linha = registro de acessos (carregarRegistroAluno). Colunas de métrica sem pipeline
// (Visualizações/Downloads/Sessões/Offline, barra de leitura/assistido) → "—"/"em construção", sem inventar.

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, ChevronsUpDown, Search, FileDown, BellRing, Loader2, Monitor } from 'lucide-react'
import type { AlunoAcesso, EventoRegistro, GestaoBase } from '@/app/admin/biblioteca/gestao-actions'
import { carregarRegistroAluno } from '@/app/admin/biblioteca/gestao-actions'
import type { GestaoTipo } from '@/lib/biblioteca/gestao-tipos'
import { Chip } from '@/components/biblioteca/pilulas'
import { AvatarAluno, OrigemBadge, SituacaoBadge, Vazio, fmtDataHora } from './ui'
import { toast } from 'sonner'

type SortKey = 'nome' | 'ultimo' | 'grifos'
type Filtro = 'todos' | 'concluiram' | 'lendo' | 'nao_abriram' | 'via_pacote' | 'avulsa_individual'

export function AbaAlunos({ base, itens, total, tipo }: { base: GestaoBase; itens: AlunoAcesso[]; total: number; tipo: GestaoTipo }) {
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: 'ultimo', dir: -1 })
  const [expandido, setExpandido] = useState<string | null>(null)

  const contagem = useMemo(() => ({
    todos: itens.length,
    concluiram: itens.filter((a) => a.situacao === 'concluiu').length,
    lendo: itens.filter((a) => a.situacao === 'lendo').length,
    nao_abriram: itens.filter((a) => a.situacao === 'nao_abriu').length,
    via_pacote: itens.filter((a) => a.recebidoPor.origem === 'via_pacote').length,
    avulsa_individual: itens.filter((a) => a.recebidoPor.origem !== 'via_pacote').length,
  }), [itens])

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    let r = itens.filter((a) => {
      if (filtro === 'concluiram' && a.situacao !== 'concluiu') return false
      if (filtro === 'lendo' && a.situacao !== 'lendo') return false
      if (filtro === 'nao_abriram' && a.situacao !== 'nao_abriu') return false
      if (filtro === 'via_pacote' && a.recebidoPor.origem !== 'via_pacote') return false
      if (filtro === 'avulsa_individual' && a.recebidoPor.origem === 'via_pacote') return false
      if (q && !(`${a.nome} ${a.email ?? ''} ${a.cpfMasc}`.toLowerCase().includes(q))) return false
      return true
    })
    r = [...r].sort((a, b) => {
      let c = 0
      if (sort.k === 'nome') c = a.nome.localeCompare(b.nome)
      else if (sort.k === 'grifos') c = a.grifos - b.grifos
      else c = String(a.ultimoAcesso ?? '').localeCompare(String(b.ultimoAcesso ?? ''))
      return c * sort.dir
    })
    return r
  }, [itens, busca, filtro, sort])

  function th(k: SortKey, label: string, extra = '') {
    const ativo = sort.k === k
    const Ic = !ativo ? ChevronsUpDown : sort.dir === 1 ? ChevronUp : ChevronDown
    return (
      <button onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : 1 }))} className={`inline-flex items-center gap-1 ${extra} ${ativo ? 'text-foreground' : ''}`}>
        {label}<Ic className="h-3 w-3" />
      </button>
    )
  }

  const chips: [Filtro, string, number][] = [
    ['todos', 'Todos', contagem.todos], ['concluiram', 'Concluíram', contagem.concluiram], ['lendo', 'Lendo', contagem.lendo],
    ['nao_abriram', 'Não abriram', contagem.nao_abriram], ['via_pacote', 'Via pacote', contagem.via_pacote], ['avulsa_individual', 'Avulsa/individual', contagem.avulsa_individual],
  ]

  if (total === 0) return <Vazio>Nenhum aluno acessou ainda: o conteúdo não foi liberado.</Vazio>

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">Mostrando <strong className="text-foreground">{filtrados.length}</strong> de {total}</div>
        <div className="flex items-center gap-2">
          <button onClick={() => toast.info('Exportar CSV — em construção.')} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-muted"><FileDown className="h-3.5 w-3.5" />Exportar CSV</button>
          <button onClick={() => toast.info('Lembrete — em construção (depende de notificações).')} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-muted"><BellRing className="h-3.5 w-3.5" />Lembrar quem não abriu ({contagem.nao_abriram})</button>
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, e-mail ou CPF" className="h-9 w-full rounded-lg border bg-background pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/30" />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {chips.map(([k, label, n]) => <Chip key={k} ativo={filtro === k} onClick={() => setFiltro(k)}>{label} <span className="opacity-70">{n}</span></Chip>)}
      </div>

      <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-semibold">{th('nome', 'Aluno')}</th>
              <th className="px-4 py-2.5 font-semibold">Recebeu por</th>
              <th className="px-4 py-2.5 font-semibold">Situação</th>
              <th className="px-4 py-2.5 font-semibold">{th('ultimo', 'Último acesso')}</th>
              <th className="px-4 py-2.5 text-center font-semibold">{tipo.colsAlunos[0]}</th>
              <th className="px-4 py-2.5 text-center font-semibold">{tipo.colsAlunos[1]}</th>
              <th className="px-4 py-2.5 text-center font-semibold">{th('grifos', tipo.colsAlunos[2], 'justify-center')}</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {filtrados.map((a) => (
              <LinhaAluno key={a.id} a={a} base={base} aberta={expandido === a.id} onToggle={() => setExpandido((p) => p === a.id ? null : a.id)} tipo={tipo} />
            ))}
            {filtrados.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">Nenhum aluno com esse filtro.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">Horários de Brasília · IP mascarado (LGPD) · colunas de métrica (visualizações, downloads, barra de progresso) dependem do pipeline de eventos, em construção.</p>
    </div>
  )
}

function LinhaAluno({ a, base, aberta, onToggle, tipo }: { a: AlunoAcesso; base: GestaoBase; aberta: boolean; onToggle: () => void; tipo: GestaoTipo }) {
  const [reg, setReg] = useState<{ carregando: boolean; liberadoEm: string | null; eventos: EventoRegistro[] } | null>(null)

  async function abrir() {
    onToggle()
    if (!aberta && !reg) {
      setReg({ carregando: true, liberadoEm: null, eventos: [] })
      const r = await carregarRegistroAluno(base.id, a.id)
      setReg({ carregando: false, liberadoEm: r.liberadoEm ?? null, eventos: r.eventos ?? [] })
    }
  }

  return (
    <>
      <tr onClick={abrir} className="cursor-pointer border-b last:border-0 hover:bg-muted/40">
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <AvatarAluno nome={a.nome} avatar={a.avatar} cor={a.cor} />
            <div className="min-w-0"><div className="truncate font-medium text-foreground" title={a.nome}>{a.nome}</div><div className="truncate text-[11px] text-muted-foreground">{a.email ?? '—'} · {a.cpfMasc}</div></div>
          </div>
        </td>
        <td className="px-4 py-2.5"><div className="flex flex-col gap-0.5"><OrigemBadge origem={a.recebidoPor.origem} /><span className="text-[11px] text-muted-foreground">{a.recebidoPor.detalhe}</span></div></td>
        <td className="px-4 py-2.5"><SituacaoBadge s={a.situacao} /></td>
        <td className="px-4 py-2.5 text-xs text-muted-foreground">{fmtDataHora(a.ultimoAcesso)}</td>
        <td className="px-4 py-2.5 text-center text-xs text-muted-foreground">—</td>
        <td className="px-4 py-2.5 text-center text-xs text-muted-foreground">—</td>
        <td className="px-4 py-2.5 text-center text-sm font-medium text-foreground">{a.grifos || '—'}</td>
        <td className="px-2 py-2.5 text-muted-foreground">{aberta ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</td>
      </tr>
      {aberta && (
        <tr className="border-b bg-muted/20">
          <td colSpan={8} className="px-4 py-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Liberado para ele: <strong className="text-foreground">{reg?.liberadoEm ? fmtDataHora(reg.liberadoEm) : '—'}</strong> · {a.recebidoPor.detalhe}</span>
              <div className="ml-auto flex gap-2">
                <button onClick={() => toast.info(`${tipo.maisUm} — em construção (depende do controle de downloads).`)} className="rounded-lg border px-2.5 py-1 text-[11px] font-semibold hover:bg-muted">{tipo.maisUm}</button>
                <button onClick={() => toast.info('Revogar só para este aluno — em construção.')} className="rounded-lg border px-2.5 py-1 text-[11px] font-semibold text-destructive hover:bg-destructive/10">Revogar só para este aluno</button>
              </div>
            </div>
            {reg?.carregando ? (
              <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Carregando registro…</div>
            ) : (reg?.eventos.length ?? 0) === 0 ? (
              <div className="py-3 text-xs text-muted-foreground">Sem eventos registrados para este aluno neste conteúdo.</div>
            ) : (
              <ul className="space-y-1.5">
                {reg!.eventos.map((e, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs">
                    <span className="w-28 shrink-0 text-muted-foreground">{fmtDataHora(e.em)}</span>
                    <span className="font-medium text-foreground">{e.tipo === 'abriu' ? tipo.verbos.abrir : e.tipo === 'grifou' ? tipo.verbos.grifar : e.tipo === 'baixou' ? tipo.verbos.baixar : e.acao}</span>
                    {e.detalhe && <span className="truncate text-muted-foreground">· {e.detalhe}</span>}
                    {e.ipMasc && <span className="ml-auto flex items-center gap-1 text-muted-foreground"><Monitor className="h-3 w-3" />{e.ipMasc}</span>}
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  )
}
