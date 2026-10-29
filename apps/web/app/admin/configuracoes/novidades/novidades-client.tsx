'use client'

// UI de gestão das NOVIDADES ("O que mudou") — tabela + Dialog de criar/editar. Chama as server
// actions (actions.ts) com guard + audit. Datas em horário de Brasília via @/lib/brt. Tolerante à
// migração ausente: a action devolve erro claro ("Rode a migração 20261028000000"), exibido em toast.

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Star, Newspaper, ExternalLink } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { AlertBox } from '@/components/ui/alert-box'
import { confirmar } from '@/components/ui/confirm-dialog'
import { formatBrt, isoParaBrtLocal, brtLocalParaIso, BRT_LABEL } from '@/lib/brt'
import { CATEGORIAS, CAT_LABEL, type CategoriaNovidade } from '@/lib/novidades/tipos'
import {
  criarNovidadeAction, atualizarNovidadeAction, removerNovidadeAction, alternarNovidadeAtivaAction,
  type NovidadeAdmin, type NovidadeInput,
} from './actions'

export type { NovidadeAdmin }

const CAT_OPCOES = CATEGORIAS.length ? CATEGORIAS : [{ value: 'outro' as CategoriaNovidade, label: 'Novidade' }]

type FormState = {
  categoria: CategoriaNovidade
  titulo: string
  descricao: string
  destaque: boolean
  cover_url: string
  cta_label: string
  cta_url: string
  cta2_label: string
  cta2_url: string
  publicadoLocal: string // datetime-local (horário de Brasília)
  ativo: boolean
}

function formVazio(): FormState {
  return {
    categoria: (CAT_OPCOES[0].value),
    titulo: '', descricao: '', destaque: false, cover_url: '',
    cta_label: '', cta_url: '', cta2_label: '', cta2_url: '',
    publicadoLocal: '', ativo: true,
  }
}

function formDe(n: NovidadeAdmin): FormState {
  return {
    categoria: n.categoria,
    titulo: n.titulo ?? '',
    descricao: n.descricao ?? '',
    destaque: !!n.destaque,
    cover_url: n.cover_url ?? '',
    cta_label: n.cta_label ?? '',
    cta_url: n.cta_url ?? '',
    cta2_label: n.cta2_label ?? '',
    cta2_url: n.cta2_url ?? '',
    publicadoLocal: isoParaBrtLocal(n.publicado_em),
    ativo: n.ativo,
  }
}

function paraInput(f: FormState): NovidadeInput {
  const limpar = (s: string) => (s.trim() ? s.trim() : null)
  return {
    categoria: f.categoria,
    titulo: f.titulo.trim(),
    descricao: limpar(f.descricao),
    destaque: f.destaque,
    coverUrl: limpar(f.cover_url),
    ctaLabel: limpar(f.cta_label),
    ctaUrl: limpar(f.cta_url),
    cta2Label: limpar(f.cta2_label),
    cta2Url: limpar(f.cta2_url),
    publicadoEm: f.publicadoLocal ? brtLocalParaIso(f.publicadoLocal) : null,
    ativo: f.ativo,
  }
}

