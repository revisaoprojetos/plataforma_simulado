'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Globe, Info, Loader2, Users, UserRound, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { confirmar } from '@/components/ui/confirm-dialog'
import { AdicionarGrupoModuloDialog, type GrupoOpc } from '@/components/admin/adicionar-grupo-modulo-dialog'
import { AdicionarEstudantesDialog, type AlunoSel } from '@/components/admin/adicionar-estudantes-dialog'
import {
  carregarAcessoCronograma,
  definirAcessoGratuitoCronograma,
  definirEstudantesCronograma,
  definirGruposCronograma,
  listarGruposParaCronograma,
  type AcessoCronograma,
} from '@/app/admin/cronogramas/acesso-actions'

export type ResumoAcesso = { gratuito: boolean; grupos: number; estudantes: number }

/**
 * Seção "Acesso dos alunos" do modal Editar cronograma: liberar para TODOS ou para
 * grupos/estudantes específicos (mesmo padrão e mesmos seletores dos simulados).
 * Salva a cada ação (otimista + rollback + toast), como o card de acesso dos simulados.
 */
export function CronogramaAcessoSecao({ cronogramaId, nome, liberado, podeLiberar, onResumo }: {
  cronogramaId: string
  nome: string
  liberado: boolean
  podeLiberar: boolean
  onResumo?: (id: string, r: ResumoAcesso) => void
}) {
  const [dados, setDados] = useState<AcessoCronograma | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [grupos, setGrupos] = useState<GrupoOpc[]>([])
  const [ocupado, setOcupado] = useState<Record<string, boolean>>({})
  const [alcance, setAlcance] = useState<number | null>(null)
  const ativo = useRef(cronogramaId)

  useEffect(() => {
    ativo.current = cronogramaId
    setDados(null); setErro(null); setAlcance(null)
    let vivo = true
    ;(async () => {
      try {
        const [a, g] = await Promise.all([carregarAcessoCronograma(cronogramaId), listarGruposParaCronograma()])
        if (!vivo) return
        if (!a.ok || !a.dados) { setErro(a.error ?? 'Não foi possível carregar o acesso.'); return }
        setDados(a.dados)
        if (g.ok && g.grupos) setGrupos(g.grupos)
      } catch {
        if (vivo) setErro('Não foi possível carregar o acesso.')
      }
    })()
    return () => { vivo = false }
  }, [cronogramaId])

  const jaGrupos = useMemo(() => new Set((dados?.grupos ?? []).map((g) => g.id)), [dados])
  const jaAlunos = useMemo(() => new Set((dados?.estudantes ?? []).map((e) => e.id)), [dados])

  function publicar(d: AcessoCronograma) {
    onResumo?.(cronogramaId, { gratuito: d.gratuito, grupos: d.grupos.length, estudantes: d.estudantes.length })
  }
  async function rodar(chave: string, fn: () => Promise<void>) {
    if (ocupado[chave]) return
    setOcupado((o) => ({ ...o, [chave]: true }))
    try { await fn() } finally { setOcupado((o) => ({ ...o, [chave]: false })) }
  }
  /** Aplica `novo` otimista; se `salvar` falhar, volta ao estado anterior. */
  async function aplicar(novo: AcessoCronograma, salvar: () => Promise<{ ok: boolean; error?: string; alcanceEstimado?: number }>, msgOk: string) {
    const antes = dados
    if (!antes) return
    setDados(novo)
    try {
      const r = await salvar()
      if (ativo.current !== cronogramaId) return
      if (!r.ok) { setDados(antes); toast.error(r.error ?? 'Não foi possível salvar.'); return }
      if (r.alcanceEstimado != null) setAlcance(r.alcanceEstimado)
      publicar(novo)
      toast.success(msgOk)
    } catch {
      setDados(antes); toast.error('Não foi possível salvar.')
    }
  }

  async function alternarTodos(valor: boolean) {
    if (!dados) return
    if (!(await confirmar({
      titulo: valor ? 'Liberar para todos os alunos' : 'Tirar acesso geral',
      mensagem: valor
        ? `Liberar "${nome}" para TODOS os alunos da plataforma? Todos passam a receber este cronograma (se estiver Liberado).`
        : `Tirar o acesso geral de "${nome}"? Só quem estiver nos grupos, estudantes ou grupos de acesso vinculados continua recebendo.`,
      confirmar: valor ? 'Liberar' : 'Tirar',
    }))) return
    void rodar('geral', () => aplicar({ ...dados, gratuito: valor }, () => definirAcessoGratuitoCronograma(cronogramaId, valor), valor ? 'Liberado para todos os alunos' : 'Acesso geral removido'))
  }

  function salvarGrupos(ids: string[], msg: string) {
    if (!dados) return
    const porId = new Map(grupos.map((g) => [g.id, g]))
    const atuais = new Map(dados.grupos.map((g) => [g.id, g]))
    const lista = ids.map((id) => {
      const a = atuais.get(id); if (a) return a
      const g = porId.get(id)
      return g ? { id, nome: g.nome, cor: g.cor, membros: g.membros ?? 0 } : null
    }).filter(Boolean) as AcessoCronograma['grupos']
    void rodar('grupos', () => aplicar({ ...dados, grupos: lista }, () => definirGruposCronograma(cronogramaId, ids), msg))
  }
  function salvarAlunos(lista: AcessoCronograma['estudantes'], msg: string) {
    if (!dados) return
    void rodar('alunos', () => aplicar({ ...dados, estudantes: lista }, () => definirEstudantesCronograma(cronogramaId, lista.map((e) => e.id)), msg))
  }

  const semPerm = !podeLiberar
  const titlePerm = semPerm ? 'Sem permissão para liberar' : undefined

  return (
    <section className="space-y-3 rounded-xl border bg-card p-3 sm:p-4" aria-labelledby="crono-acesso-titulo">
      <div>
        <h3 id="crono-acesso-titulo" className="text-sm font-semibold">Acesso dos alunos</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          O cronograma só chega ao aluno se estiver <strong>Liberado</strong> (não em rascunho). O acesso definido aqui <strong>soma</strong> ao que
          vem dos Grupos de acesso (pacotes).
        </p>
      </div>

      {!liberado && (
        <div role="note" className="flex items-start gap-2 rounded-lg border border-amber-400/60 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Este cronograma está em rascunho: ninguém o recebe até ser liberado, mesmo com o acesso configurado abaixo.
        </div>
      )}

      {erro ? (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">{erro}</div>
      ) : !dados ? (
        <div className="space-y-2" aria-busy="true" aria-label="Carregando acesso">
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-9 w-2/3 rounded-lg" />
        </div>
      ) : (
        <>
          <div className={cn('flex items-start gap-3 rounded-xl border p-3 transition-colors', dados.gratuito ? 'border-primary/40 bg-primary/5' : 'bg-background')}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Globe className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="crono-acesso-todos" className="cursor-pointer text-sm font-semibold">Liberar para todos os alunos</label>
                <span className="flex items-center gap-2">
                  {ocupado.geral && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden />}
                  <Switch id="crono-acesso-todos" checked={dados.gratuito} disabled={semPerm || !!ocupado.geral} title={titlePerm}
                    onCheckedChange={(v) => void alternarTodos(!!v)} />
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Quando ligado, <strong>todos os alunos da plataforma recebem este cronograma</strong>. Grupos e estudantes abaixo continuam gravados, mas ficam dispensados.
                {semPerm && ' Você não tem permissão para alterar.'}
              </p>
            </div>
          </div>

          <div className={cn('space-y-3 transition-opacity', dados.gratuito && 'opacity-50')} aria-disabled={dados.gratuito}>
            {/* Grupos */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs font-medium"><Users className="h-3.5 w-3.5 text-muted-foreground" /> Grupos ({dados.grupos.length})</p>
                <span className={cn((semPerm || ocupado.grupos) && 'pointer-events-none opacity-60')} title={titlePerm} aria-disabled={semPerm || !!ocupado.grupos}>
                  <AdicionarGrupoModuloDialog elevado grupos={grupos} jaMarcados={jaGrupos}
                    onSelecionar={(ids) => { if (ids.length) salvarGrupos([...jaGrupos, ...ids], `${ids.length} grupo(s) adicionado(s)`) }} />
                </span>
              </div>
              {dados.grupos.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum grupo vinculado.</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {dados.grupos.map((g) => (
                    <li key={g.id} className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-background py-1 pl-2.5 pr-1 text-xs">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10" style={{ background: g.cor ?? 'var(--muted-foreground)' }} aria-hidden />
                      <span className="truncate font-medium" title={g.nome}>{g.nome}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{g.membros}</span>
                      <button type="button" disabled={semPerm || !!ocupado.grupos} title={semPerm ? titlePerm : 'Remover grupo'} aria-label={`Remover grupo ${g.nome}`}
                        onClick={() => salvarGrupos(dados.grupos.filter((x) => x.id !== g.id).map((x) => x.id), 'Grupo removido')}
                        className="rounded-full p-1 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-40">
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Estudantes */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs font-medium"><UserRound className="h-3.5 w-3.5 text-muted-foreground" /> Estudantes ({dados.estudantes.length})</p>
                <span className={cn((semPerm || ocupado.alunos) && 'pointer-events-none opacity-60')} title={titlePerm} aria-disabled={semPerm || !!ocupado.alunos}>
                  <AdicionarEstudantesDialog elevado jaIds={jaAlunos}
                    onSelecionar={(sel: AlunoSel[]) => {
                      const novos = sel.filter((a) => !jaAlunos.has(a.id)).map((a) => ({ id: a.id, nome: a.nome, email: a.email }))
                      if (novos.length) salvarAlunos([...dados.estudantes, ...novos], `${novos.length} estudante(s) adicionado(s)`)
                    }} />
                </span>
              </div>
              {dados.estudantes.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum estudante específico.</p>
              ) : (
                <ul className="max-h-44 divide-y overflow-y-auto rounded-lg border bg-background">
                  {dados.estudantes.map((e) => (
                    <li key={e.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium" title={e.nome}>{e.nome}</span>
                        {e.email && <span className="block truncate text-muted-foreground" title={e.email}>{e.email}</span>}
                      </span>
                      <button type="button" disabled={semPerm || !!ocupado.alunos} title={semPerm ? titlePerm : 'Remover estudante'} aria-label={`Remover ${e.nome}`}
                        onClick={() => salvarAlunos(dados.estudantes.filter((x) => x.id !== e.id), 'Estudante removido')}
                        className="shrink-0 rounded-full p-1 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-40">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <p className="text-xs text-muted-foreground" aria-live="polite">
            {dados.gratuito
              ? 'Alcance: todos os alunos da plataforma.'
              : `Alcance estimado: ${alcance != null ? alcance.toLocaleString('pt-BR') : dados.grupos.reduce((s, g) => s + g.membros, 0).toLocaleString('pt-BR')} aluno(s) por grupos${alcance == null && dados.grupos.length > 1 ? ' (pode haver repetidos)' : ''} + ${dados.estudantes.length} específico(s).`}
          </p>
        </>
      )}
    </section>
  )
}
