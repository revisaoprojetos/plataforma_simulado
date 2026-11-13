import { arvoreBibliotecaAluno } from '@/lib/conteudo/leitor'
import { BibliotecaDrive } from '@/components/aluno/biblioteca-drive'
import { exigirAreaAluno } from '@/lib/nova/area-aluno-acesso'
import { lerPoliticaDownload } from '@/lib/conteudo/politica-download'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function BibliotecaAlunoPage() {
  // GATE POR PÁGINA (o do layout não roda em navegação interna): fora do allowlist → painel, nunca a árvore.
  const sessao = await exigirAreaAluno('biblioteca')
  const [arvore, pol] = await Promise.all([arvoreBibliotecaAluno(sessao.estudanteId, null), lerPoliticaDownload(createAdminClient(), sessao.tenantId)])
  return <BibliotecaDrive inicial={arvore} baixarLiberado={pol.alunoPodeBaixar} />
}
