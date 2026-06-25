import { AlertTriangle, Mail, Phone, MessageCircle, ExternalLink, Clock } from 'lucide-react'
import { getTenantMensagem, getTenantContato } from '@/lib/tenant-messages'
import { cn } from '@/lib/utils'

interface BloqueioMensagemProps {
  chave: string
  vars?: Record<string, string>
  className?: string
}

export async function BloqueioMensagem({ chave, vars = {}, className }: BloqueioMensagemProps) {
  const contato = await getTenantContato()

  const contatoStr = [
    contato.whatsapp && `WhatsApp: ${contato.whatsapp}`,
    contato.email_suporte,
  ].filter(Boolean).join(' | ') || 'o suporte'

  const { titulo, corpo } = await getTenantMensagem(chave, { ...vars, contato: contatoStr })

  const isBloqueio = chave.startsWith('bloqueio_')

  return (
    <div
      className={cn(
        'rounded-xl border p-5 space-y-4',
        isBloqueio
          ? 'border-destructive/30 bg-destructive/5'
          : 'border-yellow-300/50 bg-yellow-50/60 dark:bg-yellow-950/20 dark:border-yellow-500/30',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
            isBloqueio
              ? 'bg-destructive/15 text-destructive'
              : 'bg-yellow-200 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-400',
          )}
        >
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div className="space-y-1">
          <p className="font-semibold text-sm">{titulo}</p>
          <p className="text-sm text-muted-foreground">{corpo}</p>
        </div>
      </div>

      {(contato.whatsapp || contato.email_suporte || contato.telefone || contato.link_ajuda) && (
        <div className="border-t pt-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Canais de suporte
          </p>
          <div className="flex flex-wrap gap-3">
            {contato.whatsapp && (
              <a
                href={`https://wa.me/${contato.whatsapp.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 hover:underline"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                {contato.whatsapp}
              </a>
            )}
            {contato.email_suporte && (
              <a
                href={`mailto:${contato.email_suporte}`}
                className="inline-flex items-center gap-1.5 text-xs text-blue-700 dark:text-blue-400 hover:underline"
              >
                <Mail className="h-3.5 w-3.5" />
                {contato.email_suporte}
              </a>
            )}
            {contato.telefone && (
              <a
                href={`tel:${contato.telefone.replace(/\D/g, '')}`}
                className="inline-flex items-center gap-1.5 text-xs text-foreground hover:underline"
              >
                <Phone className="h-3.5 w-3.5" />
                {contato.telefone}
              </a>
            )}
            {contato.link_ajuda && (
              <a
                href={contato.link_ajuda}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-foreground hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Central de ajuda
              </a>
            )}
            {contato.horario_atendimento && (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {contato.horario_atendimento}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
