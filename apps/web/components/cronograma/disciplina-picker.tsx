'use client'

/**
 * Seletor de disciplina com busca.
 *
 * Um `<Select>` comum não serve aqui por dois motivos: o cadastro tem ~37 disciplinas, e
 * várias têm nomes longos e parecidos ("Direito do Trabalho e Direito Processual do
 * Trabalho" × "Direito do Trabalho e Processo do Trabalho"). Sem busca, achar a certa é
 * rolagem e adivinhação; e o painel do Select herda a largura do gatilho, cortando o
 * nome justamente onde ele se diferencia.
 *
 * Aqui o painel tem largura própria, o texto não é truncado, e digitar filtra.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, Loader2, Plus, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PSEUDO_DISCIPLINA } from '@/lib/cronograma/tipos'

export type DisciplinaOpcao = { id: string; nome: string }

/** Sem acento e sem caixa, para "economico" achar "Direito Econômico". */
const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

export function DisciplinaPicker({
  disciplinas,
  nome,
  disciplinaId,
  onChange,
  onCriar,
}: {
  disciplinas: DisciplinaOpcao[]
  /** Nome atual — pode ser texto legado que não está no cadastro. */
  nome: string
  disciplinaId: string | null
  onChange: (v: { nome: string; disciplina_id: string | null }) => void
  /**
   * Quando passado, habilita "criar disciplina" pela busca — devolve a criada (ou a existente
   * reaproveitada), ou `null` em caso de erro. Sem isso, o picker só seleciona.
   */
  onCriar?: (nome: string) => Promise<{ id: string; nome: string } | null>
}) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const [criando, setCriando] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)
  const campoBusca = useRef<HTMLInputElement>(null)

  // Fecha ao clicar fora — o painel é absoluto e não captura o clique do documento.
  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])

  useEffect(() => {
    if (aberto) campoBusca.current?.focus()
    else setBusca('')
  }, [aberto])

  const filtradas = useMemo(() => {
    const t = normalizar(busca)
    if (!t) return disciplinas
    // Casa por trecho em qualquer posição: "proc civil" acha "Direito Processual Civil".
    const termos = t.split(/\s+/)
    return disciplinas.filter((d) => {
      const alvo = normalizar(d.nome)
      return termos.every((x) => alvo.includes(x))
    })
  }, [disciplinas, busca])

  const ehAtividade = nome.trim() === PSEUDO_DISCIPLINA
  const foraDoCadastro = !!nome && !disciplinaId && !ehAtividade

  function escolher(v: { nome: string; disciplina_id: string | null }) {
    onChange(v)
    setAberto(false)
  }

  const termoLimpo = busca.trim()
  const temExato = useMemo(
    () => disciplinas.some((d) => normalizar(d.nome) === normalizar(termoLimpo)),
    [disciplinas, termoLimpo],
  )
  const podeCriar = !!onCriar && termoLimpo.length >= 2 && !temExato && normalizar(termoLimpo) !== normalizar(PSEUDO_DISCIPLINA)

  async function criar() {
    if (!onCriar || criando || !podeCriar) return
    setCriando(true)
    const nova = await onCriar(termoLimpo)
    setCriando(false)
    if (nova) escolher({ nome: nova.nome, disciplina_id: nova.id })
  }

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className={cn(
          'flex h-9 w-full items-center justify-between gap-2 rounded-md border px-3 text-sm transition',
          'hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring',
          foraDoCadastro && 'border-amber-400',
        )}
      >
        <span className={cn('truncate text-left', !nome && 'text-muted-foreground')}>
          {ehAtividade ? `${PSEUDO_DISCIPLINA} (sem matéria)` : nome || 'Selecione a disciplina'}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
      </button>

      {foraDoCadastro && (
        <p className="mt-1 flex items-start gap-1 text-xs text-amber-600">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            “{nome}” não está no cadastro de disciplinas. Escolha a equivalente para os links das aulas
            casarem mesmo se a grafia mudar.
          </span>
        </p>
      )}

      {aberto && (
        // Largura própria (não herda a do gatilho) e sem truncar: é onde o Select falhava.
        <div className="absolute z-50 mt-1 w-[min(28rem,90vw)] overflow-hidden rounded-lg border bg-popover shadow-lg">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              ref={campoBusca}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setAberto(false)
                if (e.key === 'Enter') {
                  if (filtradas.length === 1) escolher({ nome: filtradas[0].nome, disciplina_id: filtradas[0].id })
                  else if (podeCriar) void criar()
                }
              }}
              placeholder="Buscar disciplina…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {busca && (
              <button type="button" onClick={() => setBusca('')} className="shrink-0">
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto py-1">
            {/* Criar pela busca: fecha a lacuna de precisar sair para Questões só para
                cadastrar uma disciplina nova antes de montar a meta. */}
            {podeCriar && (
              <>
                <button
                  type="button"
                  onClick={() => void criar()}
                  disabled={criando}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-primary transition hover:bg-primary/10 disabled:opacity-60"
                >
                  {criando ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <Plus className="h-3.5 w-3.5 shrink-0" />}
                  <span className="min-w-0 flex-1">
                    Criar “<span className="font-medium">{termoLimpo}</span>”
                  </span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">nova disciplina</span>
                </button>
                <div className="my-1 border-t" />
              </>
            )}

            {/* R13 — `Atividade` não é disciplina: é o valor usado quando a linha não
                pertence a uma matéria. Por isso não vive no cadastro compartilhado. */}
            <Opcao
              rotulo={`${PSEUDO_DISCIPLINA} (sem matéria)`}
              ativa={ehAtividade}
              onClick={() => escolher({ nome: PSEUDO_DISCIPLINA, disciplina_id: null })}
            />

            <div className="my-1 border-t" />

            {filtradas.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                Nenhuma disciplina encontrada.
                <br />
                <span className="text-xs">O cadastro é o mesmo dos simulados, em Questões → Disciplinas.</span>
              </p>
            ) : (
              filtradas.map((d) => (
                <Opcao
                  key={d.id}
                  rotulo={d.nome}
                  ativa={d.id === disciplinaId}
                  onClick={() => escolher({ nome: d.nome, disciplina_id: d.id })}
                />
              ))
            )}
          </div>

          <div className="border-t px-3 py-1.5 text-xs text-muted-foreground">
            {filtradas.length} de {disciplinas.length} disciplina(s)
          </div>
        </div>
      )}
    </div>
  )
}

function Opcao({ rotulo, ativa, onClick }: { rotulo: string; ativa: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-start gap-2 px-3 py-1.5 text-left text-sm transition hover:bg-muted',
        ativa && 'bg-muted/60 font-medium',
      )}
    >
      <Check className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', ativa ? 'opacity-100 text-primary' : 'opacity-0')} />
      {/* Sem truncate: o nome inteiro quebra em linhas — é o que diferencia as parecidas. */}
      <span className="min-w-0 flex-1">{rotulo}</span>
    </button>
  )
}
