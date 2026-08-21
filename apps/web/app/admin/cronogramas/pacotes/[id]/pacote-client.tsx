'use client'

import { useMemo, useState, useTransition } from 'react'
import { AlertTriangle, CalendarDays, Check, Package, Plus, Search, Trash2, UserPlus, Users, X } from 'lucide-react'
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
import {
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

export function PacoteClient({ dados }: { dados: PacoteDetalhe }) {
  const [d, setD] = useState(dados)
  const [pendente, iniciar] = useTransition()
  const [modal, setModal] = useState<'cronogramas' | 'grupos' | 'alunos' | null>(null)
  const [busca, setBusca] = useState('')
  const [achados, setAchados] = useState<{ id: string; nome: string; email: string | null }[]>([])

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
  }

  function addCronograma(c: { id: string; nome: string; status: string }) {
    iniciar(async () => {
      const r = await alternarCronogramaNoPacote(d.pacote.id, c.id, true)
      if (!r.ok) return toast.error(r.error ?? 'Não foi possível adicionar.')
      setD((x) => ({
        ...x,
        cronogramas: [...x.cronogramas, { ...c, metas: 0 }],
        cronogramasDisponiveis: x.cronogramasDisponiveis.filter((y) => y.id !== c.id),
      }))
    })
  }

  function removeCronograma(c: { id: string; nome: string; status: string; metas: number }) {
    iniciar(async () => {
      const r = await alternarCronogramaNoPacote(d.pacote.id, c.id, false)
      if (!r.ok) return toast.error(r.error ?? 'Não foi possível remover.')
      setD((x) => ({
        ...x,
        cronogramas: x.cronogramas.filter((y) => y.id !== c.id),
        cronogramasDisponiveis: [...x.cronogramasDisponiveis, { id: c.id, nome: c.nome, status: c.status }],
      }))
    })
  }

  function addGrupo(g: { id: string; nome: string; membros: number }) {
    iniciar(async () => {
      const r = await vincularGrupo(d.pacote.id, g.id)
      if (!r.ok) return toast.error(r.error ?? 'Não foi possível vincular.')
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
    iniciar(async () => {
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
      if (!r.ok) return toast.error(r.error ?? 'Não foi possível desvincular.')
      toast.success(r.preservados ? `Grupo desvinculado — ${r.preservados} aluno(s) preservado(s)` : 'Grupo desvinculado')
      setD((x) => ({
        ...x,
        grupos: x.grupos.filter((y) => y.id !== g.id),
        gruposDisponiveis: [...x.gruposDisponiveis, g],
        alcance: Math.max(x.alcance - (previa?.perdemAcesso ?? 0), 0),
      }))
    })
  }

  function procurarAlunos(termo: string) {
    setBusca(termo)
    iniciar(async () => {
      const r = await buscarEstudantes(termo)
      if (r.ok) setAchados((r.itens ?? []).filter((a) => !d.estudantes.some((e) => e.id === a.id)))
    })
  }

  function addAluno(a: { id: string; nome: string; email: string | null }) {
    iniciar(async () => {
      const r = await alternarEstudanteNoPacote(d.pacote.id, a.id, true)
      if (!r.ok) return toast.error(r.error ?? 'Não foi possível adicionar.')
      toast.success(`${a.nome} recebeu acesso`)
      setD((x) => ({ ...x, estudantes: [...x.estudantes, a], alcance: x.alcance + 1 }))
      setAchados((xs) => xs.filter((x) => x.id !== a.id))
    })
  }

  function removeAluno(a: { id: string; nome: string }) {
    iniciar(async () => {
      const r = await alternarEstudanteNoPacote(d.pacote.id, a.id, false)
      if (!r.ok) return toast.error(r.error ?? 'Não foi possível remover.')
      setD((x) => ({ ...x, estudantes: x.estudantes.filter((y) => y.id !== a.id), alcance: Math.max(x.alcance - 1, 0) }))
    })
  }

  const semRascunho = d.cronogramas.filter((c) => c.status !== 'liberado')

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Cronogramas', d.cronogramas.length],
          ['Grupos', d.grupos.length],
          ['Alunos avulsos', d.estudantes.length],
          ['Alcance total', d.alcance],
        ].map(([rotulo, n]) => (
          <Card key={rotulo as string} className="p-4">
            <p className="text-2xl font-bold tabular-nums">{(n as number).toLocaleString('pt-BR')}</p>
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
            <Button size="sm" variant="outline" onClick={() => abrir('cronogramas')} disabled={pendente}>
              <Plus className="mr-1 h-4 w-4" />
              Adicionar
            </Button>
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
                <Button size="sm" variant="ghost" onClick={() => removeCronograma(c)} disabled={pendente}>
                  <X className="h-4 w-4" />
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
            <Button size="sm" variant="outline" onClick={() => abrir('grupos')} disabled={pendente}>
              <Plus className="mr-1 h-4 w-4" />
              Vincular grupo
            </Button>
          }
        />
        {d.grupos.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhum grupo vinculado.</p>
        ) : (
          <div className="divide-y">
            {d.grupos.map((g) => (
              <div key={g.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sm">{g.nome}</span>
                <Badge variant="outline" className="shrink-0">
                  {g.membros.toLocaleString('pt-BR')} aluno(s)
                </Badge>
                <Button size="sm" variant="ghost" onClick={() => removeGrupo(g)} disabled={pendente}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
        <SecaoHeader
          icon={UserPlus}
          titulo="Alunos avulsos"
          subtitulo="Para quem não está em grupo nenhum, ou para exceções"
          acao={
            <Button size="sm" variant="outline" onClick={() => abrir('alunos')} disabled={pendente}>
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
                <Button size="sm" variant="ghost" onClick={() => removeAluno(a)} disabled={pendente}>
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
                <p className="py-6 text-center text-sm text-muted-foreground">Todos os cronogramas já estão no pacote.</p>
              ) : (
                (disponiveis as typeof d.cronogramasDisponiveis).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => addCronograma(c)}
                    disabled={pendente}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition hover:bg-muted"
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{c.nome}</span>
                    <Badge variant={c.status === 'liberado' ? 'outline' : 'secondary'} className="shrink-0 text-xs">
                      {c.status}
                    </Badge>
                  </button>
                ))
              ))}

            {modal === 'grupos' &&
              (disponiveis.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Nenhum grupo disponível.</p>
              ) : (
                (disponiveis as typeof d.gruposDisponiveis).map((g) => (
                  <button
                    key={g.id}
                    onClick={() => addGrupo(g)}
                    disabled={pendente}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition hover:bg-muted"
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{g.nome}</span>
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {g.membros.toLocaleString('pt-BR')}
                    </Badge>
                  </button>
                ))
              ))}

            {modal === 'alunos' &&
              (achados.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {busca.trim().length < 2 ? 'Digite ao menos 2 letras.' : 'Nenhum aluno encontrado.'}
                </p>
              ) : (
                achados.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => addAluno(a)}
                    disabled={pendente}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition hover:bg-muted"
                  >
                    <Check className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{a.nome}</p>
                      {a.email && <p className="truncate text-xs text-muted-foreground">{a.email}</p>}
                    </div>
                  </button>
                ))
              ))}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setModal(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
