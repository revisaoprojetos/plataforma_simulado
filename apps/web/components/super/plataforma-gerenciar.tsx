'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Save, Loader2, Eye, EyeOff, ShieldCheck, Crown, Check, ExternalLink, Trash2, Users, GraduationCap, ClipboardList, Copy, Link2 } from 'lucide-react'
import { confirmar, pedirTexto } from '@/components/ui/confirm-dialog'
import { updateTenantAction, setTenantVisibilidadeAction, deleteTenantAction, type VisibilidadeModo } from '@/app/admin/tenants/actions'

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9-]/g, '')

// Os 3 estados de visibilidade (o gabarito da UI da Visualização).
const OPCOES_VIS: { modo: VisibilidadeModo; titulo: string; desc: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { modo: 'todos', titulo: 'Todos', desc: 'Alunos e administradores acessam normalmente.', icon: Eye },
  { modo: 'so_admin', titulo: 'Só admin (teste)', desc: 'Administradores da plataforma (e super-admins) entram. Alunos ficam bloqueados.', icon: ShieldCheck },
  { modo: 'so_super', titulo: 'Só super-admin', desc: 'Só super-admins globais entram — bloqueada para todos os demais, inclusive admins da plataforma.', icon: Crown },
  { modo: 'oculta', titulo: 'Oculta', desc: 'Ninguém acessa. Necessária para excluir a plataforma.', icon: EyeOff },
]

type Props = {
  id: string; nome: string; slug: string; plano: string; ativo: boolean; somenteAdmin: boolean; somenteSuper: boolean; dominio: string | null
  usuarios: number; estudantes: number; simulados: number
}

