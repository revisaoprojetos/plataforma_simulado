'use client'

import { useMemo, useState, useTransition } from 'react'
import { AlertTriangle, CalendarDays, ListChecks, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DisciplinaPicker } from '@/components/cronograma/disciplina-picker'
import { SimuladoPicker, type SimuladoOpcao } from '@/components/cronograma/simulado-picker'
import type { MetaFonte, TipoMeta, TipoMetaDef } from '@/lib/cronograma/tipos'
import { faixaSemanal } from '@/lib/cronograma/faixa'
import {
  atualizarMeta,
  criarMeta,
  excluirMeta,
  type CronogramaDetalhe,
  type Diagnostico,
  type EntradaMeta,
} from './metas-actions'

const novaMeta = (semana: number, tipo: string): EntradaMeta => ({
  semana,
  dia: 0,
  tipo,
  disciplina: '',
  disciplina_id: null,
  aula: null,
  conteudo: null,
  duracao: null,
  ordem: 0,
  simulado_id: null,
  simulado_externo_nome: null,
  simulado_externo_url: null,
})

export function MetasClient({
  cronograma: c,
  metasIniciais,
  tipos,
  disciplinas,
  simulados,
  diagnostico,
}: {
  cronograma: CronogramaDetalhe
  metasIniciais: MetaFonte[]
  tipos: TipoMetaDef[]
  disciplinas: { id: string; nome: string }[]
  simulados: SimuladoOpcao[]
  diagnostico: Diagnostico
}) {
  // Rótulo e ordem vêm do cadastro de tipos, não de constantes no código.
  const porSlug = useMemo(() => new Map(tipos.map((t) => [t.slug, t])), [tipos])
  const rotulo = (slug: string) => porSlug.get(slug)?.nome ?? slug
  const ordemDoTipo = (slug: string) => porSlug.get(slug)?.ordem ?? 999
  const [metas, setMetas] = useState(metasIniciais)
  const [pendente, iniciar] = useTransition()
  const [semanaAtiva, setSemanaAtiva] = useState<number>(1)
  const [aberto, setAberto] = useState(false)
  const [editando, setEditando] = useState<string | null>(null)
  const [form, setForm] = useState<EntradaMeta>(novaMeta(1, tipos[0]?.slug ?? 'pdfull'))

  const revisao = useMemo(() => new Set(c.semanas_revisao), [c.semanas_revisao])

  // Contagem por semana, para a régua de navegação mostrar onde há conteúdo.
  const porSemana = useMemo(() => {
    const mapa = new Map<number, MetaFonte[]>()
    for (const m of metas) {
      const l = mapa.get(m.semana)
      if (l) l.push(m)
      else mapa.set(m.semana, [m])
    }
    for (const lista of mapa.values()) {
      lista.sort((a, b) => a.dia - b.dia || ordemDoTipo(a.tipo) - ordemDoTipo(b.tipo) || a.ordem - b.ordem)
    }
    return mapa
  }, [metas, porSlug])

  const daSemana = porSemana.get(semanaAtiva) ?? []

  const avisos = useMemo(() => {
    const xs: string[] = []
    const d = diagnostico
    if (d.semanasComMetasEmRevisao.length) {
      xs.push(
        `Semana(s) ${d.semanasComMetasEmRevisao.join(', ')} estão marcadas como revisão mas têm metas. Na geração as metas são ignoradas — corrija a marcação ou mova as metas.`,
      )
    }
    if (d.metasForaDosDias) xs.push(`${d.metasForaDosDias} meta(s) com dia fora dos ${c.dias_curso.length} dias de curso.`)
    if (d.metasForaDasSemanas) xs.push(`${d.metasForaDasSemanas} meta(s) fora do intervalo de ${c.total_semanas} semanas.`)
    if (d.questoesSemLink.length) {
      xs.push(
        `${d.questoesSemLink.length} par(es) disciplina/aula de questões sem link cadastrado — o aluno verá "Não há link do QC/TEC". Ex.: ${d.questoesSemLink
          .slice(0, 3)
          .map((q) => `${q.disciplina} · aula ${q.aula}`)
          .join('; ')}`,
      )
    }
    if (d.duracoesDivergentes.length) {
      xs.push(
        `${d.duracoesDivergentes.length} combinação(ões) de semana+tipo com durações diferentes. No DOCX só a primeira é impressa; as demais somem.`,
      )
    }
    if (d.semanasVazias.length) {
      xs.push(`Semana(s) sem metas e não marcadas como revisão: ${d.semanasVazias.join(', ')}. Elas somem da grade gerada.`)
    }
    return xs
  }, [diagnostico, c])

  function abrirNova() {
    setEditando(null)
    setForm(novaMeta(semanaAtiva, tipos[0]?.slug ?? 'pdfull'))
    setAberto(true)
  }

  function abrirEdicao(m: MetaFonte) {
    setEditando(m.id)
    setForm({
      semana: m.semana,
      dia: m.dia,
      tipo: m.tipo,
      disciplina: m.disciplina,
      disciplina_id: m.disciplina_id ?? null,
      aula: m.aula,
      conteudo: m.conteudo,
      duracao: m.duracao,
      ordem: m.ordem,
      simulado_id: m.simulado_id,
      simulado_externo_nome: m.simulado_externo_nome,
      simulado_externo_url: m.simulado_externo_url,
    })
    setAberto(true)
  }

  function salvar() {
    iniciar(async () => {
      const r = editando ? await atualizarMeta(c.id, editando, form) : await criarMeta(c.id, form)
      if (!r.ok) {
        toast.error(r.error ?? 'Não foi possível salvar.')
        return
      }
      toast.success(editando ? 'Meta atualizada' : 'Meta adicionada')
      setAberto(false)
      if (editando) {
        setMetas((xs) => xs.map((m) => (m.id === editando ? ({ ...m, ...form } as MetaFonte) : m)))
      } else {
        setMetas((xs) => [...xs, { ...(form as any), id: (r as any).id }])
      }
      setSemanaAtiva(form.semana)
    })
  }

  function remover(m: MetaFonte) {
    iniciar(async () => {
      const sim = await confirmar({
        titulo: 'Excluir meta',
        mensagem: `Remover "${m.disciplina}${m.aula ? ` · aula ${m.aula}` : ''}" da semana ${m.semana}?`,
        destrutivo: true,
      })
      if (!sim) return
      const r = await excluirMeta(c.id, m.id)
      if (!r.ok) {
        toast.error(r.error ?? 'Não foi possível excluir.')
        return
      }
      toast.success('Meta excluída')
      setMetas((xs) => xs.filter((x) => x.id !== m.id))
    })
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <CalendarDays className="h-6 w-6 text-primary" />
            {c.nome}
          </h1>
          <p className="text-muted-foreground">
            {c.carga_horaria}h/dia · {faixaSemanal(c.dias_curso)} · {c.total_semanas} semanas · {metas.length} metas
            {c.semanas_revisao.length > 0 && ` · revisão original nas semanas ${c.semanas_revisao.join(', ')}`}
          </p>
        </div>
        <Badge variant={c.status === 'liberado' ? 'default' : 'secondary'}>
          {c.status === 'liberado' ? 'Liberado' : 'Rascunho'}
        </Badge>
      </div>

      {avisos.length > 0 && (
        <AlertBox variante="aviso" titulo="Pontos de atenção nos dados" icon={AlertTriangle}>
          <ul className="ml-4 list-disc space-y-1 text-sm">
            {avisos.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </AlertBox>
      )}

      <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
        <SecaoHeader
          icon={ListChecks}
          titulo={`Semana ${semanaAtiva}${revisao.has(semanaAtiva) ? ' · revisão original' : ''}`}
          subtitulo={`${daSemana.length} meta(s) nesta semana`}
          acao={
            <Button size="sm" onClick={abrirNova} disabled={pendente}>
              <Plus className="mr-1 h-4 w-4" />
              Nova meta
            </Button>
          }
        />

        {/* Régua de semanas: mostra de relance onde há conteúdo, revisão e buracos. */}
        <div className="flex flex-wrap gap-1 border-b px-4 py-3">
          {Array.from({ length: c.total_semanas }, (_, i) => i + 1).map((s) => {
            const n = porSemana.get(s)?.length ?? 0
            const ehRevisao = revisao.has(s)
            return (
              <button
                key={s}
                onClick={() => setSemanaAtiva(s)}
                title={ehRevisao ? 'Semana de revisão original' : `${n} meta(s)`}
                className={`h-8 min-w-8 rounded-md border px-1.5 text-xs transition ${
                  s === semanaAtiva
                    ? 'border-primary bg-primary text-primary-foreground'
                    : ehRevisao
                      ? 'border-dashed text-muted-foreground'
                      : n === 0
                        ? 'border-amber-300 text-amber-700 dark:text-amber-500'
                        : 'hover:bg-muted'
                }`}
              >
                {s}
              </button>
            )
          })}
        </div>

        {daSemana.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            {revisao.has(semanaAtiva)
              ? 'Semana de revisão original — por definição não tem metas.'
              : 'Nenhuma meta nesta semana. Semanas vazias somem da grade gerada.'}
          </div>
        ) : (
          <div className="divide-y">
            {daSemana.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 hover:bg-muted/30">
                <Badge variant="outline" className="shrink-0">
                  {c.dias_nome[m.dia] ?? `dia ${m.dia}`}
                </Badge>
                <Badge variant="secondary" className="shrink-0">
                  {rotulo(m.tipo)}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {m.disciplina}
                    {m.aula && <span className="text-muted-foreground"> · aula {m.aula}</span>}
                  </p>
                  {m.conteudo && <p className="truncate text-xs text-muted-foreground">{m.conteudo}</p>}
                </div>
                {m.duracao && <span className="shrink-0 text-xs text-muted-foreground">{m.duracao}</span>}
                <div className="flex shrink-0 items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => abrirEdicao(m)} disabled={pendente}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remover(m)} disabled={pendente}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[88vh] overflow-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar meta' : 'Nova meta'}</DialogTitle>
            <DialogDescription>
              Correção avulsa, sem precisar reimportar o cronograma inteiro.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* ── Onde a meta fica na grade */}
            <Secao titulo="Posição na grade">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Semana</Label>
                  <Input
                    type="number"
                    min={1}
                    max={c.total_semanas}
                    value={form.semana}
                    onChange={(e) => setForm((f) => ({ ...f, semana: Number(e.target.value) }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Dia</Label>
                  <Select value={String(form.dia)} onValueChange={(v) => setForm((f) => ({ ...f, dia: Number(v) }))}>
                    <SelectTrigger>
                      <SelectValue>{c.dias_nome[form.dia] ?? `dia ${form.dia}`}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {c.dias_nome.map((nome, i) => (
                        <SelectItem key={i} value={String(i)}>
                          {nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Ordem</Label>
                  <Input
                    type="number"
                    value={form.ordem}
                    onChange={(e) => setForm((f) => ({ ...f, ordem: Number(e.target.value) }))}
                  />
                  <p className="text-xs text-muted-foreground">Desempate dentro do dia.</p>
                </div>
              </div>
            </Secao>

            {/* ── O que o aluno vê */}
            <Secao titulo="Conteúdo">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Tipo</Label>
                  <Select value={form.tipo} onValueChange={(v) => setForm((f) => ({ ...f, tipo: (v ?? '') as TipoMeta }))}>
                    <SelectTrigger>
                      {/* O gatilho deste Select mostra o VALOR cru; passamos o rótulo. */}
                      <SelectValue>{rotulo(form.tipo)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {tipos.map((t) => (
                        <SelectItem key={t.slug} value={t.slug}>
                          {t.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Aula</Label>
                  <Input
                    value={form.aula ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, aula: e.target.value }))}
                    placeholder="01"
                  />
                  <p className="text-xs text-muted-foreground">Texto, não número: “01” e “1” são aulas diferentes.</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Disciplina</Label>
                <DisciplinaPicker
                  disciplinas={disciplinas}
                  nome={form.disciplina}
                  disciplinaId={form.disciplina_id}
                  onChange={(v) => setForm((f) => ({ ...f, ...v }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Conteúdo</Label>
                <Textarea
                  rows={2}
                  value={form.conteudo ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, conteudo: e.target.value }))}
                  placeholder="O que o aluno estuda nesta meta"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Duração</Label>
                <Input
                  value={form.duracao ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, duracao: e.target.value }))}
                  placeholder="3 - 4h"
                  className="sm:w-48"
                />
              </div>
            </Secao>

            {/* ── Só aparece quando o tipo aponta simulado */}
            {form.tipo === 'simulado' && (
              <Secao titulo="Destino do simulado">
                <SimuladoPicker
                  simulados={simulados}
                  simuladoId={form.simulado_id}
                  externoNome={form.simulado_externo_nome}
                  externoUrl={form.simulado_externo_url}
                  onChange={(v) => setForm((f) => ({ ...f, ...v }))}
                />
              </Secao>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setAberto(false)} disabled={pendente}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={pendente}>
              {pendente ? 'Salvando…' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Bloco do formulário com título — evita a coluna única e longa de antes. */
function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
      {children}
    </div>
  )
}
