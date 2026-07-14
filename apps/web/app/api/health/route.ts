import { NextResponse } from 'next/server'

// GET /api/health — usado pelo healthcheck do Docker/Traefik.
export async function GET() {
  return NextResponse.json({ status: 'ok' }, { status: 200 })
}
