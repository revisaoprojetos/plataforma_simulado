'use client'

import { useState, useTransition } from 'react'
import { ArrowDown, ArrowUp, Eye, EyeOff, Info, Pencil, Plus, Tag, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { SecaoHeader } from '@/components/admin/secao-header'
import { AlertBox } from '@/components/ui/alert-box'
import { confirmar } from '@/components/ui/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  alternarAtivoTipo,
  atualizarTipo,
  criarTipo,
  excluirTipo,
  reordenarTipos,
  type EntradaTipo,
  type TipoComUso,
} from '../tipos-actions'

/**
 * Cada flag é uma regra da especificação. O texto abaixo é o que a equipe lê ao decidir —
 * sem ele, "prefixo_aula" não significa nada para quem não conhece o gerador.
 */
const COMPORTAMENTOS: { chave: keyof EntradaTipo; titulo: string; ajuda: string }[] = [
  {
    chave: 'mostra_links',
    titulo: 'Mostra os links de questões',
    ajuda: 'Exibe os links das plataformas cadastradas para a aula. Hoje só "Resolução de Questões" faz isso.',
  },
  {
    chave: 'prefixo_aula',
    titulo: 'Prefixo "Aula NN -" no conteúdo',
    ajuda: 'O conteúdo aparece como "Aula 01 - Princípios fundamentais". Números de um dígito ganham zero à esquerda.',
  },
  {
    chave: 'aula_no_titulo',
    titulo: 'Exibe só "Disciplina: Aula N"',
    ajuda: 'Ignora o conteúdo cadastrado e mostra apenas a aula. É o comportamento das metas de questões.',
  },
  {
    chave: 'quebra_conteudo',
    titulo: 'Quebra o conteúdo em duas linhas',
    ajuda: 'Separa título e complemento no primeiro "Art." ou no trecho entre parênteses ao final. É como o Legproc se comporta.',
  },
  {
    chave: 'conta_atividade',
    titulo: 'Conta como atividade',
    ajuda: 'Entra no número de "Atividades" que o aluno vê no topo. Simulado e Atividade Extra ficam de fora.',
  },
  {
    chave: 'destaque_docx',
    titulo: 'Linha mais alta no documento',
    ajuda: 'No DOCX, a linha deste tipo fica com o dobro da altura. Hoje só o PDFULL usa.',
  },
  {
    chave: 'sempre_no_docx',
    titulo: 'Aparece em todas as semanas do documento',
    ajuda: 'Ligado, a linha existe em todas as páginas mesmo vazia — o documento fica com estrutura uniforme. Desligado, só aparece na semana em que houver meta.',
  },
]

const vazio = (): EntradaTipo => ({
  nome: '',
  rotulo_docx: '',
  cor: null,
  mostra_links: false,
  prefixo_aula: true,
  aula_no_titulo: false,
  quebra_conteudo: false,
  conta_atividade: true,
  destaque_docx: false,
  sempre_no_docx: true,
})

