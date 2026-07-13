import 'server-only'
import { createServiceClient } from '@/lib/supabase/server'

/** Substitui {{caminho.no.contexto}} pelos valores do contexto. */
function interpolar(str: unknown, ctx: Record<string, any>): string {
  return String(str ?? '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, path: string) => {
    const val = path.split('.').reduce<any>((o, k) => (o == null ? undefined : o[k]), ctx)
    return val == null ? '' : String(val)
  })
}

function getPath(ctx: Record<string, any>, path: string): any {
  return String(path ?? '').split('.').reduce<any>((o, k) => (o == null ? undefined : o[k]), ctx)
}

function avaliaCondicao(config: any, ctx: Record<string, any>): boolean {
  const campo = getPath(ctx, config?.campo ?? '')
  const alvo = config?.valor
  const a = Number(campo), b = Number(alvo)
  const numOk = !Number.isNaN(a) && !Number.isNaN(b)
  switch (config?.operador) {
    case '>': return numOk && a > b
    case '>=': return numOk && a >= b
    case '<': return numOk && a < b
    case '<=': return numOk && a <= b
    case '==': return String(campo) === String(alvo)
    case '!=': return String(campo) !== String(alvo)
    default: return true
  }
}

/**
 * Roda as automações ativas do tenant cujo gatilho == evento, executando os passos.
 * HTTP Request executa de verdade (chama qualquer URL, inclusive um fluxo n8n);
 * Condição interrompe o fluxo quando falsa; WhatsApp/E-mail ficam "pendentes de integração".
 * Best-effort: nunca lança (não quebra o fluxo do aluno).
 */
export async function rodarAutomacoes(tenantId: string | null | undefined, evento: string, dados: Record<string, any>): Promise<void> {
  if (!tenantId) return
  try {
    const svc = await createServiceClient()
    const { data: autos } = await svc
      .from('simulado_automacoes')
      .select('id, passos')
      .eq('tenant_id', tenantId)
      .eq('ativo', true)
      .eq('gatilho', evento)
    if (!autos?.length) return

    // Mesmo contexto do payload dos webhooks (contact / simulado / resultado / event).
    const ctx = {
      event: evento,
      contact: dados.contact ?? null,
      simulado: dados.simulado ?? null,
      resultado: {
        sessao_id: dados.sessao_id ?? null,
        nota: dados.nota ?? null,
        acertos: dados.acertos ?? null,
        total: dados.total ?? null,
        tentativa: dados.tentativa ?? null,
        motivo: dados.motivo ?? null,
      },
    }

    for (const a of autos as any[]) {
      let status = 'ok'
      try {
        for (const passo of (a.passos ?? []) as any[]) {
          if (passo.tipo === 'condicao') {
            if (!avaliaCondicao(passo.config ?? {}, ctx)) { status = 'parou na condição'; break }
          } else if (passo.tipo === 'http') {
            const url = interpolar(passo.config?.url, ctx)
            if (!/^https?:\/\//i.test(url)) continue
            const metodo = String(passo.config?.metodo ?? 'POST').toUpperCase()
            const corpo = passo.config?.corpo ? interpolar(passo.config.corpo, ctx) : undefined
            const ctrl = new AbortController()
            const t = setTimeout(() => ctrl.abort(), 8000)
            try {
              await fetch(url, {
                method: metodo,
                headers: corpo ? { 'Content-Type': 'application/json' } : {},
                body: metodo === 'GET' ? undefined : corpo,
                signal: ctrl.signal,
              })
            } finally { clearTimeout(t) }
          } else {
            // whatsapp / email — integração do canal ainda não montada.
            status = 'parcial (canal pendente)'
          }
        }
      } catch {
        status = 'erro'
      }
      await svc.from('simulado_automacoes').update({ ultimo_status: status, ultimo_run: new Date().toISOString() }).eq('id', a.id)
    }
  } catch {
    // best-effort
  }
}
