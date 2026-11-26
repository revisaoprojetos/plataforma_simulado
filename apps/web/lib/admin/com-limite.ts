/**
 * Limite de tempo para loaders de tela (Cronograma): rejeita com mensagem amigável se `p` não resolver em `ms`.
 * A rejeição cai no error boundary da rota (`error.tsx` → botão "Tentar de novo") ou no `catch` da própria tela,
 * em vez de deixar a navegação entre abas pendurada para sempre. Não cancela a consulta em si (só deixa de esperar).
 */
export class LimiteEsgotado extends Error {
  constructor(rotulo: string, ms: number) { super(`${rotulo} demorou mais de ${Math.round(ms / 1000)} s. Tente de novo.`); this.name = 'LimiteEsgotado' }
}

export function comLimite<T>(p: Promise<T>, ms: number, rotulo = 'A consulta'): Promise<T> {
  let t: ReturnType<typeof setTimeout>
  const limite = new Promise<never>((_, rej) => { t = setTimeout(() => rej(new LimiteEsgotado(rotulo, ms)), ms) })
  return Promise.race([p, limite]).finally(() => clearTimeout(t))
}
