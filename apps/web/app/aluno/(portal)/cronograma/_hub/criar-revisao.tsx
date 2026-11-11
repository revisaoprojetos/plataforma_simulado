'use client'
// Wrapper cliente do fluxo "Criar → Revisão": o <CronogramaClient/> recebe `onVoltar` (função), o que um
// server component não pode passar. Nada é gravado aqui — só ao "Gerar meu cronograma" dentro do CronogramaClient.
import { useRouter } from 'next/navigation'
import type { CronogramaDoAluno } from '@/lib/cronograma/acesso'
import { CronogramaClient } from '../cronograma-client'

export function CriarRevisao({ modelos, modeloInicialId, voltarPara }: { modelos: CronogramaDoAluno[]; modeloInicialId?: string; voltarPara: string }) {
  const router = useRouter()
  return <CronogramaClient modelos={modelos} modeloInicialId={modeloInicialId} onVoltar={() => router.push(voltarPara)} />
}
