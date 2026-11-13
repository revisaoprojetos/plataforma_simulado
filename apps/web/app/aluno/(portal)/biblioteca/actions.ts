'use server'

import { getSessaoAluno } from '@/lib/aluno-session'
import { arvoreBibliotecaAluno, type ArvoreAluno } from '@/lib/conteudo/leitor'
import { bibliotecaLiberada } from '@/lib/nova/area-aluno-acesso'

/** Navegação de pasta na Biblioteca do aluno (gate aplicado no loader). null = não autenticado OU Biblioteca não liberada p/ ele. */
export async function navegarBibliotecaAluno(pastaId: string | null): Promise<ArvoreAluno | null> {
  const sessao = await getSessaoAluno()
  if (!sessao) return null
  // Fora do allowlist da Biblioteca: não entrega a árvore nem por chamada direta.
  if (!(await bibliotecaLiberada(sessao.tenantId, sessao.estudanteId, sessao.email))) return null
  return arvoreBibliotecaAluno(sessao.estudanteId, pastaId)
}
