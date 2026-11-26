import type { ReactNode } from 'react'

// Limite de tempo por sub-aba do Gerador: se o carregamento passar de LIMITE_MS, a rota lança e o error.tsx
// (ErroTela) mostra a mensagem + "Tentar de novo" — a navegação entre abas nunca fica presa num spinner infinito.
// As abas/grupos (shell) ficam fixas; só o conteúdo troca.
const LIMITE_MS = 25_000

export async function LimiteAba({ aba, carregar }: { aba: string; carregar: () => Promise<ReactNode> }) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const estouro = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new Error(`A aba "${aba}" demorou mais de ${LIMITE_MS / 1000}s para carregar.`)), LIMITE_MS)
  })
  try { return await Promise.race([carregar(), estouro]) }
  finally { if (timer) clearTimeout(timer) }
}
