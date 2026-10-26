'use client'
// 03b §2.9 — Configurações. Publicação (visível/agendar/expira) + Proteção por tipo (01 §6) + bloco do
// tipo (configBloco) + versões/avisos/Arquivar. Toggles de proteção/visibilidade PERSISTEM (colunas reais
// + auditoria). As preferências específicas do tipo (formato de download, OCR, qualidade…) ainda não têm
// coluna → ficam como estado local com aviso honesto de que serão persistidas quando o pipeline existir.

import { useState } from 'react'
import { toast } from 'sonner'
import { Save, Droplets, Printer, Download, Eye, Highlighter, Archive, Loader2 } from 'lucide-react'
import type { GestaoBase, ProtecaoConteudo } from '@/app/admin/biblioteca/gestao-actions'
import { salvarProtecaoConteudo, definirVisibilidadeConteudo, definirAgendamentoConteudo, arquivarConteudo } from '@/app/admin/biblioteca/gestao-actions'
import type { GestaoTipo, ConfigRow } from '@/lib/biblioteca/gestao-tipos'
import { Secao } from './ui'
import { isoParaBrtLocal, brtLocalParaIso } from '@/lib/brt'
import { confirmar } from '@/components/ui/confirm-dialog'

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition disabled:opacity-40 ${on ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  )
}
function LinhaSwitch({ Ic, titulo, sub, on, onChange, disabled }: { Ic?: typeof Eye; titulo: string; sub?: string; on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      {Ic && <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><Ic className="h-4 w-4" /></span>}
      <div className="min-w-0 flex-1"><div className="text-sm font-medium leading-tight text-foreground">{titulo}</div>{sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}</div>
      <Toggle on={on} onChange={onChange} disabled={disabled} />
    </div>
  )
}

