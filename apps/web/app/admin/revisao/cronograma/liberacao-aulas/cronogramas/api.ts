// Cliente da rota JSON das abas Cronogramas/Regras (client-safe). Domínios custom rejeitam server actions → rota de API.
export const ROTA_TRILHAS = '/api/admin/revisao/liberacao-aulas/trilhas'
export const ROTA_TRILHAS_IMPORTAR = '/api/admin/revisao/liberacao-aulas/trilhas/importar'

export async function chamarTrilhas<T extends object = object>(op: string, produtoId: string, args: Record<string, unknown> = {}): Promise<({ ok: true } & T) | { ok: false; error: string }> {
  try {
    const r = await fetch(ROTA_TRILHAS, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op, produtoId, ...args }) })
    const j = await r.json().catch(() => null)
    if (!j) return { ok: false, error: 'Resposta inválida do servidor.' }
    return j
  } catch { return { ok: false, error: 'Falha de rede.' } }
}
