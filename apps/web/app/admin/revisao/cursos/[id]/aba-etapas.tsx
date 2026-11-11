'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ExternalLink, FileText, Folder, BookOpen, Plus, Send, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { confirmar } from '@/components/ui/confirm-dialog'
import { VITRINE_LAYOUTS } from '@/lib/produtos/tipos'
import { BRIEFING_URL, ETAPAS_PAD_PADRAO, type EtapasData } from '@/lib/revisao/cursos-defs'
import type { GrupoOpcao, ProdutoDoCurso } from '@/lib/revisao/cursos'
import {
  adicionarProdutoCursoAction, alternarGrupoCursoAction, publicarCursoAction, removerProdutoCursoAction,
  renomearProdutoCursoAction, salvarEtapaAction,
} from '../actions'
import { Campo, Chip, Nota, Pill, ToggleRow, inputCls, useAcao } from '../ui-cursos'

interface Props {
  cursoId: string; nome: string; tipo: string; ativo: boolean; produtoPrincipalId: string | null
  etapas: EtapasData; etapasOk: boolean[]; etDone: number
  produtos: ProdutoDoCurso[]; grupos: GrupoOpcao[]; gruposMarcados: string[]; podeEditar: boolean
}

function Etapa({ i, ok, titulo, desc, children }: { i: number; ok: boolean; titulo: string; desc: string; children: React.ReactNode }) {
  return (
    <section className={cn('rounded-2xl border bg-card p-4 shadow-sm', ok ? 'border-emerald-500/60' : 'border-border')}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className={cn('grid size-8 shrink-0 place-items-center rounded-full text-sm font-extrabold', ok ? 'bg-emerald-600 text-white' : 'bg-muted text-muted-foreground')}>{ok ? '✓' : i + 1}</span>
          <div>
            <h2 className="text-sm font-semibold">Etapa {i + 1} · {titulo}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
          </div>
        </div>
        <Pill tom={ok ? 'ok' : 'warn'}>{ok ? 'Feito' : 'Pendente'}</Pill>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  )
}

const LinhaInfo = ({ cor, titulo, sub, icone }: { cor: 'primary' | 'gold'; titulo: string; sub: string; icone?: React.ReactNode }) => (
  <div className="flex items-center gap-3 rounded-xl border bg-background p-3">
    <span className={cn('h-8 w-1 shrink-0 rounded-full', cor === 'primary' ? 'bg-primary' : 'bg-amber-500')} />
    <span className="text-sm"><b className="flex items-center gap-1.5">{icone}{titulo}</b><small className="block text-xs text-muted-foreground">{sub}</small></span>
  </div>
)

