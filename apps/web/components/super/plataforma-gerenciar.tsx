'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Save, Loader2, Eye, EyeOff, ExternalLink, Trash2, Users, GraduationCap, ClipboardList } from 'lucide-react'
import { confirmar, pedirTexto } from '@/components/ui/confirm-dialog'
import { updateTenantAction, toggleTenantAtivoAction, deleteTenantAction } from '@/app/admin/tenants/actions'

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9-]/g, '')

type Props = {
  id: string; nome: string; slug: string; plano: string; ativo: boolean; dominio: string | null
  usuarios: number; estudantes: number; simulados: number
}

export function PlataformaGerenciar(p: Props) {
  const router = useRouter()
  const [nome, setNome] = useState(p.nome)
  const [slug, setSlug] = useState(p.slug)
  const [plano, setPlano] = useState(p.plano || 'basico')
  const [pending, start] = useTransition()
  const [op, setOp] = useState<'salvar' | 'toggle' | 'excluir' | null>(null)

  const sujo = nome.trim() !== p.nome || slug !== p.slug || plano !== (p.plano || 'basico')
  const vazia = p.estudantes === 0 && p.simulados === 0

  function salvar() {
    setOp('salvar'); start(async () => {
      const r = await updateTenantAction(p.id, { nome, slug, plano })
      if (r.ok) { toast.success('Plataforma atualizada!'); router.refresh() }
      else toast.error(r.error ?? 'Erro ao salvar')
      setOp(null)
    })
  }

  function alternar() {
    setOp('toggle'); start(async () => {
      const r = await toggleTenantAtivoAction(p.id, !p.ativo)
      if (r.ok) { toast.success(p.ativo ? 'Plataforma ocultada.' : 'Plataforma reativada.'); router.refresh() }
      else toast.error(r.error ?? 'Erro ao alterar a visualização')
      setOp(null)
    })
  }

  function entrar() {
    const { protocol, host } = window.location
    let url: string
    if (p.dominio) url = `${protocol}//${p.dominio}/admin`
    else { const partes = host.split('.'); const base = partes.length > 1 ? partes.slice(1).join('.') : host; url = `${protocol}//${p.slug}.${base}/admin` }
    window.open(url, '_blank')
  }

  function excluir() {
    setOp('excluir'); start(async () => {
      if (p.ativo) { toast.error('Oculte a plataforma antes de excluir.'); setOp(null); return }
      const digitado = await pedirTexto({
        titulo: 'Excluir plataforma', mensagem: `Esta ação é irreversível. Digite o nome "${p.nome}" para confirmar.`,
        label: 'Nome da plataforma', placeholder: p.nome, confirmar: 'Excluir definitivamente',
      })
      if (digitado == null) { setOp(null); return }
      if (!(await confirmar({ titulo: 'Confirmar exclusão', mensagem: `Excluir "${p.nome}" permanentemente?`, confirmar: 'Excluir', destrutivo: true }))) { setOp(null); return }
      const r = await deleteTenantAction(p.id, digitado)
      if (r.ok) { toast.success('Plataforma excluída.'); router.push('/super/plataformas'); router.refresh() }
      else toast.error(r.error ?? 'Erro ao excluir')
      setOp(null)
    })
  }

  const kpis = [
    { label: 'Administradores', valor: p.usuarios, icon: Users },
    { label: 'Estudantes', valor: p.estudantes, icon: GraduationCap },
    { label: 'Simulados', valor: p.simulados, icon: ClipboardList },
  ]

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-3">
        {kpis.map((k) => (
          <div key={k.label} className="flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-sm">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground"><k.icon className="h-5 w-5" /></span>
            <div><p className="text-xs text-muted-foreground">{k.label}</p><p className="text-xl font-bold tracking-tight">{k.valor.toLocaleString('pt-BR')}</p></div>
          </div>
        ))}
      </div>

      {/* Editar */}
      <div id="editar" className="rounded-2xl border bg-card p-4 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold">Editar plataforma</h2>
        <p className="mb-4 text-xs text-muted-foreground">Nome exibido, subdomínio (slug) e plano.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="p-nome">Nome da plataforma</Label>
            <Input id="p-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Revisão PGE" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-slug">Subdomínio (slug)</Label>
            <Input id="p-slug" value={slug} onChange={(e) => setSlug(slugify(e.target.value))} placeholder="revisaopge" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-plano">Plano</Label>
            <Select value={plano} onValueChange={(v) => setPlano(v ?? 'basico')}>
              <SelectTrigger id="p-plano"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="basico">Básico</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-4">
          <Button onClick={salvar} disabled={!sujo || pending}>
            {pending && op === 'salvar' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Salvar alterações
          </Button>
        </div>
      </div>

      {/* Visualização + Entrar */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <h2 className="text-sm font-semibold">Visualização</h2>
          <p className="mb-3 mt-1 text-xs text-muted-foreground">
            {p.ativo ? 'A plataforma está ativa e disponível para acesso.' : 'A plataforma está oculta — ninguém acessa até reativar.'}
          </p>
          <Button variant="outline" onClick={alternar} disabled={pending}>
            {pending && op === 'toggle' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : p.ativo ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
            {p.ativo ? 'Ocultar plataforma' : 'Reativar plataforma'}
          </Button>
        </div>
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <h2 className="text-sm font-semibold">Painel da plataforma</h2>
          <p className="mb-3 mt-1 text-xs text-muted-foreground">Abrir o admin desta plataforma (em nova aba) para gerenciar o conteúdo dela.</p>
          <Button variant="outline" onClick={entrar}><ExternalLink className="mr-2 h-4 w-4" /> Abrir painel</Button>
        </div>
      </div>

      {/* Zona de perigo */}
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
        <h2 className="text-sm font-semibold text-destructive">Excluir plataforma</h2>
        <p className="mb-3 mt-1 text-xs text-muted-foreground">
          Remove a plataforma permanentemente. Só é possível quando ela está <span className="font-medium text-foreground">oculta</span> e <span className="font-medium text-foreground">vazia</span> (sem estudantes nem simulados).
          {!vazia && <> Atualmente ela tem {p.estudantes} estudante(s) e {p.simulados} simulado(s).</>}
        </p>
        <Button variant="outline" onClick={excluir} disabled={pending || p.ativo || !vazia}
          className="border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground">
          {pending && op === 'excluir' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />} Excluir definitivamente
        </Button>
        {(p.ativo || !vazia) && (
          <p className="mt-2 text-[11px] text-muted-foreground">{p.ativo ? 'Oculte a plataforma primeiro. ' : ''}{!vazia ? 'Remova o conteúdo (estudantes/simulados) antes.' : ''}</p>
        )}
      </div>
    </div>
  )
}
