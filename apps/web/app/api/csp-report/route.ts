import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Coleta de violações da CSP (modo Report-Only). Sem autenticação por natureza (o navegador envia sozinho), então:
 * corpo limitado (8 KB), nada é persistido, só um resumo vai p/ o log do servidor — com amostragem p/ não inundar o log.
 * Use `docker logs … | grep csp-report` p/ decidir quando ligar CSP_ENFORCE=1.
 */
let contador = 0

export async function POST(req: NextRequest) {
  try {
    const texto = (await req.text()).slice(0, 8192)
    // Amostragem: 1 a cada 5 relatórios (sempre loga os 20 primeiros após cada subida).
    contador++
    if (contador <= 20 || contador % 5 === 0) {
      let resumo = texto
      try {
        const j = JSON.parse(texto)
        const r = j['csp-report'] ?? (Array.isArray(j) ? j[0]?.body : j?.body) ?? j
        resumo = JSON.stringify({
          doc: String(r?.['document-uri'] ?? r?.documentURL ?? '').slice(0, 160),
          dir: r?.['violated-directive'] ?? r?.effectiveDirective,
          bloqueado: String(r?.['blocked-uri'] ?? r?.blockedURL ?? '').slice(0, 160),
          linha: r?.['line-number'] ?? r?.lineNumber,
        })
      } catch { /* mantém o texto cru truncado */ }
      console.warn(`[csp-report] ${resumo.slice(0, 500)}`)
    }
  } catch { /* ignora */ }
  return new Response(null, { status: 204 })
}
