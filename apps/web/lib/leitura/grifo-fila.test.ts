import { describe, it, expect } from 'vitest'
import { criarFilaGrifos, dividirCorpo, type CorpoAdd, type DepsFila, type RespostaHttp } from './grifo-fila'

const corpo = (over: Partial<CorpoAdd> = {}): CorpoAdd => ({
  documento_id: 'd1', versao: 1, inicio_char: 10, fim_char: 20, exact: 'abcdefghij', prefix: 'p', suffix: 's', tipo: 'grifo', ...over,
})

// Servidor falso com idempotência por client_id (como a rota com a coluna) e latência controlável.
function servidor(opts: { semColuna?: boolean; falhas?: Array<'rede' | 500 | 'perde-resposta'> } = {}) {
  const linhas = new Map<string, { id: string; cid?: string; deletado: boolean; cor?: string; nota?: string | null }>()
  const log: string[] = []
  let seq = 0
  const falhas = [...(opts.falhas ?? [])]
  const enviar: DepsFila['enviar'] = async (req) => {
    const f = falhas.shift()
    const b: any = req.body
    const aplicar = (): RespostaHttp => {
      if (req.method === 'DELETE') {
        const p = new URLSearchParams(req.qs.replace(/^\?/, ''))
        const id = p.get('id'); const cid = p.get('cid')
        const l = id ? linhas.get(id) : [...linhas.values()].find((x) => x.cid === cid)
        if (l) l.deletado = true
        log.push('del:' + (id ?? cid))
        return { ok: true, status: 200, json: { ok: true } }
      }
      if (b.id) {
        const l = linhas.get(b.id); if (l) { l.cor = b.cor; l.nota = b.nota }
        log.push('upd:' + b.id)
        return { ok: true, status: 200, json: { ok: true, id: b.id } }
      }
      const dup = !opts.semColuna && b.cid ? [...linhas.values()].find((x) => x.cid === b.cid) : undefined
      if (dup) { dup.deletado = false; log.push('dup:' + dup.id); return { ok: true, status: 200, json: { ok: true, id: dup.id } } }
      const id = 'srv' + ++seq
      linhas.set(id, { id, cid: opts.semColuna ? undefined : b.cid, deletado: false, cor: b.cor, nota: b.nota })
      log.push('add:' + id)
      return { ok: true, status: 200, json: { ok: true, id } }
    }
    if (f === 'rede') return null
    if (f === 500) return { ok: false, status: 500, json: {} }
    const r = aplicar()
    if (f === 'perde-resposta') return null
    return r
  }
  return { linhas, log, enviar, vivos: () => [...linhas.values()].filter((l) => !l.deletado) }
}

const mk = (srv: ReturnType<typeof servidor>, extra: Partial<DepsFila> = {}) => {
  const saved: Array<[string, string]> = []
  const fila = criarFilaGrifos({ enviar: srv.enviar, esperar: async () => {}, onSaved: (c, id) => saved.push([c, id]), ...extra })
  return { fila, saved }
}

