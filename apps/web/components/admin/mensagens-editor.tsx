'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { MessageSquare, Phone, Globe, Clock, Mail, Eye } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import type { TenantMensagem, TenantContato } from '@/lib/tenant-messages'
import { salvarContatos, salvarMensagens } from '@/app/admin/configuracoes/mensagens/actions'

const GROUP_LABELS: Record<string, { label: string; color: string }> = {
  bloqueio:   { label: 'Bloqueio',  color: 'text-destructive' },
  liberacao:  { label: 'Liberação', color: 'text-emerald-600 dark:text-emerald-400' },
  alerta:     { label: 'Alerta',    color: 'text-yellow-600 dark:text-yellow-400' },
}

function groupKey(chave: string): string {
  if (chave.startsWith('bloqueio_'))  return 'bloqueio'
  if (chave.startsWith('liberacao_')) return 'liberacao'
  if (chave.startsWith('alerta_'))    return 'alerta'
  return 'outro'
}

const PREVIEW_VARS: Record<string, string> = {
  nome:               'Maria Silva',
  simulado:           'Simulado Geral 2026',
  prazo:              '2 dias',
  contato:            'suporte@plataforma.com',
  tentativas_restantes: '0',
}

function renderPreview(template: string): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => PREVIEW_VARS[key] ?? `{{${key}}}`)
}

interface MensagemRowProps {
  msg: TenantMensagem
  onChange: (updated: TenantMensagem) => void
}

function MensagemRow({ msg, onChange }: MensagemRowProps) {
  const [showPreview, setShowPreview] = useState(false)

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center justify-between gap-4">
        <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
          {msg.chave}
        </code>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Eye className="h-3.5 w-3.5" />
            {showPreview ? 'Fechar' : 'Prévia'}
          </button>
          <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={msg.ativo}
              onChange={(e) => onChange({ ...msg, ativo: e.target.checked })}
              className="h-4 w-4 rounded border-input accent-primary"
            />
            Ativo
          </label>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
        <div className="space-y-1.5">
          <Label className="text-xs">Título</Label>
          <Input
            value={msg.titulo}
            onChange={(e) => onChange({ ...msg, titulo: e.target.value })}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">
            Corpo{' '}
            <span className="text-muted-foreground font-normal">
              — vars: {'{{nome}}'}, {'{{simulado}}'}, {'{{prazo}}'}, {'{{contato}}'}
            </span>
          </Label>
          <Textarea
            value={msg.corpo}
            onChange={(e) => onChange({ ...msg, corpo: e.target.value })}
            className="min-h-0 text-sm"
            rows={2}
          />
        </div>
      </div>

      {showPreview && (
        <div className="rounded-md border border-dashed bg-background p-3 space-y-0.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
            Prévia
          </p>
          <p className="text-sm font-semibold">{renderPreview(msg.titulo)}</p>
          <p className="text-sm text-muted-foreground">{renderPreview(msg.corpo)}</p>
        </div>
      )}
    </div>
  )
}

interface MensagensEditorProps {
  mensagens: TenantMensagem[]
  contato: TenantContato
}

export function MensagensEditor({ mensagens, contato: initialContato }: MensagensEditorProps) {
  const [items, setItems] = useState<TenantMensagem[]>(mensagens)
  const [contato, setContato] = useState<TenantContato>(initialContato)
  const [isPendingContatos, startContatos] = useTransition()
  const [isPendingMensagens, startMensagens] = useTransition()

  function updateItem(updated: TenantMensagem) {
    setItems((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
  }

  function handleSalvarContatos(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startContatos(async () => {
      try {
        await salvarContatos(formData)
        toast.success('Contatos salvos!')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erro ao salvar contatos')
      }
    })
  }

  function handleSalvarMensagens() {
    startMensagens(async () => {
      try {
        await salvarMensagens(items.map((m) => ({ id: m.id, titulo: m.titulo, corpo: m.corpo, ativo: m.ativo })))
        toast.success('Mensagens salvas!')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erro ao salvar mensagens')
      }
    })
  }

  const grouped = Object.entries(GROUP_LABELS).map(([gk, meta]) => ({
    key: gk,
    ...meta,
    items: items.filter((m) => groupKey(m.chave) === gk),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="space-y-6">
      {/* ── Seção A: Contatos ─────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Contatos de suporte</CardTitle>
          <CardDescription>
            Canais exibidos nas mensagens de bloqueio para que o aluno saiba como entrar em contato.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSalvarContatos} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="whatsapp" className="flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
                </Label>
                <Input
                  id="whatsapp"
                  name="whatsapp"
                  placeholder="+55 11 99999-9999"
                  defaultValue={contato.whatsapp ?? ''}
                  onChange={(e) => setContato((c) => ({ ...c, whatsapp: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email_suporte" className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" /> E-mail de suporte
                </Label>
                <Input
                  id="email_suporte"
                  name="email_suporte"
                  type="email"
                  placeholder="suporte@plataforma.com"
                  defaultValue={contato.email_suporte ?? ''}
                  onChange={(e) => setContato((c) => ({ ...c, email_suporte: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="telefone" className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" /> Telefone
                </Label>
                <Input
                  id="telefone"
                  name="telefone"
                  placeholder="+55 11 3333-4444"
                  defaultValue={contato.telefone ?? ''}
                  onChange={(e) => setContato((c) => ({ ...c, telefone: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="link_ajuda" className="flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5" /> Link de ajuda
                </Label>
                <Input
                  id="link_ajuda"
                  name="link_ajuda"
                  type="url"
                  placeholder="https://ajuda.plataforma.com"
                  defaultValue={contato.link_ajuda ?? ''}
                  onChange={(e) => setContato((c) => ({ ...c, link_ajuda: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="horario_atendimento" className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> Horário de atendimento
                </Label>
                <Input
                  id="horario_atendimento"
                  name="horario_atendimento"
                  placeholder="Seg–Sex, 9h–18h"
                  defaultValue={contato.horario_atendimento ?? ''}
                  onChange={(e) => setContato((c) => ({ ...c, horario_atendimento: e.target.value }))}
                />
              </div>
            </div>

            <Button type="submit" disabled={isPendingContatos}>
              {isPendingContatos ? 'Salvando…' : 'Salvar contatos'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ── Seção B: Mensagens ────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Mensagens por tipo</CardTitle>
          <CardDescription>
            Textos exibidos ao aluno em cada situação. Use {'{{nome}}'}, {'{{simulado}}'},{' '}
            {'{{prazo}}'} e {'{{contato}}'} como variáveis dinâmicas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {grouped.map((group, gi) => (
            <div key={group.key} className="space-y-3">
              {gi > 0 && <Separator />}
              <p className={`text-sm font-semibold ${group.color}`}>{group.label}</p>
              <div className="space-y-3">
                {group.items.map((msg) => (
                  <MensagemRow key={msg.id} msg={msg} onChange={updateItem} />
                ))}
              </div>
            </div>
          ))}

          <Button onClick={handleSalvarMensagens} disabled={isPendingMensagens}>
            {isPendingMensagens ? 'Salvando…' : 'Salvar todas as mensagens'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
