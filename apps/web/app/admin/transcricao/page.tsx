import { ScanText } from 'lucide-react'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { SemPermissao } from '@/components/ui/alert-box'
import { statusConfigIA } from './actions'
import { TranscricaoForm } from './transcricao-form'

export const dynamic = 'force-dynamic'

/** Configuração da transcrição/correção por IA de visão (chave de API por tenant, multi-provedor). */
export default async function TranscricaoIAPage() {
  const access = await getCurrentAccess()
  const pode = access.isAdmin || accessCan(access, 'configuracoes:manage') || accessCan(access, 'configuracoes:view')
  if (!pode) return <SemPermissao />

  const inicial = await statusConfigIA()
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><ScanText className="h-5 w-5" /></span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Transcrição por IA</h1>
          <p className="text-muted-foreground">Cole uma chave de API e o sistema se adapta ao provedor (OpenAI · Anthropic · Gemini) para transcrever o manuscrito e sugerir a correção das discursivas.</p>
        </div>
      </div>
      <TranscricaoForm inicial={inicial} />
    </div>
  )
}
