import { NextResponse } from 'next/server'

// GET /api/health — healthcheck do Docker/Traefik + VERIFICAÇÃO DE DEPLOY.
// `sha` = commit desta imagem (injetado no build via ARG GIT_SHA → ENV BUILD_SHA).
// Depois de um deploy: `curl https://.../api/health` deve mostrar o SHA esperado.
// Endpoint dinamico (nunca cachear estaticamente).
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    sha: process.env.BUILD_SHA || null,
    startedAt: new Date(Date.now() - Math.round(process.uptime() * 1000)).toISOString(),
  }, { status: 200 })
}
