'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SecaoHeader } from '@/components/admin/secao-header'
import { Loader2, Code2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import type { EmbedConfigInput } from '@/app/admin/tenants/actions'

/**
 * Config do EMBED por plataforma (super-admin), no console. Edita a linha de
 * `simulado_embed_config` do tenant: ativo, domínios permitidos (frame-ancestors),
 * método de identificação PADRÃO do aluno e OTP por e-mail.
 * `salvar` é a action `salvarEmbedConfigAction` já com o tenantId fixado via `.bind`.
 */
export function PlataformaEmbed({
  config,
  salvar,
}: {
  config: EmbedConfigInput
  salvar: (dados: EmbedConfigInput) => Promise<{ ok: boolean; error?: string }>
}) {
  const router = useRouter()
  const [ativo, setAtivo] = useState(config.ativo)
  const [metodo, setMetodo] = useState(config.metodo_identificacao || 'email_cpf')
  const [origens, setOrigens] = useState((config.origens_permitidas ?? []).join('\n'))
  const [otp, setOtp] = useState(config.otp_email)
  const [pending, start] = useTransition()

  function onSalvar() {
    start(async () => {
      const lista = origens.split('\n').map((s) => s.trim()).filter(Boolean)
      const r = await salvar({ ativo, metodo_identificacao: metodo, origens_permitidas: lista, otp_email: otp })
      if (r.ok) { toast.success('Configurações de embed salvas.'); router.refresh() }
      else toast.error(r.error ?? 'Erro ao salvar.')
    })
  }

  return (
    <Card className="overflow-hidden" style={{ ['--card-spacing' as string]: '0px' }}>
      <SecaoHeader icon={Code2} titulo="Área embedável" subtitulo="Widget do simulado em outra plataforma (iframe)" />
      <CardContent className="space-y-6 p-4">
        {/* Ativo */}
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Embed ativo</p>
            <p className="text-xs text-muted-foreground">Permite que os simulados desta plataforma sejam abertos via iframe.</p>
          </div>
          <Switch checked={ativo} onCheckedChange={setAtivo} />
        </div>

        {/* Método de identificação padrão */}
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Identificação padrão do aluno</p>
          <p className="text-xs text-muted-foreground">Campos exigidos para entrar. Cada simulado pode sobrescrever este padrão.</p>
          <Select value={metodo} onValueChange={(v) => v && setMetodo(v)}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="email">Apenas e-mail</SelectItem>
              <SelectItem value="email_cpf">E-mail + CPF</SelectItem>
              <SelectItem value="email_telefone">E-mail + Telefone</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Domínios permitidos */}
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Domínios permitidos</p>
          <p className="text-xs text-muted-foreground">Um por linha (ex.: <code className="rounded bg-muted px-1">https://area.cliente.com.br</code>). Só estes poderão embedar o widget. Vazio = qualquer origem.</p>
          <textarea
            value={origens}
            onChange={(e) => setOrigens(e.target.value)}
            rows={4}
            spellCheck={false}
            placeholder={'https://area.cliente.com.br\nhttps://membros.escola.com'}
            className="mt-1 w-full rounded-lg border bg-background px-3 py-2 font-mono text-xs leading-relaxed outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        {/* OTP */}
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <p className="flex items-center gap-1.5 text-sm font-medium"><ShieldCheck className="h-4 w-4 text-muted-foreground" /> Código por e-mail (OTP)</p>
            <p className="text-xs text-muted-foreground">Exige um código enviado por e-mail como 2º fator leve na entrada.</p>
          </div>
          <Switch checked={otp} onCheckedChange={setOtp} />
        </div>

        <div className="flex justify-end border-t pt-4">
          <button
            type="button"
            onClick={onSalvar}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-60"
          >
            {pending ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando…</> : 'Salvar'}
          </button>
        </div>
      </CardContent>
    </Card>
  )
}
