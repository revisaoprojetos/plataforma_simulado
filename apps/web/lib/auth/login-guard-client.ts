'use client'

/** Cliente do /api/auth/login-guard (lockout do login admin). SEMPRE fail-open: se o guard falhar/demorar, o login segue. */
export async function loginGuard(email: string, fase: 'antes' | 'falha' | 'ok'): Promise<{ bloqueado: boolean; retryAfter: number }> {
  try {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), 3000)
    const r = await fetch('/api/auth/login-guard', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, fase }), signal: ctl.signal, cache: 'no-store',
    }).finally(() => clearTimeout(t))
    if (r.status === 429) return { bloqueado: true, retryAfter: Number(r.headers.get('retry-after')) || 900 }
  } catch { /* fail-open */ }
  return { bloqueado: false, retryAfter: 0 }
}

export function msgBloqueioLogin(retryAfter: number): string {
  const min = Math.max(1, Math.ceil(retryAfter / 60))
  return `Muitas tentativas de login. Aguarde ${min} min e tente novamente.`
}
