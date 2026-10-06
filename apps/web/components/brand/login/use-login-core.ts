'use client'

// ─────────────────────────────────────────────────────────────────────────────
// useLoginCore — LÓGICA headless do login (estado + submit + admin toggle).
// ─────────────────────────────────────────────────────────────────────────────
//
// Extraído 1:1 do comportamento de `components/aluno/aluno-entrar-form.tsx`:
//   - aluno: POST /api/aluno/login (e-mail [+cpf|+telefone]); marca popup-login;
//     respeita ?redirectTo= interno; em sucesso seta `entrando` (loader branded).
//   - admin: signInWithPassword; audita login; vai pro ?redirectTo= ou /login.
//   - manutenção/erro tratados como no form atual.
//
// As variantes visuais (Revisão/VND/MEQ) consomem o retorno via o contrato LoginCore.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { LoginCore, Metodo } from './types'

// Tempo MÍNIMO que o carregamento branded fica visível após o sucesso, para a animação de intro
// (logo desenhado + wordmark, ~2,5–3,1s "Pronto" na spec 02 §3.1) não ser cortada pela navegação.
// Cobre a intro mais longa do catálogo (Revisão clássico ~3,1s) + a busca de aparência do loader.
const MIN_LOADER_MS = 3200
const espera = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
// Mede a partir do momento em que o loader MONTA (sucesso), garantindo a janela cheia da animação.
async function segurarMin(tEntrando: number) {
  const resto = MIN_LOADER_MS - (Date.now() - tEntrando)
  if (resto > 0) await espera(resto)
}

export function useLoginCore({
  metodo,
  preview = false,
  modoInicial = 'aluno',
}: {
  metodo: Metodo
  preview?: boolean
  modoInicial?: 'aluno' | 'admin'
}): LoginCore {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [cpf, setCpf] = useState('')
  const [telefone, setTelefone] = useState('')
  const [senha, setSenha] = useState('')
  const [modo, setModo] = useState<'aluno' | 'admin'>(modoInicial)
  const [entrando, setEntrando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [manutencao, setManutencao] = useState<{ titulo: string; mensagem: string } | null>(null)
  const [carregando, setCarregando] = useState(false)

  const ehAdmin = modo === 'admin'

  // Preserva o DESTINO original (?redirectTo=) do link acessado antes do login. Só caminho interno.
  function destinoRedirect(): string | null {
    if (typeof window === 'undefined') return null
    const rt = new URLSearchParams(window.location.search).get('redirectTo')
    return rt && rt.startsWith('/') && !rt.startsWith('/login') ? rt : null
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (preview) return
    if (ehAdmin) return entrarAdmin()
    setErro(null)
    setManutencao(null)
    setCarregando(true)
    try {
      const res = await fetch('/api/aluno/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, cpf, telefone }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        if (j.manutencao)
          setManutencao({
            titulo: j.titulo ?? 'Plataforma em manutenção',
            mensagem: j.message ?? 'Estamos em manutenção. Tente novamente mais tarde.',
          })
        else setErro(j.message ?? 'Não foi possível entrar.')
        return
      }
      try {
        sessionStorage.setItem('popup-login', '1')
      } catch {}
      const rt = destinoRedirect()
      const destino = rt && /^\/(aluno|simulado)(\/|$|\?)/.test(rt) ? rt : '/aluno'
      setEntrando(true)
      await segurarMin(Date.now()) // deixa a animação de carregamento completar antes de navegar
      router.push(destino)
      router.refresh()
    } catch {
      setErro('Erro de conexão. Tente novamente.')
    } finally {
      setCarregando(false)
    }
  }

  async function entrarAdmin() {
    setErro(null)
    setManutencao(null)
    setCarregando(true)
    try {
      const { error } = await createClient().auth.signInWithPassword({ email, password: senha })
      if (error) {
        setErro(
          error.message === 'Invalid login credentials'
            ? 'E-mail ou senha inválidos.'
            : error.message,
        )
        return
      }
      void fetch('/api/audit/login', { method: 'POST' }).catch(() => {})
      const rt = destinoRedirect()
      setEntrando(true)
      await segurarMin(Date.now()) // deixa a animação de carregamento completar antes de navegar
      router.push(rt ?? '/login')
      router.refresh()
    } catch {
      setErro('Erro de conexão. Tente novamente.')
    } finally {
      setCarregando(false)
    }
  }

  function alternarModo() {
    setModo((m) => (m === 'admin' ? 'aluno' : 'admin'))
    setErro(null)
    setManutencao(null)
    setSenha('')
  }

  return {
    email,
    setEmail,
    cpf,
    setCpf,
    telefone,
    setTelefone,
    senha,
    setSenha,
    modo,
    alternarModo,
    metodo,
    carregando,
    entrando,
    erro,
    manutencao,
    submit,
  }
}
