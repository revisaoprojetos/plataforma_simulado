import { NextRequest, NextResponse } from 'next/server'
import { cronAutorizado } from '@/lib/seguranca/cron-auth'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { criarNotificacoesEmMassa } from '@/lib/notificacoes/criar'
import { brtLocalParaIso, isoParaBrtLocal } from '@/lib/brt'

export const dynamic = 'force-dynamic'

/**
 * CS › Calendário de eventos: "Lembrar os alunos 1 hora antes". Rodar a cada ~5 min (CRON_SECRET).
 * Cria uma NOTIFICAÇÃO IN-APP (sino do portal) para quem está no grupo do evento (ou todos) quando faltam ≤ 65 min,
 * e carimba `lembrete_enviado_em` (idempotente). NÃO envia e-mail/WhatsApp. DRY-RUN por padrão; `?aplicar=1` efetiva.
 */
function autorizado(req: NextRequest): boolean {
  return cronAutorizado(req)
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ message: 'Não autorizado.' }, { status: 401 })
  const dry = new URL(req.url).searchParams.get('aplicar') !== '1'
  const svc = createAdminClient()
  const agora = Date.now(), limite = agora + 65 * 60_000
  // janela de datas candidatas (hoje e amanhã em Brasília) — o filtro fino de hora é abaixo
  const hoje = isoParaBrtLocal(new Date(agora).toISOString()).slice(0, 10)
  const amanha = isoParaBrtLocal(new Date(agora + 86_400_000).toISOString()).slice(0, 10)
  const { data, error } = await svc.from('simulado_eventos_calendario').select('id, tenant_id, titulo, data, hora, grupo_id, link')
    .eq('lembrete_1h', true).is('lembrete_enviado_em', null).gte('data', hoje).lte('data', amanha).order('data').order('hora').order('id').limit(200)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  const out: unknown[] = []
  for (const e of (data ?? []) as any[]) {
    const quando = brtLocalParaIso(`${e.data}T${String(e.hora).slice(0, 5)}`)
    const t = quando ? new Date(quando).getTime() : 0
    if (!t || t < agora || t > limite) continue
    if (dry) { out.push({ id: e.id, titulo: e.titulo, acao: 'dry-run' }); continue }
    let ids: string[]
    if (e.grupo_id) {
      ids = (await fetchAll<{ id: string; estudante_id: string }>(() => svc.from('simulado_grupo_membros').select('id, estudante_id').eq('tenant_id', e.tenant_id).eq('grupo_id', e.grupo_id).order('id', { ascending: true }))).map((m) => m.estudante_id)
    } else {
      ids = (await fetchAll<{ id: string }>(() => svc.from('simulado_estudantes').select('id').eq('tenant_id', e.tenant_id).eq('deletado', false).eq('acesso_bloqueado', false).order('id', { ascending: true }))).map((m) => m.id)
    }
    const n = await criarNotificacoesEmMassa(svc, e.tenant_id, ids, { tipo: 'info', titulo: `Daqui a pouco: ${e.titulo}`, mensagem: `Começa às ${String(e.hora).slice(0, 5)}.`, link: e.link ?? null })
    await svc.from('simulado_eventos_calendario').update({ lembrete_enviado_em: new Date().toISOString() }).eq('id', e.id)
    out.push({ id: e.id, titulo: e.titulo, notificados: n })
  }
  return NextResponse.json({ ok: true, dry, eventos: out })
}