export function AbaEtapas({ cursoId, nome, tipo, ativo, produtoPrincipalId, etapas, etapasOk, etDone, produtos, grupos, gruposMarcados, podeEditar }: Props) {
  const [pendente, executar] = useAcao()
  const E = etapas
  const pad = { ...ETAPAS_PAD_PADRAO, ...(E.pad ?? {}) }
  const [nomes, setNomes] = useState<Record<string, string>>(() => Object.fromEntries(produtos.map((p) => [p.id, p.nome])))
  const [wa, setWa] = useState(E.wa ?? '')
  const pronto5 = etapasOk.slice(0, 5).every(Boolean)
  const lock = !podeEditar || pendente
  const salvar = (patch: Partial<EtapasData>, msg?: string) => executar(() => salvarEtapaAction(cursoId, patch), msg)

  return (
    <div className="flex flex-col gap-4">
      <Nota>
        Um curso fica pronto para os alunos em <b>6 etapas, sempre nesta ordem</b>: pasta, produtos, configurações e grupos, trilha e vitrine, materiais iniciais e publicação. <b>{etDone} de 6 feitas.</b>
      </Nota>

      <Etapa i={0} ok={etapasOk[0]} titulo="Pasta do curso" desc="Tudo do curso fica numa pasta própria, com exatamente o nome do curso.">
        <LinhaInfo cor="primary" icone={<Folder className="size-4" />} titulo={nome} sub="Criada automaticamente com o nome do curso. Mudou o nome em Informações, a pasta muda junto." />
      </Etapa>

      <Etapa i={1} ok={etapasOk[1]} titulo="Produtos" desc="Crie de uma vez todos os produtos que o curso vai usar, seguindo o briefing.">
        <div className="flex flex-col gap-2">
          {produtos.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-xl border bg-background p-2.5">
              <span className="h-8 w-1 shrink-0 rounded-full bg-amber-500" />
              <input
                className={inputCls}
                value={nomes[p.id] ?? ''}
                aria-label="Nome do produto"
                disabled={lock}
                onChange={(e) => setNomes((n) => ({ ...n, [p.id]: e.target.value }))}
                onBlur={() => { const v = (nomes[p.id] ?? '').trim(); if (v && v !== p.nome) executar(() => renomearProdutoCursoAction(cursoId, p.id, v), 'Produto renomeado') }}
              />
              <Button
                variant="outline" size="icon" aria-label="Remover produto" disabled={lock || p.id === produtoPrincipalId}
                onClick={async () => { if (await confirmar({ titulo: 'Remover produto', mensagem: `Remover “${p.nome}” do curso?`, confirmar: 'Remover', destrutivo: true })) executar(() => removerProdutoCursoAction(cursoId, p.id), 'Produto removido') }}
              ><Trash2 className="size-4" /></Button>
            </div>
          ))}
          {!produtos.length && <p className="text-sm text-muted-foreground">Nenhum produto ainda.</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={lock} onClick={() => executar(() => adicionarProdutoCursoAction(cursoId), 'Produto criado')}><Plus className="size-3.5" />Adicionar produto</Button>
          <a href={BRIEFING_URL} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: 'outline', size: 'sm' })}><ExternalLink className="size-3.5" />Abrir o briefing</a>
        </div>
        <ToggleRow checked={!!E.prodOk} disabled={lock} onChange={(v) => salvar({ prodOk: v })}>Conferi o briefing: nenhum produto ficou de fora</ToggleRow>
      </Etapa>

      <Etapa i={2} ok={etapasOk[2]} titulo="Configurar os produtos e os grupos de acesso" desc="Todo produto novo já nasce com os padrões abaixo, sem ajuste manual produto por produto.">
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="px-3 py-2">Configuração</th><th className="px-3 py-2">Padrão</th><th className="px-3 py-2">Vale para</th></tr></thead>
            <tbody>
              {([['capa', 'Capa', 'Capa do curso, de Imagens e cores'], ['coment', 'Comentários', 'Desativados'], ['cert', 'Certificado', 'Desativado'], ['marca', 'Marca d’água', 'Ativada nos PDFs']] as const).map(([k, t, s]) => (
                <tr key={k} className="border-b last:border-0">
                  <td className="px-3 py-2.5"><b>{t}</b><span className="block text-xs text-muted-foreground">{s}</span></td>
                  <td className="px-3 py-2.5"><Switch checked={!!pad[k]} disabled={lock} aria-label={t} onCheckedChange={(v) => salvar({ pad: { ...pad, [k]: v } })} /></td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{produtos.length} produto{produtos.length === 1 ? '' : 's'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">Grupos de acesso</span>
          <div className="flex flex-wrap gap-2">
            {grupos.map((g) => {
              const on = gruposMarcados.includes(g.id)
              return <Chip key={g.id} on={on} disabled={lock} onClick={() => executar(() => alternarGrupoCursoAction(cursoId, g.id, !on))}>{g.nome}</Chip>
            })}
            {!grupos.length && <span className="text-sm text-muted-foreground">Nenhum grupo cadastrado. <Link href="/admin/grupos" className="font-semibold text-primary underline-offset-4 hover:underline">Criar grupo</Link></span>}
          </div>
          <small className="text-xs text-muted-foreground">Os grupos marcados recebem todos os produtos do curso.</small>
        </div>
        <ToggleRow checked={!!E.sprint} disabled={lock} onChange={(v) => salvar({ sprint: v })}><b>Curso Sprint Final</b>: todos os passaportes são vinculados automaticamente</ToggleRow>
        <ToggleRow checked={!!E.pastaPass} disabled={lock} onChange={(v) => salvar({ pastaPass: v })}><b>Pasta de passaportes</b>: vincula todos os passaportes ao produto de uma só vez</ToggleRow>
        <p className="text-xs text-muted-foreground">Qualquer uma das duas opções acima tira o vínculo manual de passaportes, um por um.</p>
        <ToggleRow checked={!!E.gOk} disabled={lock} onChange={(v) => salvar({ gOk: v })}>Conferi: todos os produtos ficaram vinculados ao grupo certo</ToggleRow>
      </Etapa>

      <Etapa i={3} ok={etapasOk[3]} titulo="Trilha e vitrine" desc="A trilha reúne os produtos e liga o curso à vitrine que o aluno vai ver.">
        <LinhaInfo cor="primary" titulo={`Trilha ${nome}`} sub={`Criada automaticamente com ${produtos.length === 1 ? 'o produto' : `os ${produtos.length} produtos`} da etapa 2`} />
        <Campo rotulo="Vincular à vitrine" dica="Formato de exibição do conteúdo do curso para o aluno (vale para todos os produtos do curso).">
          <select className={inputCls} disabled={lock} value={E.vitrine ?? ''} onChange={(e) => salvar({ vitrine: e.target.value })}>
            <option value="">Escolha a vitrine</option>
            {VITRINE_LAYOUTS.map((l) => <option key={l.v} value={l.v}>{l.label}</option>)}
          </select>
        </Campo>
      </Etapa>

      <Etapa i={4} ok={etapasOk[4]} titulo="Materiais iniciais" desc="Antes de liberar o acesso, deixe o curso pronto para a primeira semana.">
        <ToggleRow checked={!!E.sem1} disabled={lock} onChange={(v) => salvar({ sem1: v })}>Materiais da primeira semana incluídos (escolhidos da Biblioteca em Aulas e materiais)</ToggleRow>
        <ToggleRow checked={!!E.guia} disabled={lock} onChange={(v) => salvar({ guia: v })}>Guia do curso incluído</ToggleRow>
        <Campo rotulo="Grupo do WhatsApp">
          <input className={inputCls} type="url" value={wa} disabled={lock} placeholder="https://chat.whatsapp.com/..." onChange={(e) => setWa(e.target.value)} onBlur={() => { if (wa.trim() !== (E.wa ?? '')) salvar({ wa }, 'Link salvo') }} />
        </Campo>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/revisao/cursos/${cursoId}?aba=aulas`} className={buttonVariants({ variant: 'outline', size: 'sm' })}><BookOpen className="size-3.5" />Aulas e materiais</Link>
          <Link href="/admin/biblioteca" className={buttonVariants({ variant: 'outline', size: 'sm' })}><FileText className="size-3.5" />Abrir a Biblioteca</Link>
        </div>
      </Etapa>

      <Etapa i={5} ok={etapasOk[5]} titulo="Publicar na área de membros" desc="Com tudo pronto, suba a vitrine para a área de membros. A partir daí os alunos já acessam o curso.">
        {E.pub ? (
          <Nota tipo="ok">Publicado. O curso está na área de membros{ativo ? '' : ', mas desativado agora'}.</Nota>
        ) : (
          <>
            {!pronto5 && <Nota tipo="gold">Falta concluir: {etapasOk.slice(0, 5).map((v, i) => (v ? '' : `etapa ${i + 1}`)).filter(Boolean).join(', ')}.</Nota>}
            <div><Button disabled={!pronto5 || lock} onClick={() => executar(() => publicarCursoAction(cursoId), 'Vitrine publicada. Os alunos já acessam o curso')}><Send className="size-4" />Publicar a vitrine</Button></div>
          </>
        )}
      </Etapa>
    </div>
  )
}
