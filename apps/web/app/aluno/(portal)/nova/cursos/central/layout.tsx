import { exigirAreaAluno } from '@/lib/nova/area-aluno-acesso'

// A Central de Estudos (inclui LegProc, que lista a árvore da Biblioteca) é sub-regra bloqueada por padrão.
// O gate do layout do portal só roda na 1ª carga/F5; este layout aninhado é montado ao ENTRAR na Central por
// navegação interna e fecha o vazamento (aluno fora do allowlist → painel).
export default async function CentralLayout({ children }: { children: React.ReactNode }) {
  await exigirAreaAluno('nova_cursos_central')
  return <>{children}</>
}
