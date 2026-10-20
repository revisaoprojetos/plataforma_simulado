import 'server-only'
import type { ConfigIA } from '../config'
import { pipelineNiveis, type Agente, type ResultadoPipeline } from './orquestrador'

// DEMO pronta do pipeline de 3 níveis — revisão de qualidade de QUESTÕES de concurso. Mostra o fluxo
// triagem(Haiku) → execução(Sonnet) → consolidação(Opus) rodando de verdade. Quando a sua nova etapa
// chegar, é só trocar os 3 agentes + os callbacks (entrada/passa/precisa) por outro caso de uso.

// Nível 1 — TRIAGEM (barato/rápido): só sinaliza se a questão merece revisão aprofundada.
export const AG_TRIADOR: Agente = {
  nome: 'Triador', nivel: 'triagem',
  instrucoes:
    'Você é um TRIADOR rápido de qualidade de questões de concurso. Dado o texto de uma questão (enunciado + gabarito), decida APENAS se há algum indício de problema que mereça revisão aprofundada (ambiguidade, gabarito duvidoso, desatualização legislativa/jurisprudencial, erro factual). Não revise a fundo — só sinalize, de forma econômica.',
  schema: {
    name: 'triar',
    input_schema: {
      type: 'object',
      properties: {
        merece: { type: 'boolean', description: 'true se a questão merece revisão aprofundada' },
        severidade: { type: 'string', enum: ['nenhuma', 'baixa', 'media', 'alta'] },
        motivo: { type: 'string', description: 'motivo curto (1 frase)' },
      },
      required: ['merece', 'severidade', 'motivo'],
    },
  },
  maxTokens: 300, temperatura: 0,
}

// Nível 2 — EXECUÇÃO (equilíbrio): revisa a fundo, em paralelo, só as que passaram na triagem.
export const AG_REVISOR: Agente = {
  nome: 'Revisor', nivel: 'execucao',
  instrucoes:
    'Você é um REVISOR de questões de concurso. Analise a questão (enunciado + gabarito) e aponte problemas CONCRETOS: clareza/ambiguidade do enunciado, coerência do gabarito, atualização (lei/jurisprudência), qualidade dos distratores. Dê sugestões objetivas e uma CONFIANÇA (0 a 1) na sua própria análise.',
  schema: {
    name: 'revisar',
    input_schema: {
      type: 'object',
      properties: {
        gabarito_ok: { type: 'boolean', description: 'o gabarito informado está correto?' },
        problemas: { type: 'array', items: { type: 'string' } },
        sugestoes: { type: 'array', items: { type: 'string' } },
        confianca: { type: 'number', description: 'sua confiança na análise, de 0 a 1' },
        resumo: { type: 'string', description: 'veredito curto em 1 frase' },
      },
      required: ['gabarito_ok', 'problemas', 'sugestoes', 'confianca', 'resumo'],
    },
  },
  maxTokens: 900, temperatura: 0.2,
}

// Nível 3 — CONSOLIDAÇÃO (forte/caro): só os casos de dúvida (confiança baixa ou gabarito suspeito).
export const AG_JUIZ: Agente = {
  nome: 'Juiz', nivel: 'consolidacao',
  instrucoes:
    'Você é o REVISOR SÊNIOR. Recebe a questão e a análise de um revisor e dá o VEREDITO final: "ok" (pode publicar), "ajustar" (pequenos reparos) ou "refazer" (problema grave). Justifique de forma curta e, se precisar, proponha a correção.',
  schema: {
    name: 'julgar',
    input_schema: {
      type: 'object',
      properties: {
        veredito: { type: 'string', enum: ['ok', 'ajustar', 'refazer'] },
        justificativa: { type: 'string' },
        correcao: { type: 'string', description: 'correção sugerida (vazio se "ok")' },
      },
      required: ['veredito', 'justificativa'],
    },
  },
  maxTokens: 700, temperatura: 0.2,
}

export const AGENTES_DEMO = [AG_TRIADOR, AG_REVISOR, AG_JUIZ]

/** Roda o pipeline de 3 níveis sobre uma lista de questões (texto). */
export async function rodarRevisaoDemo(cfg: ConfigIA, itens: string[]): Promise<ResultadoPipeline<string>> {
  return pipelineNiveis<string>(cfg, {
    itens,
    // Nível 1: filtra — só vai pra revisão o que o triador marcar (poupa Sonnet/Opus).
    triagem: { agente: AG_TRIADOR, entrada: (q) => `QUESTÃO:\n${q}`, passa: (s: any) => !!s?.merece },
    // Nível 2: revisão em paralelo.
    execucao: { agente: AG_REVISOR, entrada: (q) => `QUESTÃO:\n${q}` },
    // Nível 3: só nos casos de dúvida (confiança < 0.7) ou gabarito marcado como errado.
    consolidacao: {
      agente: AG_JUIZ,
      precisa: (ex: any) => (Number(ex?.confianca ?? 1) < 0.7) || ex?.gabarito_ok === false,
      entrada: (ex: any, q) => `QUESTÃO:\n${q}\n\nANÁLISE DO REVISOR (JSON):\n${JSON.stringify(ex)}`,
    },
    concorrencia: 4,
    orcamentoUSD: 0.5, // teto de segurança
  })
}
