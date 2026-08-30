'use client'

import { useMemo, useState } from 'react'
import { CopyPlus, Loader2, Plus, Repeat2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DisciplinaPicker } from '@/components/cronograma/disciplina-picker'
import type { EntradaMeta } from './metas-actions'
import { criarMetasEmLote, repetirSemana } from './metas-actions'
import type { TipoMetaDef } from '@/lib/cronograma/tipos'

type Disciplina = { id: string; nome: string }

/**
 * O que faltava para montar um cronograma sem desistir.
 *
 * Quem constrói 77 semanas não toma 900 decisões independentes: decide o PADRÃO de uma
 * semana — que disciplina em cada dia, que tipos — e as seguintes são a mesma forma com as
 * aulas avançando. A tela antiga tratava cada meta como decisão isolada, e cada uma custava
 * abrir um diálogo, preencher e salvar. Doze por semana, setenta e sete semanas.
 *
 * Aqui o trabalho vira duas etapas:
 *   1. ADIÇÃO RÁPIDA — monta a semana modelo sem sair do teclado. Enter grava e já deixa o
 *      cursor pronto para a próxima, mantendo tipo e disciplina (que é o que se repete).
 *   2. REPETIR SEMANA — leva o padrão para o intervalo inteiro, somando à aula a cada semana.
 *
 * O diálogo de meta continua existindo para a exceção: a meta que aponta simulado, o ajuste
 * pontual. O que mudou é que a exceção deixou de ser o caminho de todo mundo.
 */
export function MontarSemana({
  cronogramaId,
  semana,
  totalSemanas,
  diasNome,
  tipos,
  disciplinas,
  onCriarDisciplina,
  aoCriar,
}: {
  cronogramaId: string
  semana: number
  totalSemanas: number
  diasNome: string[]
  tipos: TipoMetaDef[]
  disciplinas: Disciplina[]
  /** Criar disciplina pela busca do picker — repassado direto ao DisciplinaPicker. */
  onCriarDisciplina?: (nome: string) => Promise<{ id: string; nome: string } | null>
  /** Recarrega a lista — quem manda no estado é a tela de metas. */
  aoCriar: () => void
}) {
  const [modo, setModo] = useState<'nada' | 'rapido'>('nada')
  const [repetirAberto, setRepetirAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)

  // ── Adição rápida
  const [dia, setDia] = useState(0)
  const [tipo, setTipo] = useState(tipos[0]?.slug ?? '')
  const [disciplina, setDisciplina] = useState('')
  const [disciplinaId, setDisciplinaId] = useState<string | null>(null)
  const [aula, setAula] = useState('')
  const [conteudo, setConteudo] = useState('')
  const [duracao, setDuracao] = useState('')

  const tipoAtual = useMemo(() => tipos.find((t) => t.slug === tipo), [tipos, tipo])

  async function adicionar(avancarDia: boolean) {
    if (!disciplina.trim()) {
      toast.error('Informe a disciplina.')
      return
    }
    if (tipoAtual?.slug === 'simulado') {
      toast.error('Meta de simulado precisa do diálogo completo — ela aponta uma prova.')
      return
    }
    setSalvando(true)
    const meta: EntradaMeta = {
      semana,
      dia,
      tipo,
      disciplina: disciplina.trim(),
      disciplina_id: disciplinaId,
      aula: aula.trim() || null,
      conteudo: conteudo.trim() || null,
      duracao: duracao.trim() || null,
      ordem: 0,
      simulado_id: null,
      simulado_externo_nome: null,
      simulado_externo_url: null,
    }
    const r = await criarMetasEmLote(cronogramaId, [meta])
    setSalvando(false)
    if (!r.ok) {
      toast.error(r.error ?? 'Não foi possível adicionar.')
      return
    }

    /* O que se REPETE fica; o que muda, limpa. Tipo, disciplina e duração costumam valer
       para a linha seguinte; conteúdo e aula, nunca. Guardar isso é o que deixa a mão no
       teclado em vez de reconfigurar tudo a cada meta. */
    setConteudo('')
    setAula((a) => {
      const t = a.trim()
      if (!/^\d+$/.test(t)) return ''
      const novo = String(Number(t) + 1)
      return /^0\d/.test(t) ? novo.padStart(t.length, '0') : novo
    })
    if (avancarDia) setDia((d) => (d + 1) % Math.max(diasNome.length, 1))
    aoCriar()
    toast.success('Meta adicionada', { duration: 1200 })
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={modo === 'rapido' ? 'secondary' : 'outline'}
          onClick={() => setModo((m) => (m === 'rapido' ? 'nada' : 'rapido'))}
        >
          <Plus className="mr-1 h-4 w-4" />
          Adição rápida
        </Button>
        <Button size="sm" variant="outline" onClick={() => setRepetirAberto(true)}>
          <Repeat2 className="mr-1 h-4 w-4" />
          Repetir semana
        </Button>
      </div>

      {/* ── Linha de adição rápida: tudo numa linha, sem diálogo, sem tirar a mão do teclado */}
      {modo === 'rapido' && (
        <div className="border-b bg-primary/5 px-4 py-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-24">
              <Label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Dia</Label>
              <Select value={String(dia)} onValueChange={(v) => setDia(Number(v ?? 0))}>
                <SelectTrigger className="h-8">
                  <SelectValue>{diasNome[dia] ?? `dia ${dia}`}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {diasNome.map((nome, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-44">
              <Label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v ?? tipo)}>
                <SelectTrigger className="h-8">
                  <SelectValue>{tipoAtual?.nome ?? tipo}</SelectValue>
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

            <div className="w-56">
              <Label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Disciplina</Label>
              <DisciplinaPicker
                disciplinas={disciplinas}
                nome={disciplina}
                disciplinaId={disciplinaId}
                onChange={(v) => {
                  setDisciplina(v.nome)
                  setDisciplinaId(v.disciplina_id)
                }}
                onCriar={onCriarDisciplina}
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
                  // Enter grava e segue; Shift+Enter grava sem trocar de dia.
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void adicionar(!e.shiftKey)
                  }
                }}
              />
            </div>

            <div className="w-28">
              <Label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Duração</Label>
              <Input value={duracao} onChange={(e) => setDuracao(e.target.value)} placeholder="1:30" className="h-8" />
            </div>

            <Button size="sm" onClick={() => adicionar(true)} disabled={salvando} className="h-8">
              {salvando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
              Adicionar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setModo('nada')} className="h-8">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <p className="mt-2 text-xs text-muted-foreground">
            <strong>Enter</strong> grava e vai para o próximo dia · <strong>Shift+Enter</strong> grava e fica no mesmo
            dia · a aula avança sozinha, e tipo e disciplina ficam para a próxima.
          </p>
        </div>
      )}

      <DialogoRepetir
        aberto={repetirAberto}
        aoFechar={() => setRepetirAberto(false)}
        cronogramaId={cronogramaId}
        origem={semana}
        totalSemanas={totalSemanas}
        aoConcluir={aoCriar}
      />
    </>
  )
}

