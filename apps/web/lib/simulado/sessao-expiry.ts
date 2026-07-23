// Limite efetivo de uma sessão de prova = min(início + tempo_limite, data_fim do simulado).
// Fonte única para o servidor validar tempo/janela (o timer do cliente é só conveniência —
// a autoridade é o servidor: nada de aceitar resposta depois de expirar).

export function limiteSessao(
  iniciadoEm: string | null | undefined,
  tempoLimiteMin: number | null | undefined,
  dataFim: string | null | undefined,
): number | null {
  let limite: number | null = null
  if (tempoLimiteMin && iniciadoEm) limite = new Date(iniciadoEm).getTime() + tempoLimiteMin * 60_000
  if (dataFim) {
    const df = new Date(dataFim).getTime()
    limite = limite === null ? df : Math.min(limite, df)
  }
  return limite
}

export function sessaoExpirada(
  iniciadoEm: string | null | undefined,
  tempoLimiteMin: number | null | undefined,
  dataFim: string | null | undefined,
  now: number = Date.now(),
): boolean {
  const l = limiteSessao(iniciadoEm, tempoLimiteMin, dataFim)
  return l !== null && now > l
}
