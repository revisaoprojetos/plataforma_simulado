// Cliente da rota /api/admin/cronogramas/conteudos/[id]/matriz (a tela só chama; o servidor valida, calcula e audita).
export type RespostaMatriz = { ok: boolean; message?: string; [k: string]: unknown }

const base = (id: string) => `/api/admin/cronogramas/conteudos/${id}/matriz`

export async function lerMatrizApi(id: string, params: Record<string, string | number | undefined>): Promise<RespostaMatriz> {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') qs.set(k, String(v))
  try {
    const r = await fetch(`${base(id)}?${qs}`, { cache: 'no-store' })
    return (await r.json()) as RespostaMatriz
  } catch { return { ok: false, message: 'Falha de rede.' } }
}

export async function gravarMatrizApi(id: string, corpo: Record<string, unknown>): Promise<RespostaMatriz> {
  try {
    const r = await fetch(base(id), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
    return (await r.json()) as RespostaMatriz
  } catch { return { ok: false, message: 'Falha de rede.' } }
}