export function NovidadesClient({ itens, aviso, podeEditar }: { itens: NovidadeAdmin[]; aviso?: string; podeEditar: boolean }) {
  const [editando, setEditando] = useState<NovidadeAdmin | null>(null)
  const [criando, setCriando] = useState(false)
  const [form, setForm] = useState<FormState>(formVazio)
  const [pending, startTransition] = useTransition()
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))

  const abrirCriar = () => { setForm(formVazio()); setCriando(true) }
  const abrirEditar = (n: NovidadeAdmin) => { setEditando(n); setForm(formDe(n)) }
  const fechar = () => { setCriando(false); setEditando(null) }

  function salvar() {
    if (!form.titulo.trim()) { toast.error('Informe o título.'); return }
    const input = paraInput(form)
    startTransition(async () => {
      const r = editando
        ? await atualizarNovidadeAction(editando.id, input)
        : await criarNovidadeAction(input)
      if (r.ok) { toast.success(editando ? 'Novidade atualizada.' : 'Novidade criada.'); fechar() }
      else toast.error(r.error || 'Não foi possível salvar.')
    })
  }

  function excluir(n: NovidadeAdmin) {
    startTransition(async () => {
      if (!(await confirmar({ mensagem: `Excluir a novidade "${n.titulo}"? Esta ação não pode ser desfeita.`, destrutivo: true }))) return
      const r = await removerNovidadeAction(n.id)
      if (r.ok) toast.success('Novidade excluída.')
      else toast.error(r.error || 'Não foi possível excluir.')
    })
  }

  function alternarAtiva(n: NovidadeAdmin, ativo: boolean) {
    startTransition(async () => {
      const r = await alternarNovidadeAtivaAction(n.id, ativo)
      if (r.ok) toast.success(ativo ? 'Novidade ativada.' : 'Novidade ocultada.')
      else toast.error(r.error || 'Não foi possível atualizar.')
    })
  }

  const dialogAberto = criando || !!editando

  return (
    <div className="space-y-4">
      {aviso && <AlertBox variante="aviso">{aviso}</AlertBox>}

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {itens.length > 0 ? `${itens.length} novidade${itens.length > 1 ? 's' : ''}` : 'Nenhuma novidade cadastrada.'}
        </p>
        {podeEditar && (
          <Button onClick={abrirCriar} disabled={pending}>
            <Plus className="h-4 w-4" /> Nova novidade
          </Button>
        )}
      </div>

      {itens.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card py-14 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground"><Newspaper className="h-6 w-6" /></span>
          <div>
            <p className="font-medium">Nenhuma novidade ainda</p>
            <p className="text-sm text-muted-foreground">Publique anúncios e mudanças para aparecerem no início do aluno.</p>
          </div>
          {podeEditar && <Button variant="outline" onClick={abrirCriar}><Plus className="h-4 w-4" /> Criar a primeira</Button>}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                <th className="px-4 py-2.5">Categoria</th>
                <th className="px-4 py-2.5">Título</th>
                <th className="px-4 py-2.5">Destaque</th>
                <th className="px-4 py-2.5">Publicado em</th>
                <th className="px-4 py-2.5">Ativo</th>
                <th className="px-4 py-2.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((n) => (
                <tr key={n.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Badge variant="secondary">{CAT_LABEL[n.categoria] ?? n.categoria}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-[28rem]">
                      <p className="truncate font-medium">{n.titulo}</p>
                      {n.descricao && <p className="truncate text-xs text-muted-foreground">{n.descricao}</p>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {n.destaque
                      ? <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400"><Star className="h-3.5 w-3.5 fill-current" /> Sim</span>
                      : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{formatBrt(n.publicado_em) ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Switch checked={n.ativo} onCheckedChange={(v) => alternarAtiva(n, v)} disabled={!podeEditar || pending} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" onClick={() => abrirEditar(n)} disabled={!podeEditar} aria-label="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => excluir(n)} disabled={!podeEditar || pending} aria-label="Excluir"
                        className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogAberto} onOpenChange={(o) => { if (!o) fechar() }}>
        <DialogContent className="p-0 sm:max-w-lg">
          <div className="max-h-[80vh] overflow-y-auto p-4">
            <DialogHeader>
              <DialogTitle>{editando ? 'Editar novidade' : 'Nova novidade'}</DialogTitle>
              <DialogDescription>Aparece no card &quot;O que mudou&quot; do início do aluno.</DialogDescription>
            </DialogHeader>

            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Categoria</Label>
                  <Select value={form.categoria} onValueChange={(v) => v && set('categoria', v as CategoriaNovidade)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CAT_OPCOES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="nov-pub">Data de publicação</Label>
                  <Input id="nov-pub" type="datetime-local" value={form.publicadoLocal} onChange={(e) => set('publicadoLocal', e.target.value)} />
                  <p className="text-[11px] text-muted-foreground">{BRT_LABEL}. Vazio = agora.</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="nov-titulo">Título</Label>
                <Input id="nov-titulo" value={form.titulo} onChange={(e) => set('titulo', e.target.value)} placeholder="Ex.: Novo simulado disponível" />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="nov-desc">Descrição</Label>
                <Textarea id="nov-desc" rows={3} value={form.descricao} onChange={(e) => set('descricao', e.target.value)} placeholder="O que mudou, em poucas linhas." />
              </div>

              <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2.5">
                <div>
                  <Label className="flex items-center gap-1.5"><Star className="h-3.5 w-3.5" /> Destaque</Label>
                  <p className="text-[11px] text-muted-foreground">Exibe capa e botões em destaque no card.</p>
                </div>
                <Switch checked={form.destaque} onCheckedChange={(v) => set('destaque', v)} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="nov-cover">URL da capa</Label>
                <Input id="nov-cover" type="url" inputMode="url" value={form.cover_url} onChange={(e) => set('cover_url', e.target.value)} placeholder="https://..." />
              </div>

              <div className="space-y-2 rounded-lg border px-3 py-3">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><ExternalLink className="h-3.5 w-3.5" /> Botão principal (CTA)</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="nov-cta-label" className="text-xs">Texto</Label>
                    <Input id="nov-cta-label" value={form.cta_label} onChange={(e) => set('cta_label', e.target.value)} placeholder="Ex.: Ver agora" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="nov-cta-url" className="text-xs">Link</Label>
                    <Input id="nov-cta-url" type="url" inputMode="url" value={form.cta_url} onChange={(e) => set('cta_url', e.target.value)} placeholder="https://..." />
                  </div>
                </div>
              </div>

              <div className="space-y-2 rounded-lg border px-3 py-3">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><ExternalLink className="h-3.5 w-3.5" /> Botão secundário (opcional)</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="nov-cta2-label" className="text-xs">Texto</Label>
                    <Input id="nov-cta2-label" value={form.cta2_label} onChange={(e) => set('cta2_label', e.target.value)} placeholder="Ex.: Saiba mais" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="nov-cta2-url" className="text-xs">Link</Label>
                    <Input id="nov-cta2-url" type="url" inputMode="url" value={form.cta2_url} onChange={(e) => set('cta2_url', e.target.value)} placeholder="https://..." />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2.5">
                <div>
                  <Label>Ativa</Label>
                  <p className="text-[11px] text-muted-foreground">Quando desligada, não aparece para os alunos.</p>
                </div>
                <Switch checked={form.ativo} onCheckedChange={(v) => set('ativo', v)} />
              </div>
            </div>

            <DialogFooter className="mx-0 mb-0 mt-6 rounded-none">
              <Button variant="outline" onClick={fechar} disabled={pending}>Cancelar</Button>
              <Button onClick={salvar} disabled={pending}>{pending ? 'Salvando...' : editando ? 'Salvar' : 'Criar'}</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
