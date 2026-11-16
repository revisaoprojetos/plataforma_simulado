/**
 * IP: normalização (gravação) e rótulo (exibição). Puro/client-safe.
 * - Remove o prefixo IPv4-mapeado `::ffff:` e colchetes/porta (`[::1]:3000`, `1.2.3.4:5555`).
 * - Loopback (::1, 127.x, localhost) é exibido como "local (dev)" — é a máquina do desenvolvedor, não um aluno.
 */
export function normalizarIp(ip: string | null | undefined): string | null {
  let v = String(ip ?? '').trim()
  if (!v) return null
  const colchete = v.match(/^\[([^\]]+)\](?::\d+)?$/)
  if (colchete) v = colchete[1]
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(v)) v = v.replace(/:\d+$/, '')
  v = v.replace(/^::ffff:/i, '').toLowerCase()
  return v.slice(0, 64) || null
}

export function ipLoopback(ip: string | null | undefined): boolean {
  const v = normalizarIp(ip)
  return !!v && (v === '::1' || v === 'localhost' || /^127\./.test(v) || v === '0:0:0:0:0:0:0:1')
}

/** Texto para a UI: nunca vazio ('—'), sem prefixo `::ffff:`, loopback = "local (dev)". */
export function rotuloIp(ip: string | null | undefined): string {
  const v = normalizarIp(ip)
  if (!v) return '—'
  return ipLoopback(v) ? 'local (dev)' : v
}
