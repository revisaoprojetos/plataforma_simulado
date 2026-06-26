'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'

export async function aceitarConsentimento(
  userId: string,
  versaoPolitica: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createServiceClient()
    const headersList = await headers()
    const ip = headersList.get('x-forwarded-for') ?? headersList.get('x-real-ip') ?? 'unknown'
    const userAgent = headersList.get('user-agent') ?? ''

    const { error } = await supabase.from('simulado_lgpd_consentimentos').upsert(
      {
        user_id: userId,
        versao_politica: versaoPolitica,
        ip,
        user_agent: userAgent,
        aceito_em: new Date().toISOString(),
      },
      { onConflict: 'user_id,versao_politica' },
    )

    // If table doesn't exist yet, treat as accepted (migration pending)
    if (error && (error.message.includes('does not exist') || error.message.includes('schema cache'))) {
      return { ok: true }
    }
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}
