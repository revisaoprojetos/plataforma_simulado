'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CalendarDays, Check, Download, FileText, Gift, Loader2, Pencil, Search, Upload, UserPlus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AlertBox } from '@/components/ui/alert-box'
import { confirmar } from '@/components/ui/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { alternarLiberacao, alternarLiberacaoEmLote } from '../../actions'
import {
  adicionarEstudantesPorEmails,
  alternarCronogramaNoPacote,
  alternarEstudanteNoPacote,
  buscarEstudantes,
  desvincularGrupo,
  previaDesvincularGrupo,
  vincularGrupo,
  type PacoteDetalhe,
} from '../actions'

const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

type Modal = 'cronogramas' | 'grupos' | 'alunos'

export function PacoteClient({ dados }: { dados: PacoteDetalhe }) {
  const [d, setD] = useState(dados)
  /**
   * "Ocupado" por CHAVE, não da página inteira: cada linha (e cada seção) tem a sua chave,
   * então o resto continua clicável enquanto uma ação corre.
   */
  const [ocupados, setOcupados] = useState<Record<string, boolean>>({})
  const ocupado = (chave: string) => !!ocupados[chave]
  function executar(chave: string, fn: () => Promise<void>) {
    if (ocupados[chave]) return
    setOcupados((o) => ({ ...o, [chave]: true }))
    void (async () => {
      try {
        await fn()
      } finally {
        setOcupados((o) => {
          const n = { ...o }
          delete n[chave]
          return n
        })
      }
    })()
  }

  // ── Pop-up de seleção (um por seção): busca + filtros + importação, no mesmo formato
  //    do pop-up de estudantes do Banco de Simulado.
  const [modal, setModal] = useState<Modal | null>(null)
  const [busca, setBusca] = useState('')
  const [filtroCron, setFiltroCron] = useState<'todos' | 'liberado' | 'rascunho'>('todos')
  const [achados, setAchados] = useState<{ id: string; nome: string; email: string | null }[]>([])
  const [buscando, setBuscando] = useState(false)
  const buscaAtual = useRef(0)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function abrir(qual: Modal) {
    setModal(qual)
    setBusca('')
    setFiltroCron('todos')
    setAchados([])
  }

  function addCronograma(c: { id: string; nome: string; status: string; metas: number }) {
    executar(`add:${c.id}`, async () => {
      const r = await alternarCronogramaNoPacote(d.pacote.id, c.id, true)
      if (!r.ok) { toast.error(r.error ?? 'Não foi possível adicionar.'); return }
      setD((x) => ({
        ...x,
        cronogramas: [...x.cronogramas, { id: c.id, nome: c.nome, status: c.status, metas: c.metas }],
        cronogramasDisponiveis: x.cronogramasDisponiveis.filter((y) => y.id !== c.id),
      }))
    })
  }

  function removeCronograma(c: { id: string; nome: string; status: string; metas: number }) {
    executar(`cron:${c.id}`, async () => {
      const r = await alternarCronogramaNoPacote(d.pacote.id, c.id, false)
      if (!r.ok) { toast.error(r.error ?? 'Não foi possível remover.'); return }
      setD((x) => ({
        ...x,
        cronogramas: x.cronogramas.filter((y) => y.id !== c.id),
        cronogramasDisponiveis: [...x.cronogramasDisponiveis, { id: c.id, nome: c.nome, status: c.status, metas: c.metas }],
      }))
    })
  }

  function addGrupo(g: { id: string; nome: string; membros: number }) {
    executar(`add:${g.id}`, async () => {
      const r = await vincularGrupo(d.pacote.id, g.id)
      if (!r.ok) { toast.error(r.error ?? 'Não foi possível vincular.'); return }
      toast.success(`Grupo vinculado — ${(r.alcance ?? 0).toLocaleString('pt-BR')} aluno(s) alcançado(s)`)
      setD((x) => ({
        ...x,
        grupos: [...x.grupos, { id: g.id, nome: g.nome, membros: g.membros }],
        gruposDisponiveis: x.gruposDisponiveis.filter((y) => y.id !== g.id),
        alcance: x.alcance + g.membros,
      }))
    })
  }

  /**
   * Desvincular mostra a prévia antes — o mesmo cuidado da tela de banco. Quem já emitiu
   * não perde acesso: vira vínculo individual.
   */
  function removeGrupo(g: { id: string; nome: string; membros: number }) {
    executar(`grupo:${g.id}`, async () => {
      const p = await previaDesvincularGrupo(d.pacote.id, g.id)
      const previa = p.previa
      const detalhe = previa
        ? [
            `${previa.membros.toLocaleString('pt-BR')} aluno(s) no grupo.`,
            previa.mantidosPorOutroGrupo > 0 && `${previa.mantidosPorOutroGrupo} continuam por outro vínculo.`,
            previa.jaEmitiram > 0 && `${previa.jaEmitiram} já emitiram cronograma deste grupo de acesso e serão preservados como vínculo individual.`,
            `${Math.max(previa.perdemAcesso, 0)} perdem o acesso.`,
          ]
            .filter(Boolean)
            .join(' ')
        : 'Não foi possível calcular o impacto.'

      const sim = await confirmar({ titulo: `Desvincular "${g.nome}"`, mensagem: detalhe, destrutivo: true })
      if (!sim) return

      const r = await desvincularGrupo(d.pacote.id, g.id, true)
      if (!r.ok) { toast.error(r.error ?? 'Não foi possível desvincular.'); return }
      toast.success(r.preservados ? `Grupo desvinculado — ${r.preservados} aluno(s) preservado(s)` : 'Grupo desvinculado')
      setD((x) => ({
        ...x,
        grupos: x.grupos.filter((y) => y.id !== g.id),
        gruposDisponiveis: [...x.gruposDisponiveis, { id: g.id, nome: g.nome, membros: g.membros }],
        alcance: Math.max(x.alcance - (previa?.perdemAcesso ?? 0), 0),
      }))
    })
  }

  /* Liberar daqui evita a ida ao catálogo só para destravar um cronograma — mesma ação,
     mesma permissão `cronogramas:liberar`, mesma auditoria e mesma recusa quando não tem metas. */
  function alternarStatusCronograma(c: { id: string; nome: string; status: string }) {
    executar(`cron:${c.id}`, async () => {
      const liberar = c.status !== 'liberado'
      const r = await alternarLiberacao(c.id, liberar)
      if (!r.ok) { toast.error(r.error ?? 'Não foi possível alterar.'); return }
      toast.success(liberar ? `"${c.nome}" liberado` : `"${c.nome}" voltou a rascunho`)
      setD((x) => ({
        ...x,
        cronogramas: x.cronogramas.map((y) => (y.id === c.id ? { ...y, status: liberar ? 'liberado' : 'rascunho' } : y)),
      }))
    })
  }

  function liberarRascunhos() {
    const ids = d.cronogramas.filter((c) => c.status !== 'liberado').map((c) => c.id)
    if (!ids.length) return
    executar('lote', async () => {
      const r = await alternarLiberacaoEmLote(ids, true)
      if (!r.ok) { toast.error(r.error ?? 'Não foi possível liberar.'); return }
      const liberados = new Set(ids)
      setD((x) => ({
        ...x,
        cronogramas: x.cronogramas.map((y) => (liberados.has(y.id) && y.metas > 0 ? { ...y, status: 'liberado' } : y)),
      }))
      toast.success(r.semMetas ? `${r.alterados} liberado(s) — ${r.semMetas} sem metas ficaram de fora` : `${r.alterados} cronograma(s) liberado(s)`)
    })
  }

  /**
   * Busca de alunos com debounce e FORA de qualquer transição das mutações — assim os
   * resultados nunca aparecem desabilitados enquanto se digita. Descarta resposta fora de ordem.
   */
  function procurarAlunos(termo: string) {
    setBusca(termo)
    if (debounce.current) clearTimeout(debounce.current)
    const t = termo.trim()
    if (t.length < 2) {
      setAchados([])
      setBuscando(false)
      return
    }
    setBuscando(true)
    debounce.current = setTimeout(async () => {
      const id = ++buscaAtual.current
      const r = await buscarEstudantes(t)
      if (id !== buscaAtual.current) return
      setBuscando(false)
      if (!r.ok) { toast.error(r.error ?? 'Não foi possível buscar.'); return }
      setAchados((r.itens ?? []).filter((a) => !d.estudantes.some((e) => e.id === a.id)))
    }, 250)
  }

  useEffect(
    () => () => {
      if (debounce.current) clearTimeout(debounce.current)
    },
    [],
  )

  function addAluno(a: { id: string; nome: string; email: string | null }) {
    executar(`add:${a.id}`, async () => {
      const r = await alternarEstudanteNoPacote(d.pacote.id, a.id, true)
      if (!r.ok) { toast.error(r.error ?? 'Não foi possível adicionar.'); return }
      toast.success(`${a.nome} recebeu acesso`)
      setD((x) => ({ ...x, estudantes: [...x.estudantes, a], alcance: x.alcance + 1 }))
      setAchados((xs) => xs.filter((x) => x.id !== a.id))
    })
  }

  function removeAluno(a: { id: string; nome: string; email: string | null }) {
    executar(`aluno:${a.id}`, async () => {
      const r = await alternarEstudanteNoPacote(d.pacote.id, a.id, false)
      if (!r.ok) { toast.error(r.error ?? 'Não foi possível remover.'); return }
      setD((x) => ({ ...x, estudantes: x.estudantes.filter((y) => y.id !== a.id), alcance: Math.max(x.alcance - 1, 0) }))
    })
  }

  // ── Importação de alunos avulsos por lista de e-mails (CSV ou um por linha) ──
  function baixarModelo() {
    const url = URL.createObjectURL(new Blob(['email\njoao@exemplo.com\nmaria@exemplo.com\n'], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'modelo-emails.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function onArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      // Extrai e-mails de qualquer formato (CSV, colado, um por linha) por regex.
      const emails = String(reader.result ?? '').match(/[^\s,;"']+@[^\s,;"']+\.[^\s,;"']+/g) ?? []
      if (!emails.length) { toast.error('Nenhum e-mail encontrado no arquivo.'); return }
      executar('import', async () => {
        const r = await adicionarEstudantesPorEmails(d.pacote.id, emails)
        if (!r.ok) { toast.error(r.error ?? 'Não foi possível importar.'); return }
        const novos = (r.itens ?? []).filter((a) => !d.estudantes.some((e2) => e2.id === a.id))
        setD((x) => ({ ...x, estudantes: [...x.estudantes, ...novos], alcance: x.alcance + novos.length }))
        const nf = r.naoEncontrados?.length ?? 0
        toast.success(`${novos.length} aluno(s) adicionado(s)${nf ? ` — ${nf} e-mail(s) sem cadastro` : ''}`)
      })
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const semRascunho = d.cronogramas.filter((c) => c.status !== 'liberado')

  // Lista unificada do pop-up: o que já está DENTRO (marcado) + o disponível — clicar alterna.
  const listaCron = useMemo(() => {
    const t = normalizar(busca)
    const dentro = d.cronogramas.map((c) => ({ ...c, dentro: true }))
    const fora = d.cronogramasDisponiveis.map((c) => ({ ...c, dentro: false }))
    return [...dentro, ...fora]
      .filter((c) => (!t || normalizar(c.nome).includes(t)) && (filtroCron === 'todos' || c.status === filtroCron))
      .sort((a, b) => Number(b.dentro) - Number(a.dentro) || a.nome.localeCompare(b.nome))
  }, [d.cronogramas, d.cronogramasDisponiveis, busca, filtroCron])

  const listaGrupo = useMemo(() => {
    const t = normalizar(busca)
    const dentro = d.grupos.map((g) => ({ ...g, dentro: true }))
    const fora = d.gruposDisponiveis.map((g) => ({ ...g, dentro: false }))
    return [...dentro, ...fora]
      .filter((g) => !t || normalizar(g.nome).includes(t))
      .sort((a, b) => Number(b.dentro) - Number(a.dentro) || a.nome.localeCompare(b.nome))
  }, [d.grupos, d.gruposDisponiveis, busca])

  const cards: { rotulo: string; n: number; icone: typeof Users; qual: Modal; aviso?: number }[] = [
    { rotulo: 'Cronogramas', n: d.cronogramas.length, icone: CalendarDays, qual: 'cronogramas', aviso: semRascunho.length },
    { rotulo: 'Grupos de alunos', n: d.grupos.length, icone: Users, qual: 'grupos' },
    { rotulo: 'Alunos avulsos', n: d.estudantes.length, icone: UserPlus, qual: 'alunos' },
  ]

  return (
    <>
      {/* Resumo: 3 cards clicáveis (abrem o pop-up de seleção) + alcance */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <button
            key={c.qual}
            onClick={() => abrir(c.qual)}
            className="group relative overflow-hidden rounded-2xl border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <span className="absolute inset-y-0 left-0 w-1 bg-primary" />
            <div className="flex items-start justify-between gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <c.icone className="h-4 w-4" />
              </span>
              <span className="text-3xl font-extrabold leading-none tabular-nums">{c.n.toLocaleString('pt-BR')}</span>
            </div>
            <p className="mt-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{c.rotulo}</p>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1 text-[11px] font-medium text-primary">
                <Pencil className="h-3 w-3" /> Gerenciar
              </span>
              {!!c.aviso && c.aviso > 0 && (
                <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                  {c.aviso} rascunho
                </span>
              )}
            </div>
          </button>
        ))}

        <div className="relative overflow-hidden rounded-2xl border bg-card p-4 shadow-sm">
          <span className="absolute inset-y-0 left-0 w-1 bg-emerald-500" />
          <div className="flex items-start justify-between gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <Gift className="h-4 w-4" />
            </span>
            <span className="text-3xl font-extrabold leading-none tabular-nums text-emerald-600 dark:text-emerald-500">
              {d.alcance.toLocaleString('pt-BR')}
            </span>
          </div>
          <p className="mt-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Alcance total</p>
          <p className="mt-1 text-[11px] text-muted-foreground">alunos que recebem</p>
        </div>
      </div>

      {semRascunho.length > 0 && (
        <AlertBox variante="aviso" titulo={`${semRascunho.length} cronograma(s) ainda em rascunho`} icon={AlertTriangle}>
          <p className="text-sm">
            O aluno só enxerga cronograma liberado, mesmo estando no grupo de acesso. Abra{' '}
            <button onClick={() => abrir('cronogramas')} className="font-medium text-primary underline underline-offset-2">
              Cronogramas
            </button>{' '}
            para liberar: {semRascunho.slice(0, 3).map((c) => c.nome).join(', ')}
            {semRascunho.length > 3 && ` e mais ${semRascunho.length - 3}`}.
          </p>
        </AlertBox>
      )}

      <Dialog open={modal !== null} onOpenChange={(v) => !v && setModal(null)}>
        <DialogContent className="flex max-h-[85vh] w-full flex-col gap-0 p-0 sm:max-w-2xl">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>
              {modal === 'cronogramas' ? 'Cronogramas do acesso' : modal === 'grupos' ? 'Grupos de alunos' : 'Alunos avulsos'}
            </DialogTitle>
            <DialogDescription>
              {modal === 'cronogramas'
                ? 'Marque os cronogramas que este grupo de acesso entrega. Só cronograma liberado aparece para o aluno.'
                : modal === 'grupos'
                  ? 'Marque os grupos que recebem — membros atuais e futuros entram automaticamente.'
                  : 'Busque por nome/e-mail ou importe uma lista para conceder acesso individual.'}
            </DialogDescription>
          </DialogHeader>

          {/* Importação — só na aba de alunos */}
          {modal === 'alunos' && (
            <div className="px-6 pt-4">
              <div className="rounded-lg border border-dashed p-4 text-center">
                <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={onArquivo} />
                <Upload className="mx-auto mb-1.5 h-6 w-6 text-muted-foreground" />
                <p className="mb-2 text-xs text-muted-foreground">
                  Importe uma lista de e-mails (CSV ou um por linha). Casa com alunos já cadastrados na plataforma.
                </p>
                <div className="flex items-center justify-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={baixarModelo}>
                    <Download className="mr-1.5 h-4 w-4" /> Modelo
                  </Button>
                  <Button type="button" size="sm" onClick={() => fileRef.current?.click()} disabled={ocupado('import')}>
                    {ocupado('import') ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileText className="mr-1.5 h-4 w-4" />} Selecionar arquivo
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Busca + filtros */}
          <div className="flex flex-wrap items-center gap-2 px-6 pb-2 pt-4">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => (modal === 'alunos' ? procurarAlunos(e.target.value) : setBusca(e.target.value))}
                placeholder={modal === 'alunos' ? 'Nome ou e-mail (mín. 2 letras)…' : 'Buscar…'}
                className="pl-8"
              />
            </div>
            {modal === 'cronogramas' && (
              <>
                <select
                  value={filtroCron}
                  onChange={(e) => setFiltroCron(e.target.value as typeof filtroCron)}
                  className="h-9 rounded-lg border bg-background px-2 text-sm"
                >
                  <option value="todos">Todos</option>
                  <option value="liberado">Liberados</option>
                  <option value="rascunho">Rascunhos</option>
                </select>
                {semRascunho.length > 0 && (
                  <Button size="sm" onClick={liberarRascunhos} disabled={ocupado('lote')}>
                    {ocupado('lote') && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                    Liberar {semRascunho.length}
                  </Button>
                )}
              </>
            )}
          </div>

          {/* Lista de seleção */}
          <div className="min-h-0 flex-1 space-y-0.5 overflow-auto px-3 pb-2">
            {modal === 'cronogramas' &&
              (listaCron.length === 0 ? (
                <Vazio texto={busca || filtroCron !== 'todos' ? 'Nenhum cronograma com esse filtro.' : 'Nenhum cronograma no catálogo.'} />
              ) : (
                listaCron.map((c) => (
                  <LinhaSel
                    key={c.id}
                    dentro={c.dentro}
                    ocupada={ocupado(`cron:${c.id}`) || ocupado(`add:${c.id}`)}
                    onToggle={() => (c.dentro ? removeCronograma(c) : addCronograma(c))}
                    acao={
                      c.dentro ? (
                        <Button
                          size="sm"
                          variant={c.status === 'liberado' ? 'ghost' : 'outline'}
                          className="h-7 shrink-0 px-2 text-xs"
                          onClick={() => alternarStatusCronograma(c)}
                          disabled={ocupado(`cron:${c.id}`)}
                          title={
                            c.status === 'liberado'
                              ? 'Volta a rascunho — os alunos deixam de receber'
                              : 'Libera — os alunos passam a receber'
                          }
                        >
                          {c.status === 'liberado' ? 'Rascunho' : 'Liberar'}
                        </Button>
                      ) : null
                    }
                  >
                    <span className="min-w-0 flex-1 truncate">{c.nome}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{c.metas.toLocaleString('pt-BR')} metas</span>
                    <Badge variant={c.status === 'liberado' ? 'default' : 'secondary'} className="shrink-0 text-[10px]">
                      {c.status === 'liberado' ? 'Liberado' : 'Rascunho'}
                    </Badge>
                  </LinhaSel>
                ))
              ))}

            {modal === 'grupos' &&
              (listaGrupo.length === 0 ? (
                <Vazio texto={busca ? 'Nenhum grupo com esse nome.' : 'Nenhum grupo cadastrado.'} />
              ) : (
                listaGrupo.map((g) => (
                  <LinhaSel
                    key={g.id}
                    dentro={g.dentro}
                    ocupada={ocupado(`grupo:${g.id}`) || ocupado(`add:${g.id}`)}
                    onToggle={() => (g.dentro ? removeGrupo(g) : addGrupo(g))}
                  >
                    <span className="min-w-0 flex-1 truncate">{g.nome}</span>
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {g.membros.toLocaleString('pt-BR')} aluno(s)
                    </Badge>
                  </LinhaSel>
                ))
              ))}

            {modal === 'alunos' && (
              <>
                {d.estudantes.map((a) => (
                  <LinhaSel key={a.id} dentro ocupada={ocupado(`aluno:${a.id}`)} onToggle={() => removeAluno(a)}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{a.nome}</p>
                      {a.email && <p className="truncate text-xs text-muted-foreground">{a.email}</p>}
                    </div>
                  </LinhaSel>
                ))}

                {buscando ? (
                  <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Buscando…
                  </p>
                ) : busca.trim().length >= 2 && achados.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">Nenhum aluno encontrado para “{busca.trim()}”.</p>
                ) : (
                  achados.map((a) => (
                    <LinhaSel key={a.id} dentro={false} ocupada={ocupado(`add:${a.id}`)} onToggle={() => addAluno(a)}>
                      <div className="min-w-0 flex-1">
                        <p className="truncate">{a.nome}</p>
                        {a.email && <p className="truncate text-xs text-muted-foreground">{a.email}</p>}
                      </div>
                    </LinhaSel>
                  ))
                )}

                {d.estudantes.length === 0 && achados.length === 0 && !buscando && busca.trim().length < 2 && (
                  <Vazio texto="Nenhum aluno avulso. Busque pelo nome/e-mail ou importe uma lista." />
                )}
              </>
            )}
          </div>

          {/* Rodapé */}
          <div className="flex items-center justify-between gap-3 border-t px-6 py-3">
            <span className="text-sm text-muted-foreground">
              {modal === 'cronogramas' && `${d.cronogramas.length} no grupo de acesso`}
              {modal === 'grupos' && `${d.grupos.length} grupo(s) — ${d.alcance.toLocaleString('pt-BR')} aluno(s)`}
              {modal === 'alunos' && `${d.estudantes.length} aluno(s) avulso(s)`}
            </span>
            <Button variant="outline" onClick={() => setModal(null)}>
              Concluir
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function Vazio({ texto }: { texto: string }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{texto}</p>
}

/** Linha do pop-up de seleção: o quadradinho marca quem está dentro; clicar alterna (entra/sai). */
function LinhaSel({
  dentro,
  ocupada,
  onToggle,
  children,
  acao,
}: {
  dentro: boolean
  ocupada: boolean
  onToggle: () => void
  children: React.ReactNode
  acao?: React.ReactNode
}) {
  return (
    <div className={cn('flex items-center gap-2 rounded-md px-3 py-2 text-sm transition', dentro ? 'bg-primary/5' : 'hover:bg-muted')}>
      <button type="button" onClick={onToggle} disabled={ocupada} className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:opacity-60">
        <span
          className={cn(
            'flex h-5 w-5 shrink-0 items-center justify-center rounded border',
            dentro ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40',
          )}
        >
          {ocupada ? <Loader2 className="h-3 w-3 animate-spin" /> : dentro ? <Check className="h-3.5 w-3.5" /> : null}
        </span>
        {children}
      </button>
      {acao}
    </div>
  )
}
