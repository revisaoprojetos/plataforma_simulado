import { describe, it, expect } from 'vitest'
import { parseUserAgent } from '../user-agent'
import { calcularAlertas, detectarRajada, horaBrt, type AcessoMin } from '../alertas'

describe('parseUserAgent', () => {
  it('Chrome Windows desktop', () => {
    expect(parseUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'))
      .toEqual({ navegador: 'Chrome', so: 'Windows', dispositivo: 'desktop' })
  })
  it('Edge', () => {
    expect(parseUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36 Edg/126.0').navegador).toBe('Edge')
  })
  it('Safari iPhone', () => {
    expect(parseUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'))
      .toEqual({ navegador: 'Safari', so: 'iOS', dispositivo: 'celular' })
  })
  it('Chrome iOS (CriOS)', () => {
    const r = parseUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1')
    expect(r.navegador).toBe('Chrome'); expect(r.so).toBe('iOS')
  })
  it('Android celular x tablet', () => {
    expect(parseUserAgent('Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36').dispositivo).toBe('celular')
    expect(parseUserAgent('Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 Chrome/126.0 Safari/537.36').dispositivo).toBe('tablet')
  })
  it('WebView Android e iPad', () => {
    expect(parseUserAgent('Mozilla/5.0 (Linux; Android 12; Pixel 6 Build/SD1A; wv) AppleWebKit/537.36 Version/4.0 Chrome/110.0 Mobile Safari/537.36').navegador).toBe('App/WebView')
    expect(parseUserAgent('Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1').dispositivo).toBe('tablet')
  })
  it('Firefox, vazio e bot', () => {
    expect(parseUserAgent('Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0')).toEqual({ navegador: 'Firefox', so: 'Linux', dispositivo: 'desktop' })
    expect(parseUserAgent(null).navegador).toBe('Desconhecido')
    expect(parseUserAgent('curl/8.0').navegador).toBe('Automação/Bot')
  })
})

const AGORA = Date.parse('2026-11-12T15:00:00Z')
const iso = (msAtras: number) => new Date(AGORA - msAtras).toISOString()
const H = 3_600_000
const ac = (o: Partial<AcessoMin> & { id: string }): AcessoMin => ({
  ip: '1.1.1.1', navegador: 'Chrome', so: 'Windows', dispositivo: 'desktop',
  iniciado_em: iso(H), ultimo_visto_em: iso(H), encerrado_em: null, ...o,
})

describe('calcularAlertas', () => {
  it('sem sinais -> sem alertas', () => {
    expect(calcularAlertas([ac({ id: 'a' })], [], AGORA)).toEqual([])
  })
  it('>=3 IPs em 24h', () => {
    const r = calcularAlertas([ac({ id: '1', ip: 'a' }), ac({ id: '2', ip: 'b' }), ac({ id: '3', ip: 'c' })], [], AGORA)
    expect(r.map((x) => x.codigo)).toContain('ips_24h')
  })
  it('2 IPs em 24h nao alerta', () => {
    const r = calcularAlertas([ac({ id: '1', ip: 'a', encerrado_em: iso(0) }), ac({ id: '2', ip: 'b', encerrado_em: iso(0) })], [], AGORA)
    expect(r.map((x) => x.codigo)).not.toContain('ips_24h')
  })
  it('sessoes simultaneas com IP/aparelho diferentes', () => {
    const r = calcularAlertas([
      ac({ id: '1', ip: 'a', ultimo_visto_em: iso(5 * 60_000) }),
      ac({ id: '2', ip: 'b', so: 'Android', dispositivo: 'celular', ultimo_visto_em: iso(2 * 60_000) }),
    ], [], AGORA)
    const s = r.find((x) => x.codigo === 'simultaneas')
    expect(s?.nivel).toBe('alto')
  })
  it('sessao encerrada ou parada nao conta como ativa', () => {
    const r = calcularAlertas([
      ac({ id: '1', ip: 'a', ultimo_visto_em: iso(5 * 60_000) }),
      ac({ id: '2', ip: 'b', ultimo_visto_em: iso(2 * H) }),
    ], [], AGORA)
    expect(r.map((x) => x.codigo)).not.toContain('simultaneas')
  })
  it('impersonacao e ignorada', () => {
    const r = calcularAlertas([ac({ id: '1', ip: 'a' }), ac({ id: '2', ip: 'b', impersonado_por: 'adm' }), ac({ id: '3', ip: 'c', impersonado_por: 'adm' })], [], AGORA)
    expect(r).toEqual([])
  })
  it('rajada de grifos vem da marca em meta', () => {
    const r = calcularAlertas([], [{ tipo: 'grifo_criado', criado_em: iso(0), meta: { rajada: true, qtd: 80 } }], AGORA)
    expect(r[0].codigo).toBe('rajada_grifos')
  })
  it('troca brusca de aparelho', () => {
    const r = calcularAlertas([
      ac({ id: '1', ip: 'a', iniciado_em: iso(3 * H), ultimo_visto_em: iso(2.5 * H), encerrado_em: iso(2.5 * H) }),
      ac({ id: '2', ip: 'b', so: 'Android', dispositivo: 'celular', iniciado_em: iso(2 * H), ultimo_visto_em: iso(2 * H), encerrado_em: iso(1.9 * H) }),
    ], [], AGORA)
    expect(r.map((x) => x.codigo)).toContain('troca_aparelho')
  })
  it('horario incomum: madrugada sem historico', () => {
    // baseline: 6 sessões às 12:00Z (09h BRT) há mais de 7 dias; nova às 05:00Z (02h BRT) ontem.
    const base = Array.from({ length: 6 }, (_, i) => ac({ id: `b${i}`, iniciado_em: new Date(Date.parse('2026-10-01T12:00:00Z') + i * 86_400_000).toISOString(), encerrado_em: 'x' }))
    const nova = ac({ id: 'n', iniciado_em: '2026-11-12T05:00:00Z', ultimo_visto_em: '2026-11-12T05:30:00Z', encerrado_em: 'x' })
    expect(calcularAlertas([...base, nova], [], AGORA).map((x) => x.codigo)).toContain('horario_incomum')
    const normal = ac({ id: 'n2', iniciado_em: '2026-11-12T12:30:00Z', ultimo_visto_em: '2026-11-12T13:00:00Z', encerrado_em: 'x' })
    expect(calcularAlertas([...base, normal], [], AGORA).map((x) => x.codigo)).not.toContain('horario_incomum')
  })
})

describe('detectarRajada / horaBrt', () => {
  it('31 eventos em 9s = rajada; espalhados nao', () => {
    const t0 = 1_000_000
    expect(detectarRajada(Array.from({ length: 31 }, (_, i) => t0 + i * 290)).rajada).toBe(true)
    expect(detectarRajada(Array.from({ length: 31 }, (_, i) => t0 + i * 2000)).rajada).toBe(false)
    expect(detectarRajada(Array.from({ length: 30 }, (_, i) => t0 + i * 100)).rajada).toBe(false)
  })
  it('horaBrt', () => {
    expect(horaBrt('2026-11-12T03:00:00Z')).toBe(0)
    expect(horaBrt('2026-11-12T01:00:00Z')).toBe(22)
  })
})
