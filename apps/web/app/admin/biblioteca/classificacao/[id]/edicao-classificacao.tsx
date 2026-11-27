'use client'

// "VISÃO GERAL" (identidade + papel) e "EXIBIÇÃO" (formato de leitura, índice, legenda) da classificação — o formulário que
// antes vivia no painel lateral. Salva pela rota /classificacao/tipos (PATCH com `versao`: edição concorrente → 409). Cor só por token.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { PAPEIS_TIPO } from '@/lib/cronograma/tipos-conteudo-tipos'
import { TIPOS_INDICE, type ExibicaoClassificacao } from '@/lib/conteudo/classificacao/esquema'
import { TOKENS_COR } from '@/lib/conteudo/classificacao/gestao'
import type { LinhaTipoGestao } from '@/lib/conteudo/classificacao/gestao-server'
import { API_TIPOS, Bolinha, INPUT_CLS, ROTULO_INDICE, SELECT_CLS, api } from '../classificacao-comuns'

const Campo = ({ rotulo, children, dica }: { rotulo: string; children: React.ReactNode; dica?: string }) => (
  <label className="block space-y-1 text-sm font-medium">{rotulo}{children}{dica && <span className="block text-xs font-normal text-muted-foreground">{dica}</span>}</label>
)
const Cartao = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => (
  <section className="space-y-3 rounded-xl border bg-card p-4">
    <h3 className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">{titulo}</h3>
    {children}
  </section>
)

