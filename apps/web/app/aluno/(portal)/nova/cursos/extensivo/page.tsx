// Extensivo: antes era uma vitrine FICTÍCIA (disciplinas/professores fixos). Agora redireciona para os
// extensivos REAIS do aluno (os de "Meus Extensivos"): 1 → abre direto; 2+ → lista para escolher; 0 → Cursos.
import { redirect } from 'next/navigation'
import { getSessaoAluno } from '@/lib/aluno-session'
import { extensivoAtalhoDoAluno } from '@/lib/nova/extensivos-aluno'
import { R } from '@/lib/nova/rotas'

export const dynamic = 'force-dynamic'

export default async function ExtensivoPage() {
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  const ext = await extensivoAtalhoDoAluno(sessao.tenantId, sessao.estudanteId)
  redirect(ext ? ext.href : R.cursos)
}
