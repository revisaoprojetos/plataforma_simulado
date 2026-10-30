'use client'
// Ao voltar do Cronograma (embed) para o "Meu painel de estudos", o Router Cache do Next pode servir
// a versão anterior à criação do plano — o card do cronograma não aparece. O embed marca
// sessionStorage['rej-crono-dirty'] ao sair; aqui, no 1º mount do painel, se a flag estiver setada,
// forçamos UM router.refresh() (relê o servidor) e limpamos a flag. Sem custo em visitas normais.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function RefreshOnReturn() {
  const router = useRouter()
  useEffect(() => {
    try {
      if (sessionStorage.getItem('rej-crono-dirty') === '1') {
        sessionStorage.removeItem('rej-crono-dirty')
        router.refresh()
      }
    } catch { /* ignore */ }
  }, [router])
  return null
}
