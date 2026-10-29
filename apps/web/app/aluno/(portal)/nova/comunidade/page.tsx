// Comunidade (novo) — EM BREVE. Decisão de produto: a rede social (feed/stories/recados/grupos/DM)
// não tem backend e não será trabalhada por ora. As Ligas saíram para a barra lateral (área própria,
// real) e o antigo "perfil/conquistas" daqui era um duplicado pior da área de Perfil → removido.
import { EmBreveCard } from '@/components/nova/manutencao'

export const dynamic = 'force-dynamic'

export default function ComunidadePage() {
  return (
    <EmBreveCard
      titulo="Comunidade"
      icon="users"
      mensagem="A Comunidade do Revisão está chegando: feed, recados, grupos e interação entre alunos. Por enquanto, as Ligas ficam na barra lateral e o seu perfil continua na área de Perfil. Fique de olho — vem novidade por aí!"
    />
  )
}
