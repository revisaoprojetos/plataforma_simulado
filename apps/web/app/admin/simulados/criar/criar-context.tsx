'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

// Estado compartilhado da criação de simulado (página-por-página). Vive no layout do grupo
// de rotas /criar, então SOBREVIVE à navegação entre etapas (o layout não remonta). Espelho
// em sessionStorage p/ resistir a refresh. Salva só no FINAL (nenhum registro até "Criar").

// Versão na chave: ao mudar os defaults do rascunho, bumpar isto descarta rascunhos antigos do
// sessionStorage (que sobrescreveriam os novos defaults) — o próximo acesso começa com os padrões atuais.
export const DRAFT_KEY = 'criar-simulado-draft-v2'

export const STEPS = [
  { slug: 'personalizar', label: 'Personalizar' },
  { slug: 'questoes', label: 'Questões' },
  { slug: 'cadernos', label: 'Cadernos' },
  { slug: 'estudantes', label: 'Estudantes' },
  { slug: 'regras', label: 'Regras' },
  { slug: 'salvar', label: 'Salvamento' },
] as const

export type StepSlug = (typeof STEPS)[number]['slug']

export interface PdfRef { url: string; nome: string }
export interface PastaEscolha { mode: 'raiz' | 'existente' | 'nova'; id?: string | null; nome?: string }

export interface CriarDraft {
  // 1. Personalizar
  bancoNome: string
  simuladoNome: string
  tipo: 'objetivo' | 'discursivo'
  objetivoSub: 'multipla' | 'certo_errado'
  cor: string | null
  icone: string | null
  capaUrl: string | null
  capaCardUrl: string | null
  // 2. Questões
  questoesSelecionadas: string[]
  questoesImportadas: Record<string, unknown>[]
  // Dados de exibição das questões escolhidas do sistema (para a tabela da etapa).
  questoesSelData: { id: string; external_id: string | null; enunciado: string; disciplina: string | null; assunto: string | null; assunto_detalhe: string | null; banca: string | null; orgao: string | null; ano: number | null; nivel_dificuldade: string | null; tipo: string; formato: string | null; etiquetas: { nome: string; cor: string | null }[] }[]
  // 3. Cadernos
  folhaModeloId: string | null
  enunciadoPdf: PdfRef | null
  gabaritoPdf: PdfRef | null
  // 4. Estudantes
  estudanteIds: string[]
  grupoIds: string[]
  // Dados de exibição dos escolhidos (para a tabela da etapa).
  estudantesSelData: { id: string; nome: string; email: string | null; telefone: string | null; cpf: string | null; classificacao: string | null; avatar: string | null; perfil_avatar_cor: string | null }[]
  gruposSelData: { id: string; nome: string; cor: string | null; membros: number }[]
  // 5. Regras (+ Informações/aplicação)
  info: {
    descricao: string
    instrucoes: string
    modo_aplicacao: 'janela_fixa' | 'prazo_relativo' | 'aberto'
    data_inicio: string
    data_fim: string
    prazo_valor: number | null
    prazo_unidade: 'horas' | 'dias' | 'meses'
    tempo_limite_min: number | null
    metodo_identificacao: 'email' | 'email_cpf' | 'email_telefone'
    embed_ativo: boolean
  }
  regras: Record<string, unknown>
  // 6. Salvamento
  simuladoFolder: PastaEscolha
  bancoFolder: PastaEscolha
  // De onde o usuário abriu o fluxo (define o "voltar").
  origem: 'inicio' | 'aplicacao'
}

