import { NextResponse } from 'next/server'

// GET /api/health — usado pelo healthcheck do Docker/Traefik.
// Endpoint dinamico (sessao/dados/mutacao) — nunca cachear estaticamente.
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ status: 'ok' }, { status: 200 })
}
