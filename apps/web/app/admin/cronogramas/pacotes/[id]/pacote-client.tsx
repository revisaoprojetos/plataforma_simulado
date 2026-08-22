'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CalendarDays, Check, ChevronDown, ChevronRight, Gift, Loader2, Plus, Search, Trash2, UserPlus, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { SecaoHeader } from '@/components/admin/secao-header'
import { AlertBox } from '@/components/ui/alert-box'
import { confirmar } from '@/components/ui/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { alternarLiberacao, alternarLiberacaoEmLote } from '../../actions'
import {
  adicionarCronogramas,
  alternarAcessoGratuitoPacote,
  adicionarEstudantes,
  alternarCronogramaNoPacote,
  membrosDoGrupo,
  vincularGrupos,
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

export function PacoteClient({ dados }: { dados: PacoteDetalhe }) {
  const [d, setD] = useState(dados)
  /**
   * "Ocupado" por CHAVE, não da página inteira.
   *
   * Com o `pendente` global do useTransition, clicar em remover uma linha desabilitava todos os
   * botões da tela — a espera parecia ser da página. Agora cada linha (e cada seção) tem a sua
   * chave, então o resto continua clicável enquanto uma ação corre.
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
  const [modal, setModal] = useState<'cronogramas' | 'grupos' | 'alunos' | null>(null)
  const [busca, setBusca] = useState('')
  const [achados, setAchados] = useState<{ id: string; nome: string; email: string | null }[]>([])
  // Membros carregados sob demanda: buscar todos de todos os grupos na abertura seria
  // caro, e na maioria das vezes a equipe só quer conferir um.
  // Seleção acumulada do diálogo — só vira gravação ao confirmar.
  const [selecao, setSelecao] = useState<Set<string>>(new Set())
  const [buscando, setBuscando] = useState(false)
  const buscaAtual = useRef(0)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [expandido, setExpandido] = useState<string | null>(null)
  const [membros, setMembros] = useState<Record<string, { itens: { id: string; nome: string; email: string | null }[]; total: number } | 'carregando'>>({})

  const disponiveis = useMemo(() => {
    const t = normalizar(busca)
    if (modal === 'cronogramas') {
      return d.cronogramasDisponiveis.filter((c) => !t || normalizar(c.nome).includes(t))
    }
    if (modal === 'grupos') {
      return d.gruposDisponiveis.filter((g) => !t || normalizar(g.nome).includes(t))
    }
    return []
  }, [modal, busca, d])

  function abrir(qual: 'cronogramas' | 'grupos' | 'alunos') {
    setModal(qual)
    setBusca('')
    setAchados([])
    setSelecao(new Set())
  }

  function alternarSelecao(id: string) {
    setSelecao((s) => {
      const novo = new Set(s)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  /** Grava tudo o que foi selecionado, numa chamada só. */
  function confirmarSelecao() {
    const ids = [...selecao]
    if (!ids.length) return
    executar('modal', async () => {
      if (modal === 'cronogramas') {
        const r = await adicionarCronogramas(d.pacote.id, ids)
        if (!r.ok) { toast.error(r.error ?? 'Não foi possível adicionar.'); return }
        const novos = d.cronogramasDisponiveis.filter((c) => selecao.has(c.id))
        setD((x) => ({
          ...x,
          cronogramas: [...x.cronogramas, ...novos],
          cronogramasDisponiveis: x.cronogramasDisponiveis.filter((c) => !selecao.has(c.id)),
        }))
        toast.success(`${novos.length} cronograma(s) adicionado(s)`)
      } else if (modal === 'grupos') {
        const r = await vincularGrupos(d.pacote.id, ids)
        if (!r.ok) { toast.error(r.error ?? 'Não foi possível vincular.'); return }
        const novos = d.gruposDisponiveis.filter((g) => selecao.has(g.id))
        setD((x) => ({
          ...x,
          grupos: [...x.grupos, ...novos],
          gruposDisponiveis: x.gruposDisponiveis.filter((g) => !selecao.has(g.id)),
          // O alcance real vem do servidor: um aluno em dois grupos conta uma vez só.
          alcance: x.alcance + (r.alcance ?? 0),
        }))
        toast.success(`${novos.length} grupo(s) vinculado(s) — ${(r.alcance ?? 0).toLocaleString('pt-BR')} aluno(s)`)
      } else {
        const r = await adicionarEstudantes(d.pacote.id, ids)
        if (!r.ok) { toast.error(r.error ?? 'Não foi possível adicionar.'); return }
        const novos = achados.filter((a) => selecao.has(a.id))
        setD((x) => ({ ...x, estudantes: [...x.estudantes, ...novos], alcance: x.alcance + novos.length }))
        toast.success(`${novos.length} aluno(s) com acesso`)
      }
      setModal(null)
      setSelecao(new Set())
    })
  }

  function addCronograma(c: { id: string; nome: string; status: string; metas: number }) {
    executar(`add:${c.id}`, async () => {
      const r = await alternarCronogramaNoPacote(d.pacote.id, c.id, true)
      if (!r.ok) { toast.error(r.error ?? 'Não foi possível adicionar.'); return }
      setD((x) => ({
        ...x,
        // A contagem vem do catálogo; sem ela a linha aparecia com "0 metas".
        cronogramas: [...x.cronogramas, c],
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
        grupos: [...x.grupos, g],
        gruposDisponiveis: x.gruposDisponiveis.filter((y) => y.id !== g.id),
        alcance: x.alcance + g.membros,
      }))
    })
  }

  /**
   * Desvincular mostra a prévia antes — o mesmo cuidado que a tela de banco tem nos
   * simulados. Quem já emitiu não perde acesso: vira vínculo individual.
   */
  function removeGrupo(g: { id: string; nome: string; membros: number }) {
    executar(`grupo:${g.id}`, async () => {
      const p = await previaDesvincularGrupo(d.pacote.id, g.id)
      const previa = p.previa
      const detalhe = previa
        ? [
            `${previa.membros.toLocaleString('pt-BR')} aluno(s) no grupo.`,
            previa.mantidosPorOutroGrupo > 0 && `${previa.mantidosPorOutroGrupo} continuam por outro vínculo.`,
            previa.jaEmitiram > 0 && `${previa.jaEmitiram} já emitiram cronograma deste pacote e serão preservados como vínculo individual.`,
            `${Math.max(previa.perdemAcesso, 0)} perdem o acesso.`,
          ]
            .filter(Boolean)
            .join(' ')
        : 'Não foi possível calcular o impacto.'

      const sim = await confirmar({
        titulo: `Desvincular "${g.nome}"`,
        mensagem: detalhe,
        destrutivo: true,
      })
      if (!sim) return

      const r = await desvincularGrupo(d.pacote.id, g.id, true)
      if (!r.ok) { toast.error(r.error ?? 'Não foi possível desvincular.'); return }
      toast.success(r.preservados ? `Grupo desvinculado — ${r.preservados} aluno(s) preservado(s)` : 'Grupo desvinculado')
      setD((x) => ({
        ...x,
        grupos: x.grupos.filter((y) => y.id !== g.id),
        gruposDisponiveis: [...x.gruposDisponiveis, g],
        alcance: Math.max(x.alcance - (previa?.perdemAcesso ?? 0), 0),
      }))
    })
  }

  /* Liberar daqui evita a ida ao catálogo só para destravar um cronograma do pacote — e é a
     MESMA ação do catálogo (mesma permissão `cronogramas:liberar`, mesma auditoria, mesma recusa
     quando o cronograma não tem metas). */
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

  /* Liberar em lote: um pacote recém-montado costuma ter vários rascunhos, e liberar de um em um
     era uma ida por linha — em fila, porque o Next serializa as ações do cliente. */
  function liberarRascunhos() {
    const ids = d.cronogramas.filter((c) => c.status !== 'liberado').map((c) => c.id)
    if (!ids.length) return
    executar('lote', async () => {
      const r = await alternarLiberacaoEmLote(ids, true)
      if (!r.ok) { toast.error(r.error ?? 'Não foi possível liberar.'); return }
      const liberados = new Set(ids)
      setD((x) => ({
        ...x,
        cronogramas: x.cronogramas.map((y) =>
          liberados.has(y.id) && y.metas > 0 ? { ...y, status: 'liberado' } : y,
        ),
      }))
      toast.success(
        r.semMetas
          ? `${r.alterados} liberado(s) — ${r.semMetas} sem metas ficaram de fora`
          : `${r.alterados} cronograma(s) liberado(s)`,
      )
    })
  }

  function alternarGratuito() {
    executar('gratuito', async () => {
      const alvo = !d.pacote.acesso_gratuito
      const r = await alternarAcessoGratuitoPacote(d.pacote.id, alvo)
      if (!r.ok) { toast.error(r.error ?? 'Não foi possível alterar.'); return }
      toast.success(alvo ? 'Liberado para todos os alunos' : 'Liberação para todos desligada')
      setD((x) => ({ ...x, pacote: { ...x.pacote, acesso_gratuito: alvo } }))
    })
  }

  function alternarExpandir(grupoId: string) {
    if (expandido === grupoId) return setExpandido(null)
    setExpandido(grupoId)
    if (membros[grupoId]) return
    setMembros((m) => ({ ...m, [grupoId]: 'carregando' }))
    executar(`membros:${grupoId}`, async () => {
      const r = await membrosDoGrupo(grupoId)
      if (!r.ok) {
        toast.error(r.error ?? 'Não foi possível carregar os alunos.')
        setMembros((m) => { const { [grupoId]: _, ...resto } = m; return resto })
        return
      }
      setMembros((m) => ({ ...m, [grupoId]: { itens: r.itens ?? [], total: r.total ?? 0 } }))
    })
  }

  /**
   * Busca de alunos com debounce e FORA do `useTransition` das mutações.
   *
   * Antes ela usava o mesmo `iniciar`, então `pendente` ficava true enquanto se digitava
   * e os resultados apareciam DESABILITADOS — dava a impressão de que a busca não achava
   * ninguém. Agora tem estado próprio, espera entre teclas, e descarta resposta que
   * chega fora de ordem (a de "an" pode voltar depois da de "ana").
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

  function removeAluno(a: { id: string; nome: string }) {
    executar(`aluno:${a.id}`, async () => {
      const r = await alternarEstudanteNoPacote(d.pacote.id, a.id, false)
      if (!r.ok) { toast.error(r.error ?? 'Não foi possível remover.'); return }
      setD((x) => ({ ...x, estudantes: x.estudantes.filter((y) => y.id !== a.id), alcance: Math.max(x.alcance - 1, 0) }))
    })
  }

  const semRascunho = d.cronogramas.filter((c) => c.status !== 'liberado')

  return (
    <>
      <Card className={`flex flex-wrap items-center gap-3 p-4 ${d.pacote.acesso_gratuito ? 'border-primary/40 bg-primary/5' : ''}`}>
        <Gift className={`h-5 w-5 shrink-0 ${d.pacote.acesso_gratuito ? 'text-primary' : 'text-muted-foreground'}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Liberar para todos os alunos</p>
          <p className="text-xs text-muted-foreground">
            {d.pacote.acesso_gratuito
              ? 'Qualquer aluno da plataforma recebe os cronogramas deste pacote, sem precisar de grupo nem vínculo individual.'
              : 'Ligado, dispensa grupos e vínculos: todo aluno da plataforma passa a receber os cronogramas deste pacote.'}
          </p>
        </div>
        <Button
          size="sm"
          variant={d.pacote.acesso_gratuito ? 'secondary' : 'outline'}
          onClick={alternarGratuito}
          disabled={ocupado('gratuito')}
        >
          {d.pacote.acesso_gratuito ? 'Desligar' : 'Liberar para todos'}
        </Button>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([
          ['Cronogramas', d.cronogramas.length],
          ['Grupos', d.grupos.length],
          ['Alunos avulsos', d.estudantes.length],
          ['Alcance total', d.pacote.acesso_gratuito ? 'todos' : d.alcance],
        ] as [string, number | string][]).map(([rotulo, n]) => (
          <Card key={rotulo as string} className="p-4">
            <p className="text-2xl font-bold tabular-nums">{typeof n === 'number' ? n.toLocaleString('pt-BR') : n}</p>
            <p className="text-xs text-muted-foreground">{rotulo as string}</p>
          </Card>
        ))}
      </div>

      {semRascunho.length > 0 && (
        <AlertBox variante="aviso" titulo={`${semRascunho.length} cronograma(s) ainda em rascunho`} icon={AlertTriangle}>
          <p className="text-sm">
            O aluno só enxerga cronograma liberado, mesmo estando no pacote. Libere no catálogo:{' '}
            {semRascunho.slice(0, 3).map((c) => c.nome).join(', ')}
            {semRascunho.length > 3 && ` e mais ${semRascunho.length - 3}`}.
          </p>
        </AlertBox>
      )}

      {/* ── O que o pacote contém */}
      <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
        <SecaoHeader
          icon={CalendarDays}
          titulo="Cronogramas do pacote"
          subtitulo="O que os alunos vinculados vão receber"
          acao={
            <div className="flex items-center gap-2">
              {semRascunho.length > 0 && (
                <Button size="sm" onClick={liberarRascunhos} disabled={ocupado('lote')}>
                  {ocupado('lote') && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  Liberar {semRascunho.length} rascunho(s)
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => abrir('cronogramas')}>
                <Plus className="mr-1 h-4 w-4" />
                Adicionar
              </Button>
            </div>
          }
        />
        {d.cronogramas.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Nenhum cronograma no pacote. Sem isso, vincular alunos não libera nada.
          </p>
        ) : (
          <div className="divide-y">
            {d.cronogramas.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <span className="truncate text-sm">{c.nome}</span>
                  <p className="text-xs text-muted-foreground">{c.metas.toLocaleString('pt-BR')} metas</p>
                </div>
                <Badge variant={c.status === 'liberado' ? 'default' : 'secondary'} className="shrink-0">
                  {c.status === 'liberado' ? 'Liberado' : 'Rascunho'}
                </Badge>
                <Button
                  size="sm"
                  variant={c.status === 'liberado' ? 'ghost' : 'outline'}
                  className="h-7 shrink-0 px-2 text-xs"
                  onClick={() => alternarStatusCronograma(c)}
                  disabled={ocupado(`cron:${c.id}`)}
                  title={
                    c.status === 'liberado'
                      ? 'Volta a rascunho — os alunos do pacote deixam de receber'
                      : 'Libera — os alunos do pacote passam a receber'
                  }
                >
                  {c.status === 'liberado' ? 'Voltar a rascunho' : 'Liberar'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => removeCronograma(c)} disabled={ocupado(`cron:${c.id}`)}>
                  {ocupado(`cron:${c.id}`) ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Quem recebe */}
      <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
        <SecaoHeader
          icon={Users}
          titulo="Grupos de alunos"
          subtitulo="Vincular um grupo grava uma linha — o acesso é resolvido na leitura"
          acao={
            <Button size="sm" variant="outline" onClick={() => abrir('grupos')}>
              <Plus className="mr-1 h-4 w-4" />
              Vincular grupo
            </Button>
          }
        />
        {d.grupos.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhum grupo vinculado.</p>
        ) : (
          <div className="divide-y">
            {d.grupos.map((g) => {
              const dados = membros[g.id]
              const aberto = expandido === g.id
              return (
                <div key={g.id}>
                  <div className="flex items-center gap-3 px-4 py-2.5">
                    <button
                      onClick={() => alternarExpandir(g.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      title="Ver os alunos deste grupo"
                    >
                      {aberto ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate text-sm">{g.nome}</span>
                    </button>
                    <Badge variant="outline" className="shrink-0">
                      {g.membros.toLocaleString('pt-BR')} aluno(s)
                    </Badge>
                    <Button size="sm" variant="ghost" onClick={() => removeGrupo(g)} disabled={ocupado(`grupo:${g.id}`)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>

                  {aberto && (
                    <div className="border-t bg-muted/20 px-4 py-2">
                      {dados === 'carregando' || dados === undefined ? (
                        <p className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Carregando alunos…
                        </p>
                      ) : dados.itens.length === 0 ? (
                        <p className="py-2 text-sm text-muted-foreground">Este grupo não tem alunos.</p>
                      ) : (
                        <>
                          <div className="max-h-64 space-y-0.5 overflow-y-auto">
                            {dados.itens.map((a) => (
                              <div key={a.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-background/60">
                                <span className="min-w-0 flex-1 truncate">{a.nome}</span>
                                {a.email && <span className="shrink-0 truncate text-xs text-muted-foreground">{a.email}</span>}
                              </div>
                            ))}
                          </div>
                          {dados.total > dados.itens.length && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Mostrando {dados.itens.length} de {dados.total.toLocaleString('pt-BR')} — todos têm acesso.
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
        <SecaoHeader
          icon={UserPlus}
          titulo="Alunos avulsos"
          subtitulo="Para quem não está em grupo nenhum, ou para exceções"
          acao={
            <Button size="sm" variant="outline" onClick={() => abrir('alunos')}>
              <Plus className="mr-1 h-4 w-4" />
              Adicionar aluno
            </Button>
          }
        />
        {d.estudantes.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhum aluno avulso.</p>
        ) : (
          <div className="divide-y">
            {d.estudantes.map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{a.nome}</p>
                  {a.email && <p className="truncate text-xs text-muted-foreground">{a.email}</p>}
                </div>
                <Button size="sm" variant="ghost" onClick={() => removeAluno(a)} disabled={ocupado(`aluno:${a.id}`)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Dialog open={modal !== null} onOpenChange={(v) => !v && setModal(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {modal === 'cronogramas' ? 'Adicionar cronogramas' : modal === 'grupos' ? 'Vincular grupo' : 'Adicionar aluno'}
            </DialogTitle>
            <DialogDescription>
              {modal === 'grupos'
                ? 'Todos os membros atuais e futuros do grupo passam a ter acesso — não é preciso revincular quando alguém entra.'
                : modal === 'alunos'
                  ? 'Busque por nome ou e-mail. Use para exceções; o caminho normal é pelo grupo.'
                  : 'Só cronogramas liberados aparecem para o aluno, mesmo estando no pacote.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 rounded-md border px-3 py-1.5">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={busca}
              onChange={(e) => (modal === 'alunos' ? procurarAlunos(e.target.value) : setBusca(e.target.value))}
              placeholder={modal === 'alunos' ? 'Nome ou e-mail (mín. 2 letras)…' : 'Buscar…'}
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div className="max-h-72 space-y-1 overflow-y-auto">
            {modal === 'cronogramas' &&
              (disponiveis.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {busca ? 'Nenhum cronograma com esse nome.' : 'Todos os cronogramas já estão no pacote.'}
                </p>
              ) : (
                (disponiveis as typeof d.cronogramasDisponiveis).map((c) => (
                  <Opcao key={c.id} marcada={selecao.has(c.id)} onClick={() => alternarSelecao(c.id)}>
                    <span className="min-w-0 flex-1 truncate">{c.nome}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{c.metas.toLocaleString('pt-BR')} metas</span>
                    <Badge variant={c.status === 'liberado' ? 'outline' : 'secondary'} className="shrink-0 text-xs">
                      {c.status}
                    </Badge>
                  </Opcao>
                ))
              ))}

            {modal === 'grupos' &&
              (disponiveis.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {busca ? 'Nenhum grupo com esse nome.' : 'Todos os grupos já estão vinculados.'}
                </p>
              ) : (
                (disponiveis as typeof d.gruposDisponiveis).map((g) => (
                  <Opcao key={g.id} marcada={selecao.has(g.id)} onClick={() => alternarSelecao(g.id)}>
                    <span className="min-w-0 flex-1 truncate">{g.nome}</span>
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {g.membros.toLocaleString('pt-BR')} aluno(s)
                    </Badge>
                  </Opcao>
                ))
              ))}

            {modal === 'alunos' &&
              (buscando ? (
                <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Buscando…
                </p>
              ) : achados.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {busca.trim().length < 2
                    ? 'Digite ao menos 2 letras do nome ou do e-mail.'
                    : `Nenhum aluno encontrado para “${busca.trim()}”.`}
                </p>
              ) : (
                achados.map((a) => (
                  <Opcao key={a.id} marcada={selecao.has(a.id)} onClick={() => alternarSelecao(a.id)}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{a.nome}</p>
                      {a.email && <p className="truncate text-xs text-muted-foreground">{a.email}</p>}
                    </div>
                  </Opcao>
                ))
              ))}
          </div>

          <DialogFooter className="items-center gap-2 sm:justify-between">
            <span className="text-xs text-muted-foreground">
              {selecao.size === 0
                ? 'Nada selecionado'
                : `${selecao.size} selecionado(s)${modal === 'alunos' ? ' — a busca mantém a seleção' : ''}`}
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setModal(null)} disabled={ocupado('modal')}>
                Cancelar
              </Button>
              <Button onClick={confirmarSelecao} disabled={ocupado('modal') || selecao.size === 0}>
                {ocupado('modal') ? 'Salvando…' : `Adicionar ${selecao.size || ''}`.trim()}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Linha selecionável do diálogo — clicar marca, e só o botão Adicionar grava. */
function Opcao({ marcada, onClick, children }: { marcada: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition ${
        marcada ? 'bg-primary/10' : 'hover:bg-muted'
      }`}
    >
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
          marcada ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'
        }`}
      >
        {marcada && <Check className="h-3 w-3" />}
      </span>
      {children}
    </button>
  )
}
