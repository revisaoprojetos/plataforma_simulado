'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { salvarConfigGlobal } from '@/app/admin/entrada/actions'
import type { ConfigGlobal } from '@/lib/config-global'

export function EntradaForm({ cfg }: { cfg: ConfigGlobal | null }) {
  const [layout, setLayout] = useState<string>(cfg?.login_layout ?? 'painel')
  const [selecao, setSelecao] = useState<string>(cfg?.login_selecao === false ? 'nao' : 'sim')
  const [filtro, setFiltro] = useState<string>(cfg?.logo_filtro_login ?? 'none')
  const [nome, setNome] = useState<string>(cfg?.entrada_nome ?? '')
  const [logo, setLogo] = useState<string>(cfg?.entrada_logo_url ?? '')
  const [cor, setCor] = useState<string>(cfg?.entrada_cor ?? '')
  const [modo, setModo] = useState<string>(cfg?.entrada_modo ?? 'light')
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const r = await salvarConfigGlobal({
        login_layout: layout,
        login_selecao: selecao === 'sim',
        logo_filtro_login: filtro,
        entrada_nome: nome,
        entrada_logo_url: logo,
        entrada_cor: cor,
        entrada_modo: modo,
      })
      if (r.ok) { toast.success('Entrada atualizada'); router.refresh() }
      else toast.error(r.error ?? 'Erro ao salvar')
    })
  }

  const corValida = /^#[0-9a-fA-F]{3,8}$/.test(cor.trim())

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1">
        <Label>Layout do login</Label>
        <Select value={layout} onValueChange={(v) => setLayout(v ?? 'painel')}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="painel">Painel (imagem + formulário lado a lado)</SelectItem>
            <SelectItem value="centralizado">Centralizado (card único)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label>Seletor de plataforma (quando há 1 só)</Label>
        <Select value={selecao} onValueChange={(v) => setSelecao(v ?? 'sim')}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="sim">Mostrar a tela de seleção</SelectItem>
            <SelectItem value="nao">Ir direto ao login</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">Com mais de uma plataforma, a seleção sempre aparece.</p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="e-nome">Nome neutro da entrada</Label>
        <Input id="e-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Plataforma de Simulados" />
      </div>

      <div className="space-y-1">
        <Label>Modo do login</Label>
        <Select value={modo} onValueChange={(v) => setModo(v ?? 'light')}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="light">Claro</SelectItem>
            <SelectItem value="dark">Escuro</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="e-logo">Logo neutra (URL ou data:image)</Label>
        <Input id="e-logo" value={logo} onChange={(e) => setLogo(e.target.value)} placeholder="https://… ou data:image/…" />
        <p className="text-xs text-muted-foreground">Aparece no painel do login. Vazio = usa a logo da 1ª plataforma (fallback).</p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="e-cor">Cor de destaque (hex)</Label>
        <div className="flex items-center gap-2">
          <span className="h-9 w-9 shrink-0 rounded-lg border" style={{ background: corValida ? cor : 'transparent' }} aria-hidden />
          <Input id="e-cor" value={cor} onChange={(e) => setCor(e.target.value)} placeholder="#6d28d9" />
        </div>
        {cor.trim() && !corValida && <p className="text-xs text-destructive">Use um hex válido (ex.: #6d28d9).</p>}
      </div>

      <div className="space-y-1">
        <Label>Filtro da logo no login</Label>
        <Select value={filtro} onValueChange={(v) => setFiltro(v ?? 'none')}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Original</SelectItem>
            <SelectItem value="branco">Forçar branco</SelectItem>
            <SelectItem value="preto">Forçar preto</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Salvar entrada
        </Button>
      </div>
    </form>
  )
}
