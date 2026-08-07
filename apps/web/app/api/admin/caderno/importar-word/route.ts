import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { hospedarImagensDoc } from '@/lib/caderno-designer/hospedar-imagens'

// Endpoint dinâmico (mutação/sessão) — nunca cachear.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Importa um Word (.docx) → documento do caderno (blocos), via FormData (multipart) — NÃO por
 * server action com base64. Motivo: um .docx com imagens vira base64 ~33% maior e estoura o
 * `bodySizeLimit` das server actions ("Falha ao ler o arquivo" / arquivo grande falha). Aqui o
 * arquivo chega em streaming, é validado, convertido, e as IMAGENS embutidas são hospedadas no
 * storage (base64 → URL) para o doc voltar LEVE (não infla o config nem trava o save/impressão).
 * NÃO grava nada: o editor insere o resultado e o admin revisa e salva.
 */
export async function POST(req: NextRequest) {
  const access = await getCurrentAccess()
  if (!access.tenantId || !(access.isAdmin || access.permissions.includes('questoes:update'))) {
    return NextResponse.json({ ok: false, error: 'Sem permissão.' }, { status: 403 })
  }

  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ ok: false, error: 'Envio inválido.' }, { status: 400 }) }
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: 'Nenhum arquivo enviado.' }, { status: 400 })
  const nome = (file.name || '').toLowerCase()
  if (!nome.endsWith('.docx')) return NextResponse.json({ ok: false, error: 'Envie um arquivo Word no formato .docx.' }, { status: 400 })
  if (file.size > 25 * 1024 * 1024) return NextResponse.json({ ok: false, error: 'Arquivo muito grande (máx. ~25 MB).' }, { status: 400 })

  const buf = Buffer.from(await file.arrayBuffer())
  if (!buf.length) return NextResponse.json({ ok: false, error: 'Arquivo vazio.' }, { status: 400 })
  // .docx é um contêiner ZIP → magic bytes "PK\x03\x04".
  if (!(buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04)) {
    return NextResponse.json({ ok: false, error: 'O arquivo não parece um .docx válido (talvez seja .doc antigo ou esteja corrompido).' }, { status: 400 })
  }

  try {
    // mammoth é pesado e roda fora do bundle (serverExternalPackages) — importa sob demanda.
    const { converterWordParaDoc } = await import('@/lib/caderno-designer/import-word')
    const { doc, avisos, resumo, erros } = await converterWordParaDoc(buf)
    if (erros?.length) return NextResponse.json({ ok: false, error: erros[0], erros, avisos }, { status: 422 })
    if (!resumo.blocos) return NextResponse.json({ ok: false, error: 'Não consegui extrair conteúdo do documento (arquivo vazio ou sem texto reconhecível).', avisos }, { status: 422 })
    // Hospeda as imagens embutidas (base64 → URL) para o doc ficar leve e a impressão rápida.
    try { const svc = createAdminClient(); await hospedarImagensDoc(doc, svc) } catch { /* mantém base64 se o storage falhar — não quebra o import */ }
    return NextResponse.json({ ok: true, doc, avisos, resumo })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message || 'Falha ao ler o Word.' }, { status: 500 })
  }
}
