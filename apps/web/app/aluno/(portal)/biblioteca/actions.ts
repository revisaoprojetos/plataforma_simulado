'use server'

import { getSessaoAluno } from '@/lib/aluno-session'
import { arvoreBibliotecaAluno, type ArvoreAluno } from '@/lib/conteudo/leitor'

/** Navegação de pasta na Biblioteca do aluno (gate aplicado no loader). null = não autenticado. */
export async function navegarBibliotecaAluno(pastaId: string | null): Promise<ArvoreAluno | null> {
  const sessao = await getSessaoAluno()
  if (!sessao) return null
  return arvoreBibliotecaAluno(sessao.estudanteId, pastaId)
}
