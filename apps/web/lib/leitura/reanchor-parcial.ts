// Re-âncora PARCIAL de um grifo/anotação quando o texto do documento muda (puro, sem I/O).
// Diferente do reancorar() (tudo-ou-nada pelo trecho exato), aqui só a parte do grifo que AINDA existe
// permanece: apagou o início/fim → encurta; apagou o miolo → o que sobrou fica contíguo; entrou texto novo
// no meio → o grifo se divide em dois (o texto inserido NÃO fica grifado). Nada é inventado: cada trecho
// devolvido é texto que já estava no grifo.

export interface AncoraParcial { inicio: number; fim: number; exact: string; prefix: string; suffix: string }
export interface TrechoGrifo { inicio: number; fim: number; exact: string; prefix: string; suffix: string }

const MAX_CELULAS = 4_000_000
const CTX = 40

type Tok = { t: string; i: number; f: number }
function tokens(s: string, base = 0): Tok[] {
  const out: Tok[] = []
  const re = /\S+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) out.push({ t: m[0], i: base + m.index, f: base + m.index + m[0].length })
  return out
}

/** Ocorrência de `needle` em S mais próxima de `perto` (-1 se não houver). */
function maisPerto(S: string, needle: string, perto: number): number {
  if (!needle) return -1
  let best = -1, d = Infinity
  let i = S.indexOf(needle)
  let n = 0
  while (i >= 0 && n++ < 400) {
    const dd = Math.abs(i - perto)
    if (dd < d) { d = dd; best = i }
    i = S.indexOf(needle, i + 1)
  }
  return best
}

const mk = (S: string, inicio: number, fim: number): TrechoGrifo => ({
  inicio, fim, exact: S.slice(inicio, fim),
  prefix: S.slice(Math.max(0, inicio - CTX), inicio), suffix: S.slice(fim, fim + CTX),
})

/**
 * Trechos do grifo que sobrevivem na nova espinha S. [] = nada sobrou (texto todo apagado).
 * Um único trecho idêntico à âncora original significa "sem mudança".
 */
export function reancorarParcial(S: string, a: AncoraParcial): TrechoGrifo[] {
  const ex = a.exact
  if (!ex || !ex.trim()) return []
  // 1) intacto na posição esperada
  if (S.slice(a.inicio, a.fim) === ex) return [mk(S, a.inicio, a.fim)]
  // 2) intacto em outra posição (texto deslocado): escolhe pelo contexto/proximidade
  const idxs: number[] = []
  for (let i = S.indexOf(ex); i >= 0 && idxs.length < 200; i = S.indexOf(ex, i + 1)) idxs.push(i)
  if (idxs.length) {
    let best = idxs[0], bs = -Infinity
    for (const idx of idxs) {
      const pre = S.slice(Math.max(0, idx - (a.prefix?.length ?? 0)), idx)
      const suf = S.slice(idx + ex.length, idx + ex.length + (a.suffix?.length ?? 0))
      let sc = 0
      if (a.prefix && pre.endsWith(a.prefix.slice(-8))) sc += 2
      if (a.suffix && suf.startsWith(a.suffix.slice(0, 8))) sc += 2
      sc -= Math.abs(idx - a.inicio) / 1000
      if (sc > bs) { bs = sc; best = idx }
    }
    return [mk(S, best, best + ex.length)]
  }
  // 3) mudou por dentro: acha a região (pelas pontas/contexto) e casa palavra a palavra
  const L = ex.length
  const head = ex.slice(0, Math.min(30, L)), tail = ex.slice(-Math.min(30, L))
  const ih = maisPerto(S, head, a.inicio)
  const it = maisPerto(S, tail, a.fim - tail.length)
  const ip = a.prefix ? maisPerto(S, a.prefix.slice(-20), a.inicio - 20) : -1
  const is = a.suffix ? maisPerto(S, a.suffix.slice(0, 20), a.fim) : -1
  let ini: number, fim: number
  if (ih >= 0 && it >= 0 && it + tail.length > ih && it + tail.length - ih <= L * 3 + 600) { ini = ih; fim = it + tail.length }
  else if (ih >= 0) { ini = ih; fim = ih + L }
  else if (it >= 0) { fim = it + tail.length; ini = fim - L }
  else {
    const s0 = ip >= 0 ? ip + Math.min(20, a.prefix.length) : a.inicio
    const e0 = is >= 0 ? is : s0 + L
    ini = s0; fim = Math.max(e0, s0 + Math.floor(L * 0.5))
  }
  const wi = Math.max(0, ini - 120), wf = Math.min(S.length, fim + 120)
  const A = tokens(ex)
  const B = tokens(S.slice(wi, wf), wi)
  if (!A.length || !B.length) return []
  if ((A.length + 1) * (B.length + 1) > MAX_CELULAS) return []
  const n = A.length, m = B.length, W = m + 1
  const dp = new Int32Array((n + 1) * W)
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    dp[i * W + j] = A[i].t === B[j].t ? dp[(i + 1) * W + j + 1] + 1 : Math.max(dp[(i + 1) * W + j], dp[i * W + j + 1])
  }
  const pares: Array<[number, number]> = []
  for (let i = 0, j = 0; i < n && j < m;) {
    if (A[i].t === B[j].t) { pares.push([i, j]); i++; j++ }
    else if (dp[(i + 1) * W + j] >= dp[i * W + j + 1]) i++
    else j++
  }
  // runs: palavras consecutivas em S (j+1). Inserção no meio quebra o grifo em dois.
  const runs: Array<{ a: number; b: number }> = []
  for (const [, j] of pares) {
    const r = runs[runs.length - 1]
    if (r && j === r.b + 1) r.b = j
    else runs.push({ a: j, b: j })
  }
  const out: TrechoGrifo[] = []
  for (const r of runs) {
    const ini2 = B[r.a].i, fim2 = B[r.b].f
    const naoEsp = S.slice(ini2, fim2).replace(/\s+/g, '').length
    if (naoEsp < 12 && r.b - r.a < 1) continue // fiapo solto (palavra curta casada por acaso)
    if (naoEsp < 6) continue
    out.push(mk(S, ini2, fim2))
  }
  // Se a soma do que sobrou é desprezível frente ao grifo original, é coincidência, não sobra real.
  const total = out.reduce((s, t) => s + t.exact.replace(/\s+/g, '').length, 0)
  if (total < Math.min(8, ex.replace(/\s+/g, '').length)) return []
  return out
}
