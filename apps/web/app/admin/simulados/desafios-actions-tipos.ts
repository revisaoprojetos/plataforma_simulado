// Tipos de desafios-actions.ts — sem 'use server' para não quebrar o next build
import type { MaratonaConfig } from '@/lib/maratona/config'
export type { MaratonaConfig }

export type EtapaMaratona = {
  simuladoId: string
  /** Área do percurso (1, 2 ou 3) onde este simulado aparece. Ausente = não incluído. */
  slot?: number
  /** Nome EXIBIDO na maratona (dropdown/percurso). Texto é SEMPRE preservado (mesmo com a opção desligada),
   *  pra não perder o que foi digitado; `rotuloOn` diz se ele deve ser APLICADO. Vazio = usa o nome real. */
  rotulo?: string
  /** Aplica o `rotulo` (nome personalizado) na maratona? false = usa o nome real, mas mantém o texto salvo.
   *  Ausente (dados antigos) = aplica se houver texto (retrocompat). */
  rotuloOn?: boolean
  /** Tempo MÍNIMO de permanência NO SIMULADO, em SEGUNDOS, para o aluno ganhar o CHECK-IN (selo) desta etapa.
   *  O aluno precisa ficar ao menos este tempo (ex.: 1200 = 20min). 0/ausente = sem mínimo (qualquer
   *  encerramento já dá o check). O tempo real do aluno é o que conta no "tempo decorrido". */
  segMin?: number
}

export type ConfigDesafioSim = MaratonaConfig & {
  lancada: boolean
  capaOrig?: string | null
  capaCrop?: { zoom: number; cx: number; cy: number } | null
  // Vínculo com o conteúdo real: quando `*Auto`, o card usa a contagem REAL (simulados na pasta /
  // alunos com acesso) em vez do número fixo. Default = automático (reflete o que existe de verdade).
  qtdSimuladosAuto?: boolean
  inscritosAuto?: boolean
  /** Ordem + organização das etapas da maratona (ordem do array = sequência). */
  etapas?: EtapaMaratona[]
  /** Visibilidade na HOME do aluno (default = OCULTO; o desafio vive na própria área). Quando ligado,
   *  a PASTA do desafio aparece na área de Pastas e/ou os simulados dele aparecem nos Recentes. */
  mostrarNasPastas?: boolean
  mostrarNosRecentes?: boolean
}

export type ContagemDesafio = { simulados: number; inscritos: number }
