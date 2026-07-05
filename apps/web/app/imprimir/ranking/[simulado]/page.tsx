import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, type Access } from '@/lib/auth/permissions'
import { verificarRenderToken } from '@/lib/pdf/render-token'
import { CadernoPrintControls } from '@/components/admin/caderno-print-controls'
import { montarRankingSimulado } from '@/app/admin/relatorios/ranking/_dados'
import { ordenarRanking, rotuloCriterio } from '@/lib/simulado/ranking'

const nota = (n: number | null) => (n == null ? '—' : n.toFixed(2).replace('.', ','))
const fmtData = (s?: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR') : '')

export default async function ImprimirRankingPage({
  params, searchParams,
}: {
  params: Promise<{ simulado: string }>
  searchParams: Promise<{ ate?: string; pdftoken?: string }>
}) {
  const { simulado: simId } = await params
  const { ate, pdftoken } = await searchParams

  // Acesso: cookie do admin OU token de render assinado (Gotenberg), escopado a este simulado.
  let access: Access
  const tokenPayload = verificarRenderToken(pdftoken)
  if (tokenPayload && tokenPayload.r === 'ranking' && tokenPayload.id === simId) {
    access = { userId: null, tenantId: tokenPayload.t, role: 'render', isAdmin: true, permissions: ['*'] }
  } else {
    access = await getCurrentAccess()
    if (!access.isAdmin && !access.permissions.includes('questoes:view')) notFound()
  }

  const svc = createAdminClient()

  // Confere que o simulado é do tenant.
  const { data: simCheck } = await svc.from('simulado_simulados').select('id').eq('id', simId).eq('tenant_id', access.tenantId ?? '').maybeSingle()
  if (!simCheck) notFound()

  // Marca do tenant (logo + cor primária).
  const { data: tenant } = await svc.from('simulado_tenants').select('nome, tema').eq('id', access.tenantId ?? '').maybeSingle()
  const tema = ((tenant as any)?.tema ?? {}) as { logo_url?: string; cor_primaria?: string; cores?: { primaria?: string } }
  const cor = tema.cores?.primaria || tema.cor_primaria || '#6d28d9'
  const logo = tema.logo_url || null

  const dados = await montarRankingSimulado(svc, simId, new Date().toISOString())
  if (!dados) notFound()

  const limite = Math.max(1, Number(ate) || dados.entradas.length)
  const ranking = ordenarRanking(dados.entradas, dados.criterios).slice(0, limite)
  const nomeGrupo = (id: string) => dados.grupos.find((g) => g.id === id)?.nome ?? 'Grupo'
  const gruposUsados = (dados.criterios.criterios ?? []).filter((cr) => cr.tipo === 'grupo' && cr.grupoId).map((cr) => cr.grupoId!) as string[]
  const temPassaporte = (dados.criterios.criterios ?? []).some((cr) => cr.tipo === 'passaporte')
  const temIdade = (dados.criterios.criterios ?? []).some((cr) => cr.tipo === 'idade')

  const criteriosResumo = (dados.criterios.criterios ?? []).map((cr, i) => `${i + 1}º ${rotuloCriterio(cr, nomeGrupo)}`).join(' · ')

  const estilo = `
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { background: #fff; }
    .impressao-wrap { padding: 24px 0; }
    .folha { width: 210mm; min-height: 297mm; padding: 14mm 12mm; box-sizing: border-box; margin: 0 auto 8mm; background: #fff; color: #111; font-family: ui-sans-serif, system-ui, sans-serif; }
    @media screen { .folha { box-shadow: 0 1px 10px rgba(0,0,0,.15); } }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    thead th { background: ${cor}; color: #fff; padding: 7px 8px; text-align: left; font-weight: 600; }
    tbody td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; }
    tbody tr:nth-child(even) td { background: #f8f8fb; }
    .pos { font-weight: 700; text-align: center; width: 34px; }
    .pts { font-weight: 700; text-align: right; color: ${cor}; white-space: nowrap; }
    .num { text-align: center; font-variant-numeric: tabular-nums; }
    @media print {
      .no-print { display: none !important; }
      @page { size: A4; margin: 0; }
      html, body { margin: 0 !important; padding: 0 !important; }
      .impressao-wrap { padding: 0 !important; }
      .folha { margin: 0 !important; }
      thead { display: table-header-group; }
      tr { break-inside: avoid; }
    }
  `

  return (
    <div className="impressao-wrap min-h-screen bg-neutral-100 text-black">
      <style>{estilo}</style>
      <CadernoPrintControls />
      <div className="folha">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderBottom: `2px solid ${cor}`, paddingBottom: 10, marginBottom: 12 }}>
          {logo && <img src={logo} alt="" style={{ height: 42, width: 'auto', objectFit: 'contain' }} />}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: 1 }}>Classificação — Ranking</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{dados.titulo}</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 11, color: '#666' }}>
            <div><strong style={{ color: '#111' }}>{ranking.length}</strong> classificados</div>
            <div>{(tenant as any)?.nome ?? ''}</div>
          </div>
        </div>

        {criteriosResumo && (
          <div style={{ fontSize: 10, color: '#666', marginBottom: 10 }}>
            <strong>Critérios de desempate:</strong> Pontuação · {criteriosResumo}
          </div>
        )}

        <table>
          <thead>
            <tr>
              <th className="pos">#</th>
              <th>Estudante</th>
              <th className="num">Acertos</th>
              <th className="num">%</th>
              {gruposUsados.map((g) => <th key={g} className="num">{nomeGrupo(g)}</th>)}
              {temPassaporte && <th>Classificação</th>}
              {temIdade && <th className="num">Idade</th>}
              <th className="pts">Pontos</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((r) => {
              const pct = r.total ? Math.round((r.acertos / r.total) * 100) : 0
              return (
                <tr key={r.estudanteId}>
                  <td className="pos">{r.pos}º</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.nome}</div>
                    {r.email && <div style={{ fontSize: 9, color: '#888' }}>{r.email}{r.data ? ` · ${fmtData(r.data)}` : ''}</div>}
                  </td>
                  <td className="num">{r.acertos}/{r.total}</td>
                  <td className="num">{pct}%</td>
                  {gruposUsados.map((g) => <td key={g} className="num">{r.porGrupo[g] ?? 0}</td>)}
                  {temPassaporte && <td>{r.classificacao ? r.classificacao.charAt(0).toUpperCase() + r.classificacao.slice(1) : '—'}</td>}
                  {temIdade && <td className="num">{r.idade ?? '—'}</td>}
                  <td className="pts">{nota(r.pontuacao)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