/** "Repetir semana" — o multiplicador que transforma 77 semanas numa decisão. */
function DialogoRepetir({
  aberto,
  aoFechar,
  cronogramaId,
  origem,
  totalSemanas,
  aoConcluir,
}: {
  aberto: boolean
  aoFechar: () => void
  cronogramaId: string
  origem: number
  totalSemanas: number
  aoConcluir: () => void
}) {
  const [de, setDe] = useState(Math.min(origem + 1, totalSemanas))
  const [ate, setAte] = useState(totalSemanas)
  const [incremento, setIncremento] = useState(1)
  const [substituir, setSubstituir] = useState(false)
  const [salvando, setSalvando] = useState(false)

  async function repetir() {
    setSalvando(true)
    const r = await repetirSemana(cronogramaId, origem, de, ate, {
      incrementoAula: incremento,
      substituir,
    })
    setSalvando(false)
    if (!r.ok) {
      toast.error(r.error ?? 'Não foi possível repetir.')
      return
    }
    toast.success(
      `${r.criadas} meta(s) em ${r.semanas} semana(s)` +
        (r.puladas?.length ? ` · ${r.puladas.length} pulada(s)` : ''),
    )
    aoConcluir()
    aoFechar()
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CopyPlus className="h-5 w-5 text-primary" />
            Repetir a semana {origem}
          </DialogTitle>
          <DialogDescription>
            Copia as metas desta semana para o intervalo escolhido. É assim que um cronograma longo é
            montado: uma semana bem feita, e as seguintes com as aulas avançando.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label className="mb-1 block text-xs">Da semana</Label>
              <Input
                type="number"
                min={1}
                max={totalSemanas}
                value={de}
                onChange={(e) => setDe(Number(e.target.value))}
                className="h-9"
              />
            </div>
            <span className="pb-2 text-sm text-muted-foreground">até</span>
            <div className="flex-1">
              <Label className="mb-1 block text-xs">a semana</Label>
              <Input
                type="number"
                min={1}
                max={totalSemanas}
                value={ate}
                onChange={(e) => setAte(Number(e.target.value))}
                className="h-9"
              />
            </div>
          </div>

          <div>
            <Label className="mb-1 block text-xs">A cada semana, somar à aula</Label>
            <div className="flex gap-1.5">
              {[0, 1, 2].map((n) => (
                <button
                  key={n}
                  onClick={() => setIncremento(n)}
                  className={`h-9 flex-1 rounded-lg border text-sm transition ${
                    incremento === n ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'
                  }`}
                >
                  {n === 0 ? 'nada (repete igual)' : `+${n}`}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              O formato é preservado: <code>01</code> vira <code>02</code>, não <code>2</code> — o link da aula casa
              por texto exato.
            </p>
          </div>

          <label className="flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm">
            <input
              type="checkbox"
              checked={substituir}
              onChange={(e) => setSubstituir(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
            />
            <span>
              <strong>Substituir as semanas que já têm metas</strong>
              <span className="block text-xs text-muted-foreground">
                Desligado, elas são puladas e o que já existe fica intacto. Ligado, as metas atuais dessas
                semanas são apagadas antes.
              </span>
            </span>
          </label>

          <p className="text-xs text-muted-foreground">
            Semanas marcadas como revisão no cadastro ficam de fora sozinhas — elas não têm metas de
            propósito.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={aoFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={repetir} disabled={salvando}>
            {salvando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Repetir para {Math.max(0, ate - de + 1)} semana(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
