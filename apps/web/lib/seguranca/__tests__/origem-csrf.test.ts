import { describe, it, expect } from 'vitest'
import { avaliarOrigem, deveVerificarOrigem } from '../origem-csrf'

const base = { referer: null, secFetchSite: null, host: 'simulado.revisaopge.com.br', forwardedHost: null }

describe('avaliarOrigem', () => {
  it('mesma origem (iframe da Curseduca roda no nosso host)', () => {
    expect(avaliarOrigem({ ...base, origin: 'https://simulado.revisaopge.com.br' }, []).ok).toBe(true)
  })
  it('subdominio do mesmo dominio registravel', () => {
    expect(avaliarOrigem({ ...base, origin: 'https://outro.revisaopge.com.br' }, []).ok).toBe(true)
  })
  it('curseduca permitido, atacante bloqueado', () => {
    expect(avaliarOrigem({ ...base, origin: 'https://app.curseduca.pro' }, []).ok).toBe(true)
    expect(avaliarOrigem({ ...base, origin: 'https://evil.com' }, []).ok).toBe(false)
    expect(avaliarOrigem({ ...base, origin: 'https://revisaopge.com.br.evil.com' }, []).ok).toBe(false)
  })
  it('sem origin: server-to-server ok; cross-site bloqueia', () => {
    expect(avaliarOrigem({ ...base, origin: null }, []).ok).toBe(true)
    expect(avaliarOrigem({ ...base, origin: null, secFetchSite: 'cross-site' }, []).ok).toBe(false)
  })
  it('usa X-Forwarded-Host (Traefik)', () => {
    expect(avaliarOrigem({ origin: 'https://x.vnd.com.br', referer: null, secFetchSite: null, host: '0.0.0.0', forwardedHost: 'x.vnd.com.br' }, []).ok).toBe(true)
  })
})

describe('deveVerificarOrigem', () => {
  it('so mutaveis em APIs do aluno, exceto callbacks', () => {
    expect(deveVerificarOrigem('POST', '/api/aluno/login')).toBe(true)
    expect(deveVerificarOrigem('GET', '/api/aluno/login')).toBe(false)
    expect(deveVerificarOrigem('POST', '/api/webhooks/guru/x')).toBe(false)
    expect(deveVerificarOrigem('POST', '/api/leitura/office/1/callback')).toBe(false)
  })
})
