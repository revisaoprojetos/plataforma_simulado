'use client'
import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, Copy, Folder, Pencil, Plus, Users } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DataTable, type DataTableColumn } from '@/components/admin/data-table'
import { RevisaoHead } from '@/components/admin/revisao/ui'
import { CampoCs, FormCs, INPUT_CS, PillOrigem, chipCls } from '@/components/admin/revisao/cs-ui'
import type { CursoOpcao, GrupoForm, GrupoLinha, GrupoOpcao, PastaGrupo } from '@/lib/admin-revisao/cs-tipos'
import { criarGrupoRevisaoAction, editarGrupoRevisaoAction, lerGrupoBaseAction } from './actions'

type Modo = null | 'novo' | 'dup' | { editar: GrupoLinha }
const VAZIO: GrupoForm = { nome: '', pastaId: null, validadeTipo: 'meses_apos_compra', validadeMeses: 12, validadeAte: null, codigoGuru: '', cursoIds: [] }

export function GruposCliente({ rows, total, pastas, pastaAtual, cursos, todosGrupos, podeEditar, kpis }: {
  rows: GrupoLinha[]; total: number; pastas: PastaGrupo[]; pastaAtual: string; cursos: CursoOpcao[]; todosGrupos: GrupoOpcao[]; podeEditar: boolean; kpis: React.ReactNode
}) {
  const router = useRouter()
  const [modo, setModo] = useState<Modo>(null)
  const [f, setF] = useState<GrupoForm>(VAZIO)
  const [pend, start] = useTransition()
  const mestres = useMemo(() => pastas.filter((p) => p.id && p.id !== 'sem'), [pastas])

  const abrir = (m: Modo, base?: Partial<GrupoForm>) => { setF({ ...VAZIO, ...base }); setModo(m) }
  const fechar = () => setModo(null)
  const set = <K extends keyof GrupoForm>(k: K, v: GrupoForm[K]) => setF((x) => ({ ...x, [k]: v }))
  const toggleCurso = (id: string) => set('cursoIds', f.cursoIds.includes(id) ? f.cursoIds.filter((c) => c !== id) : [...f.cursoIds, id])

  function copiarDe(id: string) {
    set('copiarDeId', id || null)
    if (!id) return
    start(async () => {
      const r = await lerGrupoBaseAction(id)
      if (!r.ok || !r.base) { toast.error(r.error ?? 'Não foi possível ler o grupo.'); return }
      setF((x) => ({ ...x, ...r.base!, copiarDeId: id }))
    })
  }
  function salvar() {
    start(async () => {
      const editando = typeof modo === 'object' && modo !== null
      const r = editando ? await editarGrupoRevisaoAction(f) : await criarGrupoRevisaoAction(f)
      if (!r.ok) { toast.error(r.error ?? 'Não foi possível salvar.'); if (!editando && r.id) router.refresh(); return }
      toast.success(editando ? 'Grupo salvo' : 'Grupo criado')
      fechar(); router.refresh()
    })
  }

  const colunas: DataTableColumn<GrupoLinha>[] = [
    { key: 'nome', header: 'Grupo', sortable: true, truncate: false, render: (g) => (
      <div className="min-w-0 py-1.5">
        <div className="font-semibold">{g.nome}</div>
        <div className="text-xs text-muted-foreground">{g.pasta ?? 'Sem pasta'}{g.vencendo30 > 0 && <> · <b className="text-amber-600 dark:text-amber-400">{g.vencendo30.toLocaleString('pt-BR')} vencem em 30 dias</b></>}</div>
      </div>
    ) },
    { key: 'origem', header: 'Origem', width: '7rem', render: (g) => <PillOrigem origem={g.origem} /> },
    { key: 'alunos', header: 'Alunos', width: '6rem', align: 'right', render: (g) => <span className="tabular-nums">{g.membros.toLocaleString('pt-BR')}</span> },
    { key: 'vale', header: 'Acesso vale', width: '12rem', truncate: false, render: (g) => <span className="text-sm">{g.validade}</span> },
    { key: 'cursos', header: 'Cursos', truncate: false, render: (g) => g.cursos.length
      ? <div className="flex flex-wrap gap-1">{g.cursos.map((c) => <span key={c.id} className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">{c.nome}</span>)}</div>
      : <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">nenhum curso</span> },
    { key: 'acoes', header: '', width: '12rem', align: 'right', truncate: false, render: (g) => (
      <div className="flex justify-end gap-1.5">
        <Link href={`/admin/grupos/${g.id}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}><Users /> Alunos</Link>
        {podeEditar && <Button variant="outline" size="sm" onClick={() => abrir({ editar: g }, { id: g.id, nome: g.nome, pastaId: g.pastaId, validadeTipo: (g.validadeTipo ?? '') as GrupoForm['validadeTipo'], validadeMeses: g.validadeMeses, validadeAte: g.validadeAte, codigoGuru: g.codigoGuru ?? '', cursoIds: g.cursos.map((c) => c.id) })}><Pencil /> Editar</Button>}
      </div>
    ) },
  ]

  const titulo = modo === 'dup' ? 'Criar turma a partir de outra' : typeof modo === 'object' && modo ? `Editar grupo · ${modo.editar.nome}` : 'Criar grupo'

  return (
    <>
      <RevisaoHead secao="CS" titulo="Grupos de acesso"
        subtitulo="O grupo diz quem vê o quê e até quando. Cada produto ou turma nova vira um grupo. A compra no Guru coloca o aluno no grupo sozinha."
        acoes={podeEditar ? (<>
          <Button variant="outline" size="lg" onClick={() => abrir('dup')}><Copy /> Criar turma a partir de outra</Button>
          <Button size="lg" onClick={() => abrir('novo')}><Plus /> Criar grupo</Button>
        </>) : undefined} />
      {kpis}

      {modo && (
        <FormCs titulo={titulo}>
          <div className="grid gap-3 md:grid-cols-3">
            {modo === 'dup' && (
              <CampoCs rotulo="Copiar de" dica="Copia cursos, pasta e validade. Os alunos não são copiados.">
                <select className={INPUT_CS} value={f.copiarDeId ?? ''} onChange={(e) => copiarDe(e.target.value)}>
                  <option value="">Escolha o grupo-base</option>
                  {todosGrupos.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
                </select>
              </CampoCs>
            )}
            <CampoCs rotulo="Nome do grupo"><input className={INPUT_CS} value={f.nome} onChange={(e) => set('nome', e.target.value)} placeholder="Ex.: Extensivo Advocacia Pública · Turma Janeiro 2027" /></CampoCs>
            <CampoCs rotulo="Pasta">
              <select className={INPUT_CS} value={f.pastaId ?? ''} onChange={(e) => set('pastaId', e.target.value || null)}>
                <option value="">Sem pasta</option>
                {mestres.map((p) => <option key={p.id} value={p.id!}>{p.nome}</option>)}
              </select>
            </CampoCs>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <CampoCs rotulo="Acesso vale">
              <select className={INPUT_CS} value={f.validadeTipo} onChange={(e) => set('validadeTipo', e.target.value as GrupoForm['validadeTipo'])}>
                <option value="meses_apos_compra">Meses após a compra</option>
                <option value="ate_data">Até uma data</option>
                <option value="vitalicio">Vitalício</option>
                <option value="">Definido por aluno</option>
              </select>
            </CampoCs>
            {f.validadeTipo === 'meses_apos_compra' && (
              <CampoCs rotulo="Quantos meses"><input className={INPUT_CS} type="number" min={1} max={240} value={f.validadeMeses ?? ''} onChange={(e) => set('validadeMeses', Number(e.target.value) || null)} /></CampoCs>
            )}
            {f.validadeTipo === 'ate_data' && (
              <CampoCs rotulo="Válido até"><input className={INPUT_CS} type="date" value={f.validadeAte ?? ''} onChange={(e) => set('validadeAte', e.target.value || null)} /></CampoCs>
            )}
            <CampoCs rotulo="Produto no Guru" dica="Com o código, a compra libera o grupo sozinha."><input className={INPUT_CS} value={f.codigoGuru ?? ''} onChange={(e) => set('codigoGuru', e.target.value)} placeholder="Código do produto (opcional)" /></CampoCs>
          </div>
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">Cursos que este grupo libera</span>
            <div className="flex flex-wrap gap-2">
              {cursos.length === 0 && <span className="text-sm text-muted-foreground">Nenhum curso (produto) ativo cadastrado.</span>}
              {cursos.map((c) => <button key={c.id} type="button" className={chipCls(f.cursoIds.includes(c.id))} onClick={() => toggleCurso(c.id)}>{f.cursoIds.includes(c.id) && <Check className="h-3 w-3" />}{c.nome}</button>)}
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="lg" disabled={pend} onClick={salvar}><Check /> {typeof modo === 'object' && modo ? 'Salvar grupo' : 'Criar grupo'}</Button>
            <Button size="lg" variant="ghost" onClick={fechar}>Cancelar</Button>
          </div>
        </FormCs>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,230px)_minmax(0,1fr)]">
        <nav className="rounded-2xl border bg-card p-1.5 shadow-sm" aria-label="Pastas">
          {pastas.map((p) => {
            const id = p.id ?? 'todos'
            const on = pastaAtual === id
            return (
              <Link key={id} href={id === 'todos' ? '/admin/revisao/grupos' : `/admin/revisao/grupos?pasta=${id}`}
                className={cn('flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors', on ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted')}>
                <Folder className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1 truncate">{p.nome}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{p.total}</span>
              </Link>
            )
          })}
        </nav>
        <DataTable<GrupoLinha> rows={rows} total={total} columns={colunas} getRowId={(g) => g.id} selectable={false}
          searchable searchPlaceholder="Buscar grupo pelo nome" defaultSort={{ key: 'nome', dir: 'asc' }} rowHeight="h-16"
          nomeSingular="grupo" nomePlural="grupos" empty={<span>Nenhum grupo nesta pasta.</span>} />
      </div>
    </>
  )
}
