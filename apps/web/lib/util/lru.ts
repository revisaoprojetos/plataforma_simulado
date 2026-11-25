/**
 * Map com TETO de entradas (LRU) e TTL opcional — sem dependências.
 * É um `Map` de verdade (get/set/has/delete/keys/size/iteração), então substitui `new Map()` de cache em memória
 * sem mudar o código que o usa. Ao passar de `max`, descarta a entrada MENOS recentemente usada.
 * `ttlMs` (opcional) é um teto ADICIONAL: entradas mais velhas que isso somem no próximo get/has.
 * Não altera TTLs próprios que os chamadores já guardam dentro do valor.
 */
export class MapLru<K, V> extends Map<K, V> {
  private readonly _max: number
  private readonly _ttl: number
  private readonly _t = new Map<K, number>()

  constructor(max: number, ttlMs = 0) {
    super()
    this._max = Math.max(1, Math.floor(max))
    this._ttl = ttlMs
  }

  private _expirou(k: K): boolean {
    if (!this._ttl) return false
    const t = this._t.get(k)
    if (t !== undefined && Date.now() - t >= this._ttl) { this.delete(k); return true }
    return false
  }

  override get(k: K): V | undefined {
    if (!super.has(k) || this._expirou(k)) return undefined
    const v = super.get(k) as V
    super.delete(k); super.set(k, v) // marca como mais recente
    return v
  }

  override has(k: K): boolean {
    return super.has(k) && !this._expirou(k)
  }

  override set(k: K, v: V): this {
    if (super.has(k)) super.delete(k)
    super.set(k, v)
    if (this._ttl) this._t.set(k, Date.now())
    while (this.size > this._max) {
      const velho = super.keys().next().value as K
      this.delete(velho)
    }
    return this
  }

  override delete(k: K): boolean {
    this._t.delete(k)
    return super.delete(k)
  }

  override clear(): void {
    this._t.clear()
    super.clear()
  }
}