export function PlataformaGerenciar(p: Props) {
  const router = useRouter()
  const [nome, setNome] = useState(p.nome)
  const [slug, setSlug] = useState(p.slug)
  const [dominio, setDominio] = useState(p.dominio ?? '')
  const [plano, setPlano] = useState(p.plano || 'basico')
  const [pending, start] = useTransition()
  const [op, setOp] = useState<'salvar' | 'vis' | 'excluir' | null>(null)

  // URLs de acesso desta plataforma (baseadas no domínio próprio OU no subdomínio do slug SALVO).
  const [origem, setOrigem] = useState('')
  useEffect(() => {
    const { protocol, host } = window.location
    if (p.dominio) setOrigem(`${protocol}//${p.dominio}`)
    else { const partes = host.split('.'); const base = partes.length > 1 ? partes.slice(1).join('.') : host; setOrigem(`${protocol}//${p.slug}.${base}`) }
  }, [p.dominio, p.slug])
  const urlAluno = origem ? `${origem}/aluno/entrar` : ''
  const urlAdmin = origem ? `${origem}/login` : ''

  const sujo = nome.trim() !== p.nome || slug !== p.slug || plano !== (p.plano || 'basico') || dominio.trim() !== (p.dominio ?? '')
  const vazia = p.estudantes === 0 && p.simulados === 0
  const modo: VisibilidadeModo = p.ativo ? 'todos' : p.somenteSuper ? 'so_super' : p.somenteAdmin ? 'so_admin' : 'oculta'
  const bloqueiaExcluir = p.ativo || p.somenteAdmin || p.somenteSuper

  function salvar() {
    setOp('salvar'); start(async () => {
      const r = await updateTenantAction(p.id, { nome, slug, plano, dominio: dominio.trim() || null })
      if (r.ok) { toast.success('Plataforma atualizada!'); router.refresh() }
      else toast.error(r.error ?? 'Erro ao salvar')
      setOp(null)
    })
  }

  function definirVis(novo: VisibilidadeModo) {
    if (novo === modo) return
    setOp('vis'); start(async () => {
      const r = await setTenantVisibilidadeAction(p.id, novo)
      if (r.ok) { toast.success('Visibilidade atualizada.'); router.refresh() }
      else toast.error(r.error ?? 'Erro ao alterar a visibilidade')
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
      if (bloqueiaExcluir) { toast.error('Deixe a plataforma OCULTA antes de excluir.'); setOp(null); return }
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

  function LinkRow({ icon: Icon, rotulo, url }: { icon: React.ComponentType<{ className?: string }>; rotulo: string; url: string }) {
    async function copiar() { try { await navigator.clipboard.writeText(url); toast.success(`Link de ${rotulo.toLowerCase()} copiado!`) } catch { toast.error('Não foi possível copiar.') } }
    return (
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Icon className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-muted-foreground">{rotulo}</p>
          <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="w-full truncate bg-transparent text-sm font-medium outline-none" />
        </div>
        <button type="button" onClick={copiar} title="Copiar" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border text-muted-foreground transition hover:bg-muted hover:text-foreground"><Copy className="h-4 w-4" /></button>
        <a href={url || '#'} target="_blank" rel="noreferrer" title="Abrir" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border text-muted-foreground transition hover:bg-muted hover:text-foreground"><ExternalLink className="h-4 w-4" /></a>
      </div>
    )
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
        <p className="mb-4 text-xs text-muted-foreground">Nome exibido, subdomínio (slug), domínio próprio e plano.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="p-nome">Nome da plataforma</Label>
            <Input id="p-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Revisão PGE" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-slug">Subdomínio (slug)</Label>
            <Input id="p-slug" value={slug} onChange={(e) => setSlug(slugify(e.target.value))} placeholder="revisaopge" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="p-dominio">Domínio próprio (opcional)</Label>
            <Input id="p-dominio" value={dominio} onChange={(e) => setDominio(e.target.value)} placeholder="vocenadefensoria.vnd.com.br" />
            <p className="text-[11px] text-muted-foreground">Se preenchido, a plataforma abre neste endereço em vez de <span className="font-mono">{slug || 'slug'}.&lt;domínio-base&gt;</span>. Requer DNS + roteamento/TLS apontando para o servidor.</p>
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

      {/* Links de acesso (copiáveis) */}
      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Link2 className="h-4 w-4" /></span>
          <div>
            <h2 className="text-sm font-semibold">Links de acesso</h2>
            <p className="text-xs text-muted-foreground">Endereços de login exclusivos desta plataforma — copie e compartilhe.</p>
          </div>
        </div>
        <div className="space-y-2.5">
          <LinkRow icon={GraduationCap} rotulo="Alunos" url={urlAluno} />
          <LinkRow icon={ShieldCheck} rotulo="Administradores" url={urlAdmin} />
        </div>
      </div>

      {/* Visualização (3 estados) + Painel */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <h2 className="text-sm font-semibold">Visualização</h2>
          <p className="mb-3 mt-1 text-xs text-muted-foreground">Quem enxerga e acessa esta plataforma.</p>
          <div className="space-y-1.5">
            {OPCOES_VIS.map((o) => {
              const atual = o.modo === modo
              const carregando = pending && op === 'vis' && !atual
              return (
                <button key={o.modo} type="button" disabled={pending} onClick={() => definirVis(o.modo)}
                  className={cn('flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors',
                    atual ? 'border-primary bg-primary/5' : 'hover:border-primary/40 hover:bg-muted/50', pending && 'opacity-70')}>
                  <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', atual ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
                    {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <o.icon className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-sm font-medium">{o.titulo}{atual && <Check className="h-3.5 w-3.5 text-primary" />}</span>
                    <span className="block text-xs text-muted-foreground">{o.desc}</span>
                  </span>
                </button>
              )
            })}
          </div>
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
        <Button variant="outline" onClick={excluir} disabled={pending || bloqueiaExcluir || !vazia}
          className="border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground">
          {pending && op === 'excluir' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />} Excluir definitivamente
        </Button>
        {(bloqueiaExcluir || !vazia) && (
          <p className="mt-2 text-[11px] text-muted-foreground">{bloqueiaExcluir ? 'Deixe a plataforma oculta primeiro. ' : ''}{!vazia ? 'Remova o conteúdo (estudantes/simulados) antes.' : ''}</p>
        )}
      </div>
    </div>
  )
}