export function AbaConfiguracoes({ base, tipo }: { base: GestaoBase; tipo: GestaoTipo }) {
  const [prot, setProt] = useState<ProtecaoConteudo>(base.protecao)
  const [visivel, setVisivel] = useState(!base.oculto)
  const [de, setDe] = useState(isoParaBrtLocal(base.liberadoDe))
  const [ate, setAte] = useState(isoParaBrtLocal(base.liberadoAte))
  const [salvando, setSalvando] = useState(false)
  // preferências específicas do tipo (sem coluna ainda → estado local)
  const [tipoCfg, setTipoCfg] = useState<Record<string, boolean | string>>(() => {
    const o: Record<string, boolean | string> = {}
    for (const r of tipo.configBloco.rows) if (r.padrao !== undefined) o[r.id] = r.padrao
    return o
  })
  const linkExterno = base.fonteMidia?.tipo === 'link'

  async function toggleProt(k: keyof ProtecaoConteudo, v: boolean) {
    setProt((p) => ({ ...p, [k]: v }))
    const r = await salvarProtecaoConteudo(base.id, { [k]: v })
    if (!r.ok) { toast.error(r.error || 'Falha ao salvar.'); setProt((p) => ({ ...p, [k]: !v })) }
  }
  async function toggleVisivel(v: boolean) {
    setVisivel(v)
    const r = await definirVisibilidadeConteudo(base.id, v)
    if (!r.ok) { toast.error(r.error || 'Falha ao salvar.'); setVisivel(!v) }
  }
  async function salvarAgendamento() {
    setSalvando(true)
    const r = await definirAgendamentoConteudo(base.id, brtLocalParaIso(de), brtLocalParaIso(ate))
    setSalvando(false)
    if (!r.ok) return toast.error(r.error || 'Falha ao salvar.')
    toast.success('Configurações salvas agora.')
  }
  async function arquivar() {
    if (!(await confirmar({ titulo: 'Arquivar conteúdo?', mensagem: 'Some da biblioteca dos alunos, mantém histórico e grifos.', confirmar: 'Arquivar', destrutivo: true }))) return
    const r = await arquivarConteudo(base.id)
    if (!r.ok) return toast.error(r.error || 'Falha ao arquivar.')
    toast.success('Conteúdo arquivado.')
  }

  // proteções por tipo (01 §6) — apresentadas como as colunas reais que temos (marca d’água / impressão /
  // download / grifar). Com link externo, as de arquivo ficam indisponíveis.
  return (
    <div className="space-y-5">
      <Secao titulo="Publicação">
        <LinhaSwitch Ic={Eye} titulo="Visível para os alunos" sub="Desligar oculta para todos, inclusive nos pacotes" on={visivel} onChange={toggleVisivel} />
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-muted-foreground">Liberar a partir de<input type="datetime-local" value={de} onChange={(e) => setDe(e.target.value)} className="mt-1 h-9 w-full rounded-lg border bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/30" /></label>
          <label className="text-xs text-muted-foreground">Expira em (depois só quem está em pacote ativo)<input type="datetime-local" value={ate} onChange={(e) => setAte(e.target.value)} className="mt-1 h-9 w-full rounded-lg border bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/30" /></label>
        </div>
      </Secao>

      <Secao titulo="Proteção">
        {linkExterno && <p className="mb-2 rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">Com link externo, proteções de arquivo ficam indisponíveis — importe o {base.kind === 'audio' ? 'áudio' : 'vídeo'} para usar.</p>}
        <div className="divide-y rounded-xl border px-3">
          <LinhaSwitch Ic={Droplets} titulo="Marca d’água com nome e CPF" sub="No leitor e no download" on={prot.marca_dagua} onChange={(v) => toggleProt('marca_dagua', v)} disabled={linkExterno} />
          <LinhaSwitch Ic={Printer} titulo="Permitir impressão" sub="Desligado = impressão bloqueada" on={prot.pode_imprimir} onChange={(v) => toggleProt('pode_imprimir', v)} disabled={linkExterno} />
          <LinhaSwitch Ic={Download} titulo="Permitir download" sub="Gera arquivo com marca d’água e conta no limite do aluno" on={prot.pode_baixar} onChange={(v) => toggleProt('pode_baixar', v)} disabled={linkExterno} />
          <LinhaSwitch Ic={Highlighter} titulo="Grifar e anotar" sub="Marcações no Caderno do aluno" on={prot.pode_grifar} onChange={(v) => toggleProt('pode_grifar', v)} />
          <LinhaSwitch Ic={Eye} titulo="Ler/ver na plataforma" sub="Acesso ao visualizador do aluno" on={prot.pode_ler_plataforma} onChange={(v) => toggleProt('pode_ler_plataforma', v)} />
        </div>
        <div className="mt-2 text-[11px] text-muted-foreground">{tipo.rotuloLimite}: controle fino de limite depende do pipeline de downloads (em construção).</div>
      </Secao>

      <Secao titulo={tipo.configBloco.titulo}>
        <p className="mb-2 text-xs text-muted-foreground">{tipo.configBloco.sub}</p>
        <div className="divide-y rounded-xl border px-3">
          {tipo.configBloco.rows.filter((r) => r.tipo !== 'perm').map((r) => <LinhaConfigTipo key={r.id} row={r} valor={tipoCfg[r.id]} onChange={(v) => setTipoCfg((p) => ({ ...p, [r.id]: v }))} />)}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Preferências específicas do tipo serão persistidas quando o pipeline do {tipo.configBloco.titulo.toLowerCase()} estiver pronto.</p>
      </Secao>

      <Secao titulo="Versões e avisos">
        <ul className="space-y-1 text-xs text-muted-foreground">
          <li>• Migração de marcações: <strong className="text-foreground">{tipo.migracao}</strong></li>
          <li>• Avisar alunos na liberação e quando houver nova versão (“Atualizado” no card) — em construção.</li>
        </ul>
        <button onClick={arquivar} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/10"><Archive className="h-3.5 w-3.5" />Arquivar conteúdo</button>
      </Secao>

      <div className="flex justify-end">
        <button onClick={salvarAgendamento} disabled={salvando} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-110 disabled:opacity-60">{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar configurações</button>
      </div>
    </div>
  )
}

function LinhaConfigTipo({ row, valor, onChange }: { row: ConfigRow; valor: boolean | string | undefined; onChange: (v: boolean | string) => void }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1"><div className="text-sm font-medium leading-tight text-foreground">{row.titulo}</div>{row.sub && <div className="text-[11px] text-muted-foreground">{row.sub}</div>}</div>
      {row.tipo === 'sw' ? (
        <Toggle on={!!valor} onChange={onChange} />
      ) : (
        <select value={String(valor ?? '')} onChange={(e) => onChange(e.target.value)} className="h-8 rounded-lg border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
          {(row.opcoes ?? []).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      )}
    </div>
  )
}