describe('fila de grifos por cid', () => {
  it('del emitido antes do saved espera o add e apaga a linha criada (P0-3)', async () => {
    const srv = servidor()
    const { fila } = mk(srv)
    void fila.enviar({ op: 'add', cid: 'g1', corpo: corpo() })
    void fila.enviar({ op: 'del', cid: 'g1', id: null }) // sem id: o iframe ainda não recebeu o saved
    await fila.esvaziar(1000)
    expect(srv.vivos()).toHaveLength(0)
    expect(srv.log).toEqual(['add:srv1', 'del:srv1'])
  })

  it('upd antes do saved é aplicado depois do add, com o id resolvido', async () => {
    const srv = servidor()
    const { fila } = mk(srv)
    void fila.enviar({ op: 'add', cid: 'g1', corpo: corpo() })
    void fila.enviar({ op: 'upd', cid: 'g1', cor: '#86efac', nota: 'oi' })
    await fila.esvaziar(1000)
    expect(srv.linhas.get('srv1')).toMatchObject({ cor: '#86efac', nota: 'oi', deletado: false })
  })

  it('undo->redo->undo não duplica nem deixa linha órfã (com coluna client_id)', async () => {
    const srv = servidor()
    const { fila } = mk(srv)
    void fila.enviar({ op: 'add', cid: 'g1', corpo: corpo() })
    void fila.enviar({ op: 'del', cid: 'g1' }) // undo
    void fila.enviar({ op: 'add', cid: 'g1', corpo: corpo() }) // redo
    void fila.enviar({ op: 'del', cid: 'g1' }) // undo
    await fila.esvaziar(1000)
    expect(srv.linhas.size).toBe(1)
    expect(srv.vivos()).toHaveLength(0)
  })

  it('sem a coluna: redo cria nova linha mas o último undo apaga a nova (sem órfã)', async () => {
    const srv = servidor({ semColuna: true })
    const { fila } = mk(srv)
    void fila.enviar({ op: 'add', cid: 'g1', corpo: corpo() })
    void fila.enviar({ op: 'del', cid: 'g1' })
    void fila.enviar({ op: 'add', cid: 'g1', corpo: corpo() })
    void fila.enviar({ op: 'del', cid: 'g1' })
    await fila.esvaziar(1000)
    expect(srv.vivos()).toHaveLength(0)
  })

  it('resposta perdida + retry não duplica (idempotência por cid) e devolve o mesmo id (P0-4)', async () => {
    const srv = servidor({ falhas: ['perde-resposta'] })
    const { fila, saved } = mk(srv)
    void fila.enviar({ op: 'add', cid: 'g1', corpo: corpo() })
    await fila.esvaziar(1000)
    expect(srv.linhas.size).toBe(1)
    expect(saved).toEqual([['g1', 'srv1']])
  })

  it('falha definitiva fica em falhas (nunca descarta) e é retomada', async () => {
    const srv = servidor({ falhas: [500, 500, 500, 500, 500] })
    const estados: string[] = []
    const { fila, saved } = mk(srv, { onStatus: (s) => estados.push(s.estado) })
    void fila.enviar({ op: 'add', cid: 'g1', corpo: corpo() })
    await fila.esvaziar(1000)
    expect(fila.naoSincronizados).toBe(1)
    expect(estados[estados.length - 1]).toBe('erro')
    fila.retomarFalhas()
    await fila.esvaziar(1000)
    expect(fila.naoSincronizados).toBe(0)
    expect(saved).toEqual([['g1', 'srv1']])
  })

  it('upd feito enquanto o add está em falha vai junto no reenvio do add', async () => {
    const srv = servidor({ falhas: [500, 500, 500, 500, 500] })
    const { fila } = mk(srv)
    void fila.enviar({ op: 'add', cid: 'g1', corpo: corpo() })
    await fila.esvaziar(1000)
    void fila.enviar({ op: 'upd', cid: 'g1', cor: '#c4b5fd', nota: 'n' })
    await fila.esvaziar(1000)
    fila.retomarFalhas()
    await fila.esvaziar(1000)
    expect(srv.linhas.get('srv1')).toMatchObject({ cor: '#c4b5fd', nota: 'n' })
  })

  it('del após add falho apaga por cid (a gravação pode ter acontecido)', async () => {
    const srv = servidor({ falhas: ['perde-resposta', 'perde-resposta', 'perde-resposta', 'perde-resposta', 'perde-resposta'] })
    const { fila } = mk(srv)
    void fila.enviar({ op: 'add', cid: 'g1', corpo: corpo() })
    await fila.esvaziar(1000)
    expect(srv.linhas.size).toBe(1)
    void fila.enviar({ op: 'del', cid: 'g1' })
    await fila.esvaziar(1000)
    expect(srv.vivos()).toHaveLength(0)
    expect(fila.naoSincronizados).toBe(0)
  })

  it('operações de cids diferentes não se bloqueiam', async () => {
    const srv = servidor()
    const { fila } = mk(srv)
    void fila.enviar({ op: 'add', cid: 'a', corpo: corpo() })
    void fila.enviar({ op: 'add', cid: 'b', corpo: corpo() })
    await fila.esvaziar(1000)
    expect(srv.vivos()).toHaveLength(2)
  })

  it('esvaziar respeita o timeout com fila travada', async () => {
    const enviar: DepsFila['enviar'] = () => new Promise(() => {})
    const fila = criarFilaGrifos({ enviar, esperar: async () => {} })
    void fila.enviar({ op: 'add', cid: 'x', corpo: corpo() })
    const t0 = Date.now()
    await fila.esvaziar(50)
    expect(Date.now() - t0).toBeLessThan(500)
    expect(fila.pendentes).toBe(1)
  })
})

describe('dividirCorpo (exact > 4000)', () => {
  it('não divide quando cabe', () => {
    expect(dividirCorpo(corpo())).toHaveLength(1)
  })
  it('divide em partes <= 4000, contíguas, sem perder texto; nota só na primeira', () => {
    const exact = ('palavra ').repeat(1500) // 12000 chars
    const partes = dividirCorpo(corpo({ inicio_char: 100, fim_char: 100 + exact.length, exact, nota: 'n', cor: '#fde047' }))
    expect(partes.length).toBeGreaterThanOrEqual(3)
    expect(partes.every((p) => p.exact.length <= 4000)).toBe(true)
    expect(partes.map((p) => p.exact).join('')).toBe(exact)
    partes.forEach((p, i) => {
      expect(p.fim_char - p.inicio_char).toBe(p.exact.length)
      if (i) expect(p.inicio_char).toBe(partes[i - 1].fim_char)
      expect(p.nota).toBe(i === 0 ? 'n' : undefined)
      expect(p.cor).toBe('#fde047')
    })
  })
  it('add dividido grava N linhas e del apaga todas', async () => {
    const srv = servidor()
    const { fila } = mk(srv)
    const exact = 'x'.repeat(9000)
    void fila.enviar({ op: 'add', cid: 'g1', corpo: corpo({ exact, fim_char: 9010 }) })
    await fila.esvaziar(1000)
    expect(srv.vivos()).toHaveLength(3)
    void fila.enviar({ op: 'del', cid: 'g1' })
    await fila.esvaziar(1000)
    expect(srv.vivos()).toHaveLength(0)
  })
})
