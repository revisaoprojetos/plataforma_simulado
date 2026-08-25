/**
 * Preferências de LEITURA do aluno numa emissão: que semanas ele fechou e se escolheu
 * esconder a contagem de metas.
 *
 * Fica aqui, e não junto da action, por uma regra do Next que o `tsc` não checa: um arquivo
 * `'use server'` só pode exportar função assíncrona. Constante e função pura ali dentro
 * compilam e quebram em runtime — foi exatamente o que aconteceu.
 */

export type PreferenciasEmissao = {
  /** Números de semana que o aluno fechou. */
  semanasColapsadas: number[]
  /** Esconde "N metas" nos cabeçalhos das semanas. Desligado por padrão. */
  ocultarContagem: boolean
  /** Números do topo que o aluno escondeu: 'semanas' | 'dias' | 'atividades' | 'conclusao'. */
  resumoOculto: string[]
}

export const PREFERENCIAS_PADRAO: PreferenciasEmissao = {
  semanasColapsadas: [],
  ocultarContagem: false,
  resumoOculto: [],
}

/** Lê o jsonb com tolerância: preferência corrompida não pode derrubar a tela do aluno. */
export function normalizarPreferencias(bruto: unknown): PreferenciasEmissao {
  const p = (bruto ?? {}) as Partial<PreferenciasEmissao>
  return {
    semanasColapsadas: Array.isArray(p.semanasColapsadas)
      ? [...new Set(p.semanasColapsadas.filter((n) => Number.isInteger(n) && n > 0))]
      : [],
    ocultarContagem: p.ocultarContagem === true,
    resumoOculto: Array.isArray(p.resumoOculto) ? p.resumoOculto.filter((x) => typeof x === 'string') : [],
  }
}