export function EdicaoClassificacao({ tipo, secao, podeEditar }: { tipo: LinhaTipoGestao; secao: 'visao' | 'exibicao'; podeEditar: boolean }) {
  const router = useRouter()
  const [f, setF] = useState({
    nome: tipo.nome, nomeAluno: tipo.nomeAluno ?? '', descricao: tipo.descricao ?? '', cor: tipo.cor, papel: tipo.papel as string,
    prioridade: tipo.prioridade, ordem: tipo.ordem, ativo: tipo.ativo, geraMeta: tipo.geraMeta,
  })
  const [ex, setEx] = useState<ExibicaoClassificacao>(tipo.exibicao)
  const [salvando, setSalvando] = useState(false)
  const bloqueado = !podeEditar
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }))
  const setInd = (patch: Partial<ExibicaoClassificacao['indice']>) => setEx((p) => ({ ...p, indice: { ...p.indice, ...patch } }))
  const corLegada = f.cor && !/^var\(--/.test(f.cor)

  async function salvar() {
    setSalvando(true)
    let patch: Record<string, unknown>
    if (secao === 'visao') {
      patch = { nome: f.nome.trim(), nomeAluno: f.nomeAluno.trim() || null, descricao: f.descricao.trim() || null, cor: f.cor, prioridade: f.prioridade, ordem: f.ordem, ativo: f.ativo }
      if (!tipo.sistema) { patch.papel = f.papel; if (f.papel === 'generico') patch.geraMeta = f.geraMeta }
    } else patch = { exibicao: ex }
    const r = await api('PATCH', API_TIPOS, { id: tipo.id, patch, versao: tipo.versao })
    setSalvando(false)
    if (!r.ok) return toast.error(r.data?.error || 'Não foi possível salvar.')
    toast.success('Classificação salva.'); router.refresh()
  }

  const rodape = !bloqueado && (
    <div className="flex justify-end">
      <Button onClick={salvar} disabled={salvando || !f.nome.trim()}>{salvando && <Loader2 className="animate-spin" />} Salvar</Button>
    </div>
  )

  if (secao === 'visao') {
    return (
      <div className="grid w-full gap-4 lg:grid-cols-2">
        <Cartao titulo="Identidade">
          <Campo rotulo="Nome"><input className={INPUT_CLS} value={f.nome} maxLength={60} disabled={bloqueado} onChange={(e) => set('nome', e.target.value)} /></Campo>
          <Campo rotulo="Nome que o aluno vê" dica="Vazio = usa o nome."><input className={INPUT_CLS} value={f.nomeAluno} maxLength={60} disabled={bloqueado} onChange={(e) => set('nomeAluno', e.target.value)} /></Campo>
          <Campo rotulo="Descrição"><textarea className={cn(INPUT_CLS, 'h-24 py-2')} value={f.descricao} maxLength={300} disabled={bloqueado} onChange={(e) => set('descricao', e.target.value)} /></Campo>
          <div>
            <span className="text-sm font-medium">Cor</span>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <button type="button" disabled={bloqueado} onClick={() => set('cor', null)} aria-pressed={!f.cor} title="Sem cor"
                className={cn('flex h-8 items-center rounded-lg border px-2 text-xs text-muted-foreground', !f.cor && 'ring-2 ring-primary ring-offset-2 ring-offset-background')}>Auto</button>
              {TOKENS_COR.map((t) => {
                const v = `var(--${t})`
                return <button key={t} type="button" disabled={bloqueado} onClick={() => set('cor', v)} title={t} aria-label={t} aria-pressed={f.cor === v}
                  className={cn('h-8 w-8 rounded-lg border transition-transform hover:scale-105', f.cor === v && 'ring-2 ring-primary ring-offset-2 ring-offset-background')} style={{ background: v }} />
              })}
              {corLegada && <span className="inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs text-muted-foreground" title="Cor legada, mantida até você escolher um token"><Bolinha cor={f.cor} />legada</span>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Prioridade" dica="Menor = decide primeiro."><input type="number" className={INPUT_CLS} value={f.prioridade} disabled={bloqueado} onChange={(e) => set('prioridade', Math.trunc(Number(e.target.value) || 0))} /></Campo>
            <Campo rotulo="Ordem" dica="Posição nas listas."><input type="number" className={INPUT_CLS} value={f.ordem} disabled={bloqueado} onChange={(e) => set('ordem', Math.trunc(Number(e.target.value) || 0))} /></Campo>
          </div>
          <div className="flex items-center justify-between rounded-xl border px-3 py-2"><span className="text-sm font-medium">Ativa<span className="block text-xs font-normal text-muted-foreground">Arquivada some das escolhas, sem apagar nada.</span></span>
            <Switch checked={f.ativo} disabled={bloqueado} onCheckedChange={(v) => set('ativo', v)} /></div>
        </Cartao>

        <div className="space-y-4">
          <Cartao titulo="Papel">
            <Campo rotulo="O que esta classificação faz" dica={PAPEIS_TIPO.find((p) => p.v === f.papel)?.desc}>
              <select className={cn(SELECT_CLS, 'w-full')} value={f.papel} disabled={bloqueado || tipo.sistema} onChange={(e) => set('papel', e.target.value)}>
                {PAPEIS_TIPO.map((p) => <option key={p.v} value={p.v}>{p.r}</option>)}
              </select>
              {tipo.sistema && <span className="block text-xs font-normal text-muted-foreground">O papel do modelo-base é fixo (duplique para criar uma variação).</span>}
            </Campo>
            {!tipo.sistema && f.papel === 'generico' && (
              <div className="flex items-center justify-between rounded-xl border px-3 py-2"><span className="text-sm font-medium">Gera meta própria<span className="block text-xs font-normal text-muted-foreground">Vale para planos gerados depois.</span></span>
                <Switch checked={f.geraMeta} disabled={bloqueado} onCheckedChange={(v) => set('geraMeta', v)} /></div>
            )}
          </Cartao>
          {rodape}
        </div>
      </div>
    )
  }

  // ───── Exibição ─────
  const niveis = ex.indice.tipos.map((t) => ROTULO_INDICE[t]).join(' › ')
  return (
    <div className="grid w-full gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <Cartao titulo="Leitura">
          <Campo rotulo="Formato de leitura" dica="Identificador do formato (ex.: texto). Vazio = padrão do leitor.">
            <input className={INPUT_CLS} value={ex.formato_leitura ?? ''} maxLength={40} disabled={bloqueado} placeholder="padrão" onChange={(e) => setEx((p) => ({ ...p, formato_leitura: e.target.value.trim().toLowerCase() || null }))} />
          </Campo>
          <div className="flex items-center justify-between rounded-xl border px-3 py-2"><span className="text-sm font-medium">Mostrar legenda de grifos</span>
            <Switch checked={ex.legenda} disabled={bloqueado} onCheckedChange={(v) => setEx((p) => ({ ...p, legenda: v }))} /></div>
        </Cartao>
        <Cartao titulo="Índice">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {TIPOS_INDICE.map((t) => (
              <label key={t} className="inline-flex items-center gap-1.5 text-[13px]">
                <input type="checkbox" className="accent-[var(--primary)]" disabled={bloqueado} checked={ex.indice.tipos.includes(t)}
                  onChange={(e) => setInd({ tipos: e.target.checked ? [...ex.indice.tipos, t] : ex.indice.tipos.filter((x) => x !== t) })} />{ROTULO_INDICE[t]}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-2 text-[13px]">Níveis
              <select className={cn(SELECT_CLS, 'h-9 w-20')} disabled={bloqueado} value={ex.indice.nivel_max} onChange={(e) => setInd({ nivel_max: Number(e.target.value) })}>
                {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
              </select></label>
            <label className="inline-flex items-center gap-1.5 text-[13px]"><input type="checkbox" className="accent-[var(--primary)]" disabled={bloqueado} checked={ex.indice.artigos_agrupados} onChange={(e) => setInd({ artigos_agrupados: e.target.checked })} />Agrupar artigos</label>
            <label className="inline-flex items-center gap-1.5 text-[13px]"><input type="checkbox" className="accent-[var(--primary)]" disabled={bloqueado} checked={ex.indice.incluir_caixas} onChange={(e) => setInd({ incluir_caixas: e.target.checked })} />Incluir caixas (STF/STJ)</label>
          </div>
        </Cartao>
        {rodape}
      </div>

      <Cartao titulo="Pré-visualização (o que o aluno vê)">
        <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
          <div className="flex items-center gap-2"><Bolinha cor={tipo.cor} /><span className="text-[15px] font-semibold">{tipo.nomeAluno || tipo.nome}</span></div>
          <dl className="space-y-1.5 text-[13px]">
            <div className="flex gap-2"><dt className="w-36 shrink-0 text-muted-foreground">Formato de leitura</dt><dd>{ex.formato_leitura ?? 'padrão do leitor'}</dd></div>
            <div className="flex gap-2"><dt className="w-36 shrink-0 text-muted-foreground">Legenda de grifos</dt><dd>{ex.legenda ? 'visível acima do texto' : 'oculta'}</dd></div>
            <div className="flex gap-2"><dt className="w-36 shrink-0 text-muted-foreground">Índice</dt>
              <dd>{ex.indice.tipos.length ? <>{niveis}<span className="block text-xs text-muted-foreground">até {ex.indice.nivel_max} nível(is){ex.indice.artigos_agrupados ? ' · artigos agrupados' : ''}{ex.indice.incluir_caixas ? ' · com caixas STF/STJ' : ''}</span></> : 'sem índice'}</dd></div>
          </dl>
        </div>
        <p className="text-xs text-muted-foreground">Prévia simples do que muda no leitor. O salvamento vale para todos os documentos desta classificação.</p>
      </Cartao>
    </div>
  )
}
