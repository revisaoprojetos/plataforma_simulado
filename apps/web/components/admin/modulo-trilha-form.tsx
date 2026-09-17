'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Loader2, Save, RotateCcw, Route, PencilRuler, ArrowDownUp } from 'lucide-react'
import { salvarTrilhaAparenciaModulo } from '@/app/admin/leitura/actions'
import { type TrilhaAparencia, type TrilhaLivreConfig } from '@/lib/leitura/trilha-aparencia'
import { DEFAULT_TRILHA_SIMBOLOS, type TrilhaSimbolos, type SimboloEstado } from '@/lib/gamificacao/trilha-simbolos'
import { DEFAULT_TRILHA_FORMATO, type TrilhaFormato } from '@/lib/gamificacao/trilha-formato'
import { TrilhaSimbolosEditor } from '@/components/gamificacao/trilha-simbolos-editor'
import { FormatoSelector } from '@/components/gamificacao/formato-selector'
import { TrilhaFormatoPreview } from '@/components/gamificacao/trilha-formato-preview'
import { TrilhaLivre, type NoLivre } from '@/components/aluno/trilha-livre'
import type { Trilha } from '@/components/aluno/trilha-simulados'

/**
 * "Editar trilha" DO MÓDULO: formato + símbolos/cores + (formato 'livre') construtor visual com as aulas
 * REAIS do módulo, arraste de nós e curvas, sobre a imagem de fundo. Salva em simulado_pastas.trilha_aparencia.
 */
export function ModuloTrilhaForm({ pastaId, atual, capa, aulas }: {
  pastaId: string; atual: TrilhaAparencia; capa?: string | null; aulas: { id: string; titulo: string }[]
}) {
  const [simbolos, setSimbolos] = useState<TrilhaSimbolos>(atual.simbolos)
  const [formato, setFormato] = useState<TrilhaFormato>(atual.formato)
  const [livre, setLivre] = useState<TrilhaLivreConfig>(atual.livre)
  const [inverter, setInverter] = useState<boolean>(atual.inverter)
  const [pending, start] = useTransition()
  const invertivel = formato === 'serpentina' || formato === 'reta'

  // Estados só p/ ilustrar os 3 estilos de símbolo na prévia (a real vem do progresso do aluno).
  const estadoDe = (i: number): SimboloEstado => (i === 0 ? 'concluido' : i === 1 ? 'atual' : 'disponivel')
  const nosLivre: NoLivre[] = useMemo(() => aulas.map((a, i) => ({ id: a.id, titulo: a.titulo, estado: estadoDe(i) })), [aulas])
  const previewTrilha: Trilha = useMemo(() => ({
    id: pastaId, nome: 'Prévia', cor: null, capa: capa ?? null, capaCard: capa ?? null,
    total: aulas.length, done: aulas.length ? 1 : 0, trilhaXp: 0,
    nodes: aulas.map((a, i) => ({ id: a.id, titulo: a.titulo, quando: null, estado: estadoDe(i), acerto: i === 0 ? 80 : null, nota: null, tentativas: 0, statusLabel: '', questoes: 0, xp: 0, href: '#', acao: 'Abrir', capa: null, capaBanner: null, cadernoUrl: null })),
  }), [aulas, capa, pastaId])

  function salvar() {
    start(async () => {
      const r = await salvarTrilhaAparenciaModulo(pastaId, { simbolos, formato, livre, inverter, degrade: atual.degrade })
      if (r.ok) toast.success('Aparência da trilha salva.')
      else toast.error(r.error ?? 'Erro ao salvar')
    })
  }

  return (
    <div className="space-y-6 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Route className="h-5 w-5" /></span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold tracking-tight">Editar trilha</h3>
            <p className="max-w-2xl text-xs text-muted-foreground">Escolha o formato e personalize os símbolos. No formato <strong>Personalizada</strong>, arraste as aulas e as curvas sobre a imagem de fundo. Vale só para a trilha deste módulo.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => { setSimbolos(DEFAULT_TRILHA_SIMBOLOS); setFormato(DEFAULT_TRILHA_FORMATO); setLivre({ nos: {}, curvas: {} }); setInverter(false) }}
            className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground">
            <RotateCcw className="h-3.5 w-3.5" /> Restaurar padrão
          </button>
          <button type="button" onClick={salvar} disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50">
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Salvar
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold">Formato da trilha</h4>
        <FormatoSelector value={formato} onChange={setFormato} />
      </div>

      {invertivel && (
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border bg-muted/30 p-3">
          <span className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><ArrowDownUp className="h-4 w-4" /></span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">Começar de baixo</span>
              <span className="block text-xs text-muted-foreground">A trilha inicia na base e sobe (a 1ª aula fica embaixo).</span>
            </span>
          </span>
          <input type="checkbox" checked={inverter} onChange={(e) => setInverter(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
        </label>
      )}

      {formato === 'livre' ? (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold">Trilha personalizada</h4>
          <div className="flex flex-col gap-4 rounded-2xl border bg-muted/30 p-4 sm:flex-row sm:items-center">
            <div className="w-full max-w-[220px] shrink-0">
              {aulas.length > 0
                ? <TrilhaLivre nodes={nosLivre} livre={livre} capa={capa} simbolos={simbolos} />
                : <div className="flex aspect-[4/5] items-center justify-center rounded-2xl border border-dashed p-4 text-center text-xs text-muted-foreground">Adicione aulas ao módulo primeiro.</div>}
            </div>
            <div className="min-w-0 space-y-2">
              <p className="text-sm text-muted-foreground">Posicione cada aula e desenhe as curvas sobre a imagem de fundo no construtor em tela cheia — 100% personalizável.</p>
              <Link href={`/admin/leitura/trilha/${pastaId}`}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:brightness-110 active:scale-[0.98]">
                <PencilRuler className="h-4 w-4" /> Abrir construtor de trilha
              </Link>
              <p className="text-[11px] text-muted-foreground">Dica: salve o formato <strong>Personalizada</strong> aqui para o aluno ver a trilha montada no construtor.</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Prévia com as aulas do módulo</h4>
          <TrilhaFormatoPreview formato={formato} simbolos={simbolos} trilha={previewTrilha} capa={capa} inverter={inverter} />
        </div>
      )}

      <div className="space-y-2">
        <h4 className="text-sm font-semibold">Símbolos dos nós</h4>
        <TrilhaSimbolosEditor value={simbolos} onChange={setSimbolos} />
      </div>
    </div>
  )
}
