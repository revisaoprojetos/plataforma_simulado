'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

interface EmbedConfigFormProps {
  simuladoId: string
  embedAtivo: boolean
  embedToken: string | null
  metodoIdentificacao: string
}

export function EmbedConfigForm({
  simuladoId,
  embedAtivo: initialEmbedAtivo,
  embedToken: initialToken,
  metodoIdentificacao: initialMetodo,
}: EmbedConfigFormProps) {
  const router = useRouter()
  const [embedAtivo, setEmbedAtivo] = useState(initialEmbedAtivo)
  const [metodo, setMetodo] = useState(initialMetodo)
  const [isSaving, setIsSaving] = useState(false)
  const [isRegenerando, setIsRegenerando] = useState(false)

  async function handleSave() {
    setIsSaving(true)
    try {
      const res = await fetch(`/api/admin/simulados/${simuladoId}/embed`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embed_ativo: embedAtivo, metodo_identificacao: metodo }),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        toast.error((json as { message?: string }).message ?? 'Erro ao salvar.')
        return
      }

      toast.success('Configurações de embed salvas.')
      router.refresh()
    } catch {
      toast.error('Erro ao salvar configurações.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleRegenerarToken() {
    setIsRegenerando(true)
    try {
      const res = await fetch(`/api/admin/simulados/${simuladoId}/embed/regenerar-token`, {
        method: 'POST',
      })

      if (!res.ok) {
        toast.error('Erro ao regenerar token.')
        return
      }

      toast.success('Token regenerado. O link anterior foi invalidado.')
      router.refresh()
    } catch {
      toast.error('Erro ao regenerar token.')
    } finally {
      setIsRegenerando(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Configurações</CardTitle>
        <CardDescription>
          Controle como o simulado é acessado via embed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium">Embed Ativo</Label>
            <p className="text-xs text-muted-foreground">
              Permite que o simulado seja acessado via iframe.
            </p>
          </div>
          <Switch
            checked={embedAtivo}
            onCheckedChange={setEmbedAtivo}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Método de Identificação</Label>
          <p className="text-xs text-muted-foreground mb-2">
            Campos exigidos do aluno para acessar o simulado.
          </p>
          <Select value={metodo} onValueChange={(v) => v && setMetodo(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="email">Apenas e-mail</SelectItem>
              <SelectItem value="email_cpf">E-mail + CPF</SelectItem>
              <SelectItem value="email_telefone">E-mail + Telefone</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button className="w-full" onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Salvando...
            </>
          ) : (
            'Salvar Configurações'
          )}
        </Button>

        {initialToken && (
          <div className="border-t pt-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Token atual</p>
            <code className="block rounded bg-muted px-3 py-2 text-xs break-all">
              {initialToken}
            </code>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={handleRegenerarToken}
              disabled={isRegenerando}
            >
              {isRegenerando ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  Regenerando...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                  Regenerar Token
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground">
              Regenerar invalida o link anterior imediatamente.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
