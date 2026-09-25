import 'server-only'

/**
 * Limitador de CONCORRÊNCIA do Chromium/Puppeteer no processo WEB.
 *
 * As rotas de PDF do aluno (caderno-teste-*) sobem um Chromium INTEIRO dentro do processo web.
 * Cada instância é pesada (CPU + RAM). Sem limite, vários alunos baixando PDF ao mesmo tempo
 * saturam a CPU do container e CONGELAM o portal de TODOS (o /api/health, sem DB, chega a dar
 * timeout). Este semáforo garante no máximo `PDF_CHROMIUM_MAX` (default 1) Chromium por RÉPLICA:
 * o excedente ESPERA por uma vaga até `timeoutMs`; se não conseguir, a rota responde 503
 * ("ocupado, tente em instantes") — degradação controlada em vez de derrubar o servidor.
 *
 * Estado por-processo (cada réplica tem o seu). FIFO. Sempre chamar `liberarSlotPdf()` no finally.
 */
const MAX = Math.max(1, Number(process.env.PDF_CHROMIUM_MAX ?? 1))
let ativos = 0
const fila: Array<() => void> = []

/** Tenta adquirir uma vaga p/ rodar o Chromium. Resolve true se conseguiu; false se estourou o timeout. */
export function adquirirSlotPdf(timeoutMs = 25_000): Promise<boolean> {
  if (ativos < MAX) { ativos++; return Promise.resolve(true) }
  return new Promise<boolean>((resolve) => {
    let resolvido = false
    const entrar = () => {
      if (resolvido) return
      resolvido = true
      clearTimeout(timer)
      ativos++
      resolve(true)
    }
    const timer = setTimeout(() => {
      if (resolvido) return
      resolvido = true
      const i = fila.indexOf(entrar)
      if (i >= 0) fila.splice(i, 1)
      resolve(false)
    }, timeoutMs)
    fila.push(entrar)
  })
}

/** Libera a vaga e passa para o próximo da fila. SEMPRE no finally da rota. */
export function liberarSlotPdf(): void {
  ativos = Math.max(0, ativos - 1)
  const proximo = fila.shift()
  if (proximo) proximo()
}
