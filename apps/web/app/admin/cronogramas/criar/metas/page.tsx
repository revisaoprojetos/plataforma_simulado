'use client'

import { useEffect, useMemo, useState } from 'react'
import { CopyPlus, Loader2, Plus, Repeat2, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DisciplinaPicker } from '@/components/cronograma/disciplina-picker'
import { somarAula } from '@/lib/cronograma/aula'
import type { TipoMetaDef } from '@/lib/cronograma/tipos'
import { useCriar, useGuardStep, type MetaDraft } from '../criar-context'
import { Etapa } from '../etapa'
import { dadosMetas } from '../dados'
import { criarDisciplina } from '../../[id]/metas-actions'

function novoTmpId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `m_${Date.now()}_${Math.round(Math.random() * 1e6)}`
}

export default function MetasPage() {
  useGuardStep(2)
  const { draft, patch } = useCriar()
  const [tipos, setTipos] = useState<TipoMetaDef[]>([])
  const [disciplinas, setDisciplinas] = useState<{ id: string; nome: string }[]>([])
  const [semanaAtiva, setSemanaAtiva] = useState(1)
  const [repetirAberto, setRepetirAberto] = useState(false)

  useEffect(() => {
    dadosMetas().then((r) => {
      if (r.ok) {
        setTipos(r.tipos ?? [])
        setDisciplinas(r.disciplinas ?? [])
      }
    })
  }, [])

  // ── Adição rápida
  const [dia, setDia] = useState(0)
  const [tipo, setTipo] = useState('')
  const [disciplina, setDisciplina] = useState('')
  const [disciplinaId, setDisciplinaId] = useState<string | null>(null)
  const [aula, setAula] = useState('')
  const [conteudo, setConteudo] = useState('')
  const [duracao, setDuracao] = useState('')
  useEffect(() => {
    if (!tipo && tipos[0]) setTipo(tipos[0].slug)
  }, [tipos, tipo])

  const revisao = useMemo(() => new Set(draft.semanasRevisao), [draft.semanasRevisao])
  const rotuloTipo = (slug: string) => tipos.find((t) => t.slug === slug)?.nome ?? slug
  const corTipo = (slug: string) => tipos.find((t) => t.slug === slug)?.cor || null

  const contagem = useMemo(() => {
    const m = new Map<number, number>()
    for (const x of draft.metas) m.set(x.semana, (m.get(x.semana) ?? 0) + 1)
    return m
  }, [draft.metas])

  const metasSemana = useMemo(
    () => draft.metas.filter((m) => m.semana === semanaAtiva).sort((a, b) => a.dia - b.dia || a.ordem - b.ordem),
    [draft.metas, semanaAtiva],
  )
  const porDia = useMemo(() => {
    const mapa = new Map<number, MetaDraft[]>()
    for (const m of metasSemana) {
      const l = mapa.get(m.dia)
      if (l) l.push(m)
      else mapa.set(m.dia, [m])
    }
    return [...mapa.entries()].sort((a, b) => a[0] - b[0])
  }, [metasSemana])

  async function criarDisciplinaLocal(nome: string) {
    const r = await criarDisciplina(nome)
    if (!r.ok || !r.id) {
      toast.error(r.error ?? 'Não foi possível criar a disciplina.')
      return null
    }
    const nova = { id: r.id, nome: r.nome ?? nome.trim() }
    setDisciplinas((xs) => (xs.some((d) => d.id === nova.id) ? xs : [...xs, nova].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))))
    return nova
  }

  function adicionar(avancarDia: boolean) {
    if (!disciplina.trim()) {
      toast.error('Informe a disciplina.')
      return
    }
    if (tipo === 'simulado') {
      toast.error('Meta de simulado se adiciona depois, no editor — ela aponta uma prova.')
      return
    }
    const ordem = metasSemana.filter((m) => m.dia === dia).length
    const nova: MetaDraft = {
      tmpId: novoTmpId(),
      semana: semanaAtiva,
      dia,
      tipo,
      disciplina: disciplina.trim(),
      disciplina_id: disciplinaId,
      aula: aula.trim() || null,
      conteudo: conteudo.trim() || null,
      duracao: duracao.trim() || null,
      ordem,
    }
    patch({ metas: [...draft.metas, nova] })
    // O que se repete fica (tipo/disciplina/duração); conteúdo limpa e a aula avança sozinha.
    setConteudo('')
    setAula((a) => {
      const t = a.trim()
      if (!/^\d+$/.test(t)) return ''
      const novo = String(Number(t) + 1)
      return /^0\d/.test(t) ? novo.padStart(t.length, '0') : novo
    })
    if (avancarDia) setDia((d) => (d + 1) % Math.max(draft.diasNome.length, 1))
    toast.success('Meta adicionada', { duration: 900 })
  }

  function remover(tmpId: string) {
    patch({ metas: draft.metas.filter((m) => m.tmpId !== tmpId) })
  }

  function repetir(de: number, ate: number, incremento: number, substituir: boolean) {
    const base = draft.metas.filter((m) => m.semana === semanaAtiva)
    if (!base.length) {
      toast.error('Esta semana não tem metas para repetir.')
      return
    }
    let outras = draft.metas
    const criadas: MetaDraft[] = []
    const puladas: number[] = []
    for (let s = de; s <= ate; s++) {
      if (s === semanaAtiva) continue
      if (revisao.has(s)) {
        puladas.push(s)
        continue
      }
      const jaTem = draft.metas.some((m) => m.semana === s)
      if (jaTem && !substituir) {
        puladas.push(s)
        continue
      }
      if (jaTem && substituir) outras = outras.filter((m) => m.semana !== s)
      const passos = s - semanaAtiva
      for (const m of base) criadas.push({ ...m, tmpId: novoTmpId(), semana: s, aula: somarAula(m.aula, passos * incremento) })
    }
    if (!criadas.length) {
      toast.error('Nenhuma semana no intervalo para preencher.')
      return
    }
    patch({ metas: [...outras, ...criadas] })
    setRepetirAberto(false)
    toast.success(
      `${criadas.length} meta(s) em ${new Set(criadas.map((m) => m.semana)).size} semana(s)` +
        (puladas.length ? ` · ${puladas.length} pulada(s)` : ''),
    )
  }

  return (
    <Etapa
      titulo="Metas & Conteúdos"
      descricao="Monte a semana-modelo (disciplina, aula, conteúdo por dia) e use “Repetir semana” para levar o padrão adiante — a aula avança sozinha. Tudo fica em memória e é gravado só ao criar."
    >
      {/* Régua de semanas */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1 overflow-x-auto rounded-xl border bg-card p-2 shadow-sm">
          {Array.from({ length: Math.max(1, draft.totalSemanas) }, (_, i) => i + 1).map((s) => {
            const n = contagem.get(s) ?? 0
            const ehRevisao = revisao.has(s)
            const ativa = s === semanaAtiva
            return (
              <button
                key={s}
                onClick={() => setSemanaAtiva(s)}
                title={ehRevisao ? `Semana ${s} — revisão (sem metas de propósito)` : `Semana ${s} — ${n} meta(s)`}
                className={cn(
                  'relative h-8 min-w-8 shrink-0 rounded-md border px-1.5 text-xs transition',
                  ativa
                    ? 'border-primary bg-primary font-semibold text-primary-foreground'
                    : ehRevisao
                      ? 'border-dashed text-muted-foreground/70'
                      : n > 0
                        ? 'border-primary/40 bg-primary/5'
                        : 'hover:bg-muted',
                )}
              >
                {s}
                {n > 0 && !ativa && (
                  <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-primary ring-2 ring-card" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Adição rápida */}
      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">
            Semana {semanaAtiva}
            {revisao.has(semanaAtiva) && <span className="ml-2 text-xs font-normal text-amber-600">marcada como revisão</span>}
          </p>
          <Button size="sm" variant="outline" onClick={() => setRepetirAberto((v) => !v)} disabled={!metasSemana.length}>
            <Repeat2 className="mr-1 h-4 w-4" />
            Repetir semana
          </Button>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="w-24">
            <Label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Dia</Label>
            <Select value={String(dia)} onValueChange={(v) => setDia(Number(v ?? 0))}>
              <SelectTrigger className="h-8">
                <SelectValue>{draft.diasNome[dia] ?? `dia ${dia}`}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {draft.diasNome.map((nome, i) => (
                  <SelectItem key={i} value={String(i)}>
                    {nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-40">
            <Label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v ?? tipo)}>
              <SelectTrigger className="h-8">
                <SelectValue>{rotuloTipo(tipo)}</SelectValue>
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

          <div className="w-52">
            <Label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Disciplina</Label>
            <DisciplinaPicker
              disciplinas={disciplinas}
              nome={disciplina}
              disciplinaId={disciplinaId}
              onChange={(v) => {
                setDisciplina(v.nome)
                setDisciplinaId(v.disciplina_id)
              }}
              onCriar={criarDisciplinaLocal}
            />
          </div>

          <div className="w-20">
            <Label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Aula</Label>
            <Input value={aula} onChange={(e) => setAula(e.target.value)} placeholder="01" className="h-8" />
          </div>

          <div className="min-w-52 flex-1">
            <Label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Conteúdo</Label>
            <Input
              value={conteudo}
              onChange={(e) => setConteudo(e.target.value)}
              placeholder="O que o aluno estuda"
              className="h-8"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  adicionar(!e.shiftKey)
                }
              }}
            />
          </div>

          <div className="w-24">
            <Label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Duração</Label>
            <Input value={duracao} onChange={(e) => setDuracao(e.target.value)} placeholder="1:30" className="h-8" />
          </div>

          <Button size="sm" onClick={() => adicionar(true)} className="h-8">
            <Plus className="mr-1 h-4 w-4" />
            Adicionar
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          <strong>Enter</strong> grava e vai para o próximo dia · <strong>Shift+Enter</strong> fica no mesmo dia · a aula avança sozinha.
        </p>

        {repetirAberto && (
          <RepetirSemana
            origem={semanaAtiva}
            totalSemanas={draft.totalSemanas}
            aoRepetir={repetir}
            aoFechar={() => setRepetirAberto(false)}
          />
        )}
      </div>

      {/* Metas da semana */}
      <div className="rounded-2xl border bg-card shadow-sm">
        {metasSemana.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            {revisao.has(semanaAtiva)
              ? 'Semana de revisão — por definição fica sem metas.'
              : 'Nenhuma meta nesta semana ainda. Use a adição rápida acima.'}
          </p>
        ) : (
          <div className="divide-y">
            {porDia.map(([d, lista]) => (
              <div key={d} className="px-4 py-2">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {draft.diasNome[d] ?? `dia ${d}`}
                </p>
                <div className="space-y-1">
                  {lista.map((m) => (
                    <div key={m.tmpId} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/40">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: corTipo(m.tipo) ?? 'var(--muted-foreground)' }} />
                      <span className="w-20 shrink-0 truncate text-xs text-muted-foreground">{rotuloTipo(m.tipo)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate">
                          {m.disciplina}
                          {m.aula && <span className="text-muted-foreground"> · aula {m.aula}</span>}
                        </p>
                        {m.conteudo && <p className="truncate text-xs text-muted-foreground">{m.conteudo}</p>}
                      </div>
                      {m.duracao && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{m.duracao}</span>}
                      <Button size="sm" variant="ghost" className="h-7 w-7 shrink-0 p-0" onClick={() => remover(m.tmpId)} title="Excluir">
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        {draft.metas.length.toLocaleString('pt-BR')} meta(s) no total. Ajustes finos (mover, editar linha, meta de
        simulado) ficam melhores no editor, depois de criar.
      </p>
    </Etapa>
  )
}

/** Formulário inline de "repetir semana" — leva o padrão desta semana para um intervalo. */
function RepetirSemana({
  origem,
  totalSemanas,
  aoRepetir,
  aoFechar,
}: {
  origem: number
  totalSemanas: number
  aoRepetir: (de: number, ate: number, incremento: number, substituir: boolean) => void
  aoFechar: () => void
}) {
  const [de, setDe] = useState(Math.min(origem + 1, totalSemanas))
  const [ate, setAte] = useState(totalSemanas)
  const [incremento, setIncremento] = useState(1)
  const [substituir, setSubstituir] = useState(false)

  return (
    <div className="mt-3 space-y-3 rounded-xl border bg-muted/30 p-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <CopyPlus className="h-4 w-4 text-primary" />
        Repetir a semana {origem}
        <button onClick={aoFechar} className="ml-auto text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-24">
          <Label className="mb-1 block text-xs">Da semana</Label>
          <Input type="number" min={1} max={totalSemanas} value={de} onChange={(e) => setDe(Number(e.target.value))} className="h-8" />
        </div>
        <div className="w-24">
          <Label className="mb-1 block text-xs">até</Label>
          <Input type="number" min={1} max={totalSemanas} value={ate} onChange={(e) => setAte(Number(e.target.value))} className="h-8" />
        </div>
        <div>
          <Label className="mb-1 block text-xs">Somar à aula</Label>
          <div className="flex gap-1">
            {[0, 1, 2].map((n) => (
              <button
                key={n}
                onClick={() => setIncremento(n)}
                className={cn('h-8 rounded-md border px-2 text-xs transition', incremento === n ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}
              >
                {n === 0 ? 'nada' : `+${n}`}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={substituir} onChange={(e) => setSubstituir(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--primary)]" />
          substituir semanas com metas
        </label>
        <Button size="sm" onClick={() => aoRepetir(de, ate, incremento, substituir)} className="h-8">
          Repetir
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        O formato é preservado: <code>01</code> vira <code>02</code>. Semanas de revisão ficam de fora.
      </p>
    </div>
  )
}
