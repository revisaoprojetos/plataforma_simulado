'use client'

import { useEffect } from 'react'

/**
 * Lembra, NESTE navegador, que o usuário logado está no Workspace da paleta nova. Telas sem sessão (login, carregamento,
 * prova/embed) não sabem quem é o visitante; o layout raiz lê este cookie p/ aplicar a paleta nelas também no modo
 * "Só Workspace". Só preferência visual (não dá acesso a nada): fora do Workspace o cookie é apagado.
 */
export function PaletaWsCookie({ ativo }: { ativo: boolean }) {
  useEffect(() => {
    try {
      document.cookie = ativo
        ? 'pn_ws=1; path=/; max-age=2592000; samesite=lax'
        : 'pn_ws=; path=/; max-age=0; samesite=lax'
    } catch { /* sem cookies: ignora */ }
  }, [ativo])
  return null
}
