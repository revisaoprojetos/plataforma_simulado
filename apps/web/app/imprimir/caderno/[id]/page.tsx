import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { CadernoPrintControls } from '@/components/admin/caderno-print-controls'

const LETRA = ['A', 'B', 'C', 'D', 'E', 'F']

export default async function CadernoImprimirPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ gabarito?: string }>
}) {
  const { id } = await params
  const { gabarito: g } = await searchParams
  const gabarito = g === '1'

  const access = await getCurrentAccess()
  if (!access.isAdmin && !access.permissions.includes('questoes:view')) notFound()

  const svc = createAdminClient()
  const { data: caderno } = await svc
    .from('simulado_cadernos_designer')
    .select('id, nome, config')
    .eq('id', id)
    .eq('tenant_id', access.tenantId ?? '')
    .maybeSingle()
  if (!caderno) notFound()

  const config = (caderno.config ?? { blocos: [] }) as { cabecalho?: string; instrucoes?: string; blocos?: any[] }
  const blocos = config.blocos ?? []
  const qIds = blocos.filter((b) => b.tipo === 'questao' && b.questao_id).map((b) => b.questao_id)

  const [{ data: questoes }, { data: alts }] = await Promise.all([
    qIds.length ? svc.from('simulado_questoes').select('id, enunciado, tipo').in('id', qIds) : Promise.resolve({ data: [] as any[] }),
    qIds.length ? svc.from('simulado_alternativas').select('id, questao_id, texto, ordem, correta').in('questao_id', qIds) : Promise.resolve({ data: [] as any[] }),
  ])
  const qMap = new Map((questoes ?? []).map((q: any) => [q.id, q]))
  const altMap = new Map<string, any[]>()
  for (const a of alts ?? []) {
    const arr = altMap.get(a.questao_id) ?? []; arr.push(a); altMap.set(a.questao_id, arr)
  }

  let numero = 0

  return (
    <div className="min-h-screen bg-white text-black">
      <style>{`
        @media print { .no-print { display: none !important; } @page { margin: 18mm 16mm; } }
        .folha { max-width: 720px; margin: 0 auto; padding: 24px; font-family: Georgia, 'Times New Roman', serif; }
        .q-alt { break-inside: avoid; }
      `}</style>

      <CadernoPrintControls cadernoId={caderno.id} gabarito={gabarito} />

      <div className="folha">
        <h1 className="mb-1 text-center text-xl font-bold">{config.cabecalho || caderno.nome}</h1>
        {gabarito && <p className="mb-3 text-center text-sm font-semibold text-red-600">— GABARITO —</p>}
        {config.instrucoes && (
          <div className="mb-5 whitespace-pre-wrap rounded border border-black/20 p-3 text-sm">{config.instrucoes}</div>
        )}

        <div className="space-y-5">
          {blocos.map((b: any, i: number) => {
            if (b.tipo === 'texto') {
              return <p key={i} className="whitespace-pre-wrap text-[15px] leading-relaxed">{b.conteudo}</p>
            }
            const q = qMap.get(b.questao_id)
            if (!q) return null
            numero += 1
            const qAlts = (altMap.get(q.id) ?? []).slice().sort((a, b2) => a.ordem - b2.ordem)
            return (
              <div key={i} className="q-alt text-[15px] leading-relaxed">
                <p className="mb-1"><strong>{numero}.</strong> {q.enunciado}</p>
                {q.tipo === 'discursiva' ? (
                  <div className="mt-2 space-y-4">
                    {[0, 1, 2, 3, 4, 5].map((n) => <div key={n} className="border-b border-black/30" style={{ height: '1.4em' }} />)}
                  </div>
                ) : (
                  <div className="ml-4 space-y-1">
                    {qAlts.map((a, idx) => (
                      <p key={a.id} className={gabarito && a.correta ? 'font-semibold' : ''}>
                        {gabarito && a.correta ? '☑' : '○'} {LETRA[idx] ?? idx + 1}) {a.texto}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
