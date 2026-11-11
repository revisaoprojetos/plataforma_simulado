// Formato dos DADOS que os renderers recebem (montados no servidor por loader.ts). TS puro.
import type { ModuloAluno } from '../curriculo-aluno'
import type { ResumoCronograma } from '../resumo-cronograma'
import type { VitrineSecao } from '../aluno'
import type { VitrineLayout } from '../tipos'

export interface ProdutoPagina {
  id: string; slug: string; nome: string; descricao: string | null
  cor: string | null; cor_secundaria: string | null; logo_url: string | null
  banner_url: string | null; banner_mobile_url: string | null; tema: string
  vitrine_layout: VitrineLayout; expira_em: string | null
}
export interface AvisoPagina { id: string; titulo: string; corpo: string | null; fixado: boolean }
export interface InstrutorPagina { id: string; nome: string; cargo: string | null; foto_url: string | null; bio: string | null }

export interface DadosPagina {
  produto: ProdutoPagina
  /** 'aluno' = dados reais do aluno logado; 'amostra' = edição (sem aluno): currículo agregado/sem progresso, resumo de exemplo. */
  origem: 'aluno' | 'amostra'
  slug: string
  /** Cor CSS do produto já resolvida (var/cor) — mesma do page.tsx legado. */
  cor: string
  cor2: string
  avisos: AvisoPagina[]
  progressoSimulados: { total: number; feitos: number; proximo: { id: string; titulo: string } | null }
  curriculo: ModuloAluno[]
  /** Por id de bloco 'cronograma'. null = sem dado dinâmico (só título+botão). */
  resumosCronograma: Record<string, ResumoCronograma | null>
  /** Por id de bloco 'banner'/'carrossel' ATIVO: item já resolvido (nomes/hrefs). */
  secoes: Record<string, VitrineSecao>
  instrutores: InstrutorPagina[]
  /** Destino/rotulo do "Voltar" do hero (modo edição: '#'). */
  voltar: { href: string; rotulo: string }
}