export function draftVazio(): CriarDraft {
  return {
    bancoNome: '',
    simuladoNome: '',
    tipo: 'objetivo',
    objetivoSub: 'multipla',
    cor: null,
    icone: null,
    capaUrl: null,
    capaCardUrl: null,
    questoesSelecionadas: [],
    questoesImportadas: [],
    questoesSelData: [],
    folhaModeloId: null,
    enunciadoPdf: null,
    gabaritoPdf: null,
    estudanteIds: [],
    grupoIds: [],
    estudantesSelData: [],
    gruposSelData: [],
    info: {
      descricao: '',
      instrucoes: '',
      modo_aplicacao: 'aberto',
      data_inicio: '',
      data_fim: '',
      prazo_valor: null,
      prazo_unidade: 'dias',
      tempo_limite_min: null,
      metodo_identificacao: 'email_cpf',
      embed_ativo: false,
    },
    // Defaults recomendados (espelham o SimuladoWizard) — já marcados.
    regras: {
      embaralhar_questoes: false,
      embaralhar_alternativas: false,
      revisao_antes_enviar: true,
      exibir_nota: true,
      mostrar_comentario: true,
      retentativas: 1,
      retentativas_ilimitadas: true,
      politica_nota: 'ultima',
      liberar_nota: 'imediato',
      liberar_gabarito: 'imediato',
      liberar_caderno: 'imediato',
      caderno_publico: 'todos',
      enunciado_liberado: true,
      iniciar_atrasado: false,
      tolerancia_atraso_min: null,
      tempo_por_questao_seg: null,
      peso_padrao: 1,
      politica_anulacao: 'pontua_todos',
      // Tipo de correção: 'pontuacao' (normal, +1 por acerto) ou 'cebraspe' (acertos − erros).
      tipo_correcao: 'pontuacao',
    },
    simuladoFolder: { mode: 'raiz' },
    bancoFolder: { mode: 'raiz' },
    origem: 'aplicacao',
  }
}

/** Uma etapa está completa? (lenient onde a etapa ainda será construída em fase posterior). */
export function stepCompleta(d: CriarDraft, slug: StepSlug): boolean {
  switch (slug) {
    case 'personalizar':
      return d.bancoNome.trim().length > 0 && d.simuladoNome.trim().length >= 3 && !!d.tipo
    case 'questoes':
    case 'cadernos':
    case 'estudantes':
      return true // opcional / construído em fase posterior
    case 'regras':
      if (d.info.modo_aplicacao === 'janela_fixa') return !!d.info.data_inicio // "fecha em" é opcional (vazio = aberto p/ sempre)
      if (d.info.modo_aplicacao === 'prazo_relativo') return !!d.info.prazo_valor && d.info.prazo_valor > 0
      return true
    case 'salvar':
      return true
  }
}

/** Índice da 1ª etapa incompleta (ou a última, se tudo ok) — teto de navegação. */
export function primeiraIncompleta(d: CriarDraft): number {
  for (let i = 0; i < STEPS.length; i++) if (!stepCompleta(d, STEPS[i].slug)) return i
  return STEPS.length - 1
}

interface CriarCtx {
  draft: CriarDraft
  patch: (p: Partial<CriarDraft>) => void
  patchInfo: (p: Partial<CriarDraft['info']>) => void
  patchRegras: (p: Record<string, unknown>) => void
  reset: () => void
}

const Ctx = createContext<CriarCtx | null>(null)

export function useCriar(): CriarCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useCriar fora do CriarProvider')
  return c
}

export function CriarProvider({ children }: { children: React.ReactNode }) {
  const [draft, setDraft] = useState<CriarDraft>(() => {
    if (typeof window === 'undefined') return draftVazio()
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY)
      if (raw) return { ...draftVazio(), ...(JSON.parse(raw) as CriarDraft) }
    } catch { /* ignora */ }
    return draftVazio()
  })

  // Persiste a cada mudança (URLs são leves → cabe no sessionStorage).
  useEffect(() => {
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)) } catch { /* quota */ }
  }, [draft])

  const patch = (p: Partial<CriarDraft>) => setDraft((d) => ({ ...d, ...p }))
  const patchInfo = (p: Partial<CriarDraft['info']>) => setDraft((d) => ({ ...d, info: { ...d.info, ...p } }))
  const patchRegras = (p: Record<string, unknown>) => setDraft((d) => ({ ...d, regras: { ...d.regras, ...p } }))
  const reset = () => {
    try { sessionStorage.removeItem(DRAFT_KEY) } catch { /* ignora */ }
    setDraft(draftVazio())
  }

  return <Ctx.Provider value={{ draft, patch, patchInfo, patchRegras, reset }}>{children}</Ctx.Provider>
}

/**
 * Guarda de etapa: se o usuário cair numa etapa à frente de uma anterior INCOMPLETA
 * (ex.: refresh que perdeu algo), redireciona pra 1ª pendente. Chamar no topo de cada page.
 */
export function useGuardStep(indiceAtual: number) {
  const { draft } = useCriar()
  const router = useRouter()
  const pathname = usePathname()
  useEffect(() => {
    const teto = primeiraIncompleta(draft)
    if (indiceAtual > teto) router.replace(`/admin/simulados/criar/${STEPS[teto].slug}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])
}