export function TiposClient({ inicial }: { inicial: TipoComUso[] }) {
  const [itens, setItens] = useState(inicial)
  const [pendente, iniciar] = useTransition()
  const [aberto, setAberto] = useState(false)
  const [editando, setEditando] = useState<string | null>(null)
  const [form, setForm] = useState<EntradaTipo>(vazio())

  function abrirNovo() {
    setEditando(null)
    setForm(vazio())
    setAberto(true)
  }

  function abrirEdicao(t: TipoComUso) {
    setEditando(t.id)
    setForm({
      nome: t.nome,
      rotulo_docx: t.rotulo_docx,
      cor: t.cor,
      mostra_links: t.mostra_links,
      prefixo_aula: t.prefixo_aula,
      aula_no_titulo: t.aula_no_titulo,
      quebra_conteudo: t.quebra_conteudo,
      conta_atividade: t.conta_atividade,
      destaque_docx: t.destaque_docx,
      sempre_no_docx: t.sempre_no_docx,
    })
    setAberto(true)
  }

  function salvar() {
    iniciar(async () => {
      const r = editando ? await atualizarTipo(editando, form) : await criarTipo(form)
      if (!r.ok) return toast.error(r.error ?? 'Não foi possível salvar.')
      toast.success(editando ? 'Tipo atualizado' : 'Tipo criado')
      setAberto(false)
      if (editando) {
        setItens((xs) => xs.map((t) => (t.id === editando ? { ...t, ...form } : t)))
      } else {
        setItens((xs) => [
          ...xs,
          { ...(form as any), id: (r as any).id, slug: (r as any).slug, ordem: xs.length, ativo: true, usos: 0 },
        ])
      }
    })
  }

  function mover(i: number, direcao: -1 | 1) {
    const j = i + direcao
    if (j < 0 || j >= itens.length) return
    const novos = [...itens]
    ;[novos[i], novos[j]] = [novos[j], novos[i]]
    setItens(novos)
    iniciar(async () => {
      const r = await reordenarTipos(novos.map((t) => t.id))
      if (!r.ok) toast.error(r.error ?? 'Não foi possível reordenar.')
    })
  }

  function alternarAtivo(t: TipoComUso) {
    iniciar(async () => {
      const alvo = !t.ativo
      const r = await alternarAtivoTipo(t.id, alvo)
      if (!r.ok) return toast.error(r.error ?? 'Não foi possível alterar.')
      toast.success(alvo ? 'Tipo reativado' : 'Tipo desativado')
      setItens((xs) => xs.map((x) => (x.id === t.id ? { ...x, ativo: alvo } : x)))
    })
  }

  function remover(t: TipoComUso) {
    iniciar(async () => {
      if (t.usos > 0) {
        return toast.error(`"${t.nome}" está em ${t.usos} meta(s). Desative-o em vez de excluir.`)
      }
      const sim = await confirmar({ titulo: 'Excluir tipo', mensagem: `Excluir o tipo "${t.nome}"?`, destrutivo: true })
      if (!sim) return
      const r = await excluirTipo(t.id)
      if (!r.ok) return toast.error(r.error ?? 'Não foi possível excluir.')
      toast.success('Tipo excluído')
      setItens((xs) => xs.filter((x) => x.id !== t.id))
    })
  }

  /** Resumo legível do comportamento, para a lista não virar uma parede de ícones. */
  function resumo(t: TipoComUso): string[] {
    const xs: string[] = []
    if (t.mostra_links) xs.push('links de questões')
    if (t.aula_no_titulo) xs.push('só a aula no título')
    else if (t.prefixo_aula) xs.push('prefixo de aula')
    if (t.quebra_conteudo) xs.push('quebra o conteúdo')
    if (!t.conta_atividade) xs.push('não conta como atividade')
    if (t.destaque_docx) xs.push('linha alta no DOCX')
    if (!t.sempre_no_docx) xs.push('só na semana em que houver')
    return xs
  }

  return (
    <>
      <AlertBox variante="info" titulo="Estes tipos controlam o comportamento do gerador" icon={Info}>
        <p className="text-sm">
          A <strong>ordem</strong> aqui é a ordem em que as metas aparecem dentro de cada dia. As demais opções
          decidem como o conteúdo é escrito, se os links aparecem e o que entra na contagem de atividades.
        </p>
      </AlertBox>

      <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
        <SecaoHeader
          icon={Tag}
          titulo="Tipos de meta"
          subtitulo={`${itens.filter((t) => t.ativo).length} ativo(s) de ${itens.length}`}
          acao={
            <Button size="sm" onClick={abrirNovo}>
              <Plus className="mr-1 h-4 w-4" />
              Novo tipo
            </Button>
          }
        />

        <div className="divide-y">
          {itens.map((t, i) => (
            <div key={t.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${t.ativo ? '' : 'opacity-60'}`}>
              <div className="flex shrink-0 flex-col">
                <button onClick={() => mover(i, -1)} disabled={pendente || i === 0} className="disabled:opacity-30">
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => mover(i, 1)} disabled={pendente || i === itens.length - 1} className="disabled:opacity-30">
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{t.nome}</span>
                  <Badge variant="outline" className="font-mono text-xs">
                    {t.slug}
                  </Badge>
                  {!t.ativo && <Badge variant="secondary">Inativo</Badge>}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t.usos === 0 ? 'nenhuma meta usa' : `${t.usos.toLocaleString('pt-BR')} meta(s)`}
                  {resumo(t).length > 0 && ` · ${resumo(t).join(' · ')}`}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => alternarAtivo(t)} disabled={pendente} title={t.ativo ? 'Desativar' : 'Reativar'}>
                  {t.ativo ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => abrirEdicao(t)} disabled={pendente}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remover(t)} disabled={pendente}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[85vh] overflow-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar tipo de meta' : 'Novo tipo de meta'}</DialogTitle>
            <DialogDescription>
              As opções abaixo decidem como o gerador trata as metas deste tipo — na tela e no documento.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nome na tela</Label>
                <Input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} placeholder="PDFULL + Videoaula" />
              </div>
              <div className="space-y-1.5">
                <Label>Nome no documento</Label>
                <Input
                  value={form.rotulo_docx}
                  onChange={(e) => setForm((f) => ({ ...f, rotulo_docx: e.target.value }))}
                  placeholder="PDFULL OU VIDEOAULA"
                />
              </div>
            </div>

            {editando && (
              <p className="text-xs text-muted-foreground">
                Renomear é seguro: a chave interna não muda, então as metas existentes continuam ligadas a
                este tipo.
              </p>
            )}

            <div className="space-y-3 rounded-lg border p-3">
              <p className="text-sm font-medium">Comportamento</p>
              {COMPORTAMENTOS.map((c) => (
                <div key={c.chave} className="flex items-start gap-3">
                  <Switch
                    checked={form[c.chave] as boolean}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, [c.chave]: v }))}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{c.titulo}</p>
                    <p className="text-xs text-muted-foreground">{c.ajuda}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setAberto(false)} disabled={pendente}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={pendente}>
              {pendente ? 'Salvando…' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
