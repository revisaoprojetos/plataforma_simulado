import 'server-only'
import { redirect } from 'next/navigation'
import { getSessaoAluno } from '@/lib/aluno-session'
import { getManutencaoAluno } from '@/lib/sistema/manutencao-areas-server'
import { ehTestadorGlobal } from '@/lib/sistema/testadores-globais'

/**
 * GATE DE ÁREA no nível da PÁGINA (não só do layout).
 *
 * O gate de manutenção/allowlist do portal vive em `app/aluno/(portal)/layout.tsx`, mas layouts do App Router NÃO
 * são re-renderizados na navegação interna (soft nav / router.push / <Link>): só a 1ª carga e o F5 passam por ele.
 * Resultado: aluno fora do allowlist chegava em áreas restritas (Biblioteca) clicando num link/"Voltar" dentro do
 * app. Estas funções rodam a CADA request da página e fecham esse buraco. Fonte única da regra:
 * testador global → sempre · área não bloqueada → todos · bloqueada → só quem está no allowlist.
 */
export async function areaAlunoLiberada(
  chave: string, tenantId: string, estudanteId: string, email?: string | null,
): Promise<boolean> {
  try {
    const [testador, { ativos, liberados }] = await Promise.all([
      ehTestadorGlobal({ tenantId, email, estudanteId }),
      getManutencaoAluno(),
    ])
    if (testador) return true
    if (!ativos[chave]) return true
    return (liberados[chave] ?? []).includes(estudanteId)
  } catch {
    return false // área RESTRITA: na dúvida, fecha (fail-closed)
  }
}

/** Biblioteca (navegação/árvore de pastas) liberada p/ este aluno? Leitura de um documento específico NÃO depende disso. */
export const bibliotecaLiberada = (tenantId: string, estudanteId: string, email?: string | null) =>
  areaAlunoLiberada('biblioteca', tenantId, estudanteId, email)

/** Destino seguro quando a área não é do aluno. */
export const DESTINO_SEM_ACESSO = '/aluno/nova/painel'

/** Guard de página: sem sessão → login; área não liberada → painel. Retorna a sessão. */
export async function exigirAreaAluno(chave: string) {
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  if (!(await areaAlunoLiberada(chave, sessao.tenantId, sessao.estudanteId, sessao.email))) redirect(DESTINO_SEM_ACESSO)
  return sessao
}
