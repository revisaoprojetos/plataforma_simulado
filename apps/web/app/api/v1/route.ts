import { NextResponse } from 'next/server'
import { API_V1_ESCOPOS } from '@/lib/api-v1'

export const dynamic = 'force-dynamic'

/** GET /api/v1 — índice público dos endpoints (sem dados). Auth: Authorization: Bearer <chave>. */
export async function GET() {
  const paginado = { page: 'int>=1', per_page: 'int 1..100 (padrão 50)' }
  return NextResponse.json({
    versao: 'v1',
    somente_leitura: true,
    auth: 'Authorization: Bearer <api key> (ou X-API-Key)',
    rate_limit: '120 req/min por chave (429 + Retry-After)',
    envelope: '{ data, meta: { page, per_page, total } }',
    escopos: API_V1_ESCOPOS,
    endpoints: [
      { path: '/api/v1/whoami', escopo: '(qualquer)' },
      { path: '/api/v1/alunos', escopo: 'alunos:read', query: { ...paginado, q: 'nome/e-mail', updated_since: 'ISO' } },
      { path: '/api/v1/alunos/{id}', escopo: 'alunos:read' },
      { path: '/api/v1/acessos', escopo: 'acessos:read (+acessos:pii p/ ip/user_agent)', query: { ...paginado, estudante_id: 'uuid', desde: 'ISO', ate: 'ISO' } },
      { path: '/api/v1/atividades', escopo: 'atividades:read', query: { ...paginado, estudante_id: 'uuid', tipo: 'texto', desde: 'ISO', ate: 'ISO' } },
      { path: '/api/v1/simulados', escopo: 'simulados:read', query: { ...paginado, status: 'rascunho|publicado|encerrado' } },
      { path: '/api/v1/simulados/{id}/resultados', escopo: 'simulados:read', query: paginado },
      { path: '/api/v1/leitura/progresso', escopo: 'leitura:read', query: { ...paginado, estudante_id: 'uuid', documento_id: 'uuid', desde: 'ISO' } },
      { path: '/api/v1/metricas/resumo', escopo: 'metricas:read', query: { desde: 'ISO (padrão -30d)', ate: 'ISO' } },
    ],
  }, { headers: { 'cache-control': 'no-store' } })
}
