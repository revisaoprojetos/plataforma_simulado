'use client'

import { useState } from 'react'
import { Check, Lock, Pencil, Send, Users } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { MSG_AUTO, MSG_PROVEDORES, type AutomacaoRow, type MsgCfg } from '@/lib/revisao/cursos-defs'
import { salvarAutomacaoAction, salvarConexaoMensagensAction } from '../actions'
import { Campo, Pill, inputCls, textareaCls, useAcao } from '../ui-cursos'

const sub = (t: string, curso: string, nome: string) => t.replace(/\{nome\}/g, nome).replace(/\{curso\}/g, curso).replace(/\{link\}/g, '[link da plataforma]')

export function AbaMsg({ cursoId, cursoNome, cfg, automacoes, podeEditar, tenantNome, nomeExemplo }: { tenantNome: string; nomeExemplo: string; cursoId: string; cursoNome: string; cfg: MsgCfg; automacoes: AutomacaoRow[]; podeEditar: boolean }) {
  const [pendente, executar] = useAcao()
  const [prov, setProv] = useState(cfg.prov)
  const [num, setNum] = useState(cfg.num)
  const [sel, setSel] = useState('boas')
  const linha = (k: string) => automacoes.find((a) => a.canal === 'whatsapp' && a.chave === k)
  const padrao = MSG_AUTO.find((a) => a[0] === sel)!
  const [rascunho, setRascunho] = useState<Record<string, string>>({})
  const texto = rascunho[sel] ?? linha(sel)?.texto ?? padrao[2]
  const lock = !podeEditar || pendente

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Conexão</h2><Pill tom={cfg.con ? 'ok' : 'mut'}>{cfg.con ? 'Conectado' : 'Não conectado'}</Pill></div>
          <Campo rotulo="Serviço de mensagens"><select className={inputCls} value={prov} onChange={(e) => setProv(e.target.value)} disabled={lock}>{MSG_PROVEDORES.map((o) => <option key={o}>{o}</option>)}</select></Campo>
          <Campo rotulo="Número que envia"><input className={inputCls} value={num} onChange={(e) => setNum(e.target.value)} placeholder="+55 (31) 00000-0000" disabled={lock} /></Campo>
          <div className="flex items-start gap-2.5 rounded-xl bg-muted px-3.5 py-3 text-sm"><Lock className="mt-0.5 size-4 shrink-0 text-primary" /><span>A chave de acesso do serviço é cadastrada pela Coordenação de Tech no servidor da plataforma. Ela nunca fica salva nesta tela.</span></div>
          <div className="flex flex-wrap gap-2">
            <Button variant={cfg.con ? 'outline' : 'default'} size="lg" disabled={lock} onClick={() => executar(() => salvarConexaoMensagensAction(cursoId, { prov, num, con: !cfg.con }), cfg.con ? 'Serviço de mensagens desconectado' : 'Serviço de mensagens marcado como conectado')}>{cfg.con ? 'Desconectar' : 'Marcar como conectado'}</Button>
            <Button variant="outline" size="lg" onClick={() => toast.info('O envio de teste depende da chave do serviço no servidor (Coordenação de Tech).')}><Send className="size-4" />Enviar teste</Button>
            <Button variant="ghost" size="lg" disabled={lock || (prov === cfg.prov && num === cfg.num)} onClick={() => executar(() => salvarConexaoMensagensAction(cursoId, { prov, num, con: cfg.con }), 'Conexão salva')}>Salvar serviço e número</Button>
          </div>
        </section>

        <section className="rounded-2xl border bg-card shadow-sm">
          <div className="flex items-start gap-3 border-b p-4">
            <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><Users className="size-4" /></span>
            <div><h2 className="text-sm font-semibold">Mensagens automáticas</h2><p className="text-xs text-muted-foreground">Saem sozinhas quando a situação acontece com um aluno deste curso</p></div>
          </div>
          <div className="flex flex-col px-4">
            {MSG_AUTO.map(([k, rotulo, , ligada]) => {
              const on = linha(k)?.ativo ?? ligada
              return (
                <div key={k} className="flex items-center gap-3 border-b py-2.5 text-sm last:border-0">
                  <Switch checked={on} disabled={lock} aria-label={rotulo} onCheckedChange={(v) => executar(() => salvarAutomacaoAction(cursoId, 'whatsapp', k, { ativo: v }))} />
                  <span className="flex-1">{rotulo}</span>
                  <Button variant={sel === k ? 'default' : 'outline'} size="sm" onClick={() => setSel(k)}><Pencil className="size-3.5" />Texto</Button>
                </div>
              )
            })}
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm">
          <h2 className="text-sm font-semibold">Texto: {padrao[1]}</h2>
          <Campo rotulo="Mensagem" dica="{nome} vira o primeiro nome do aluno, {curso} o nome do curso e {link} o link da plataforma. Pela API oficial, mensagens automáticas só saem com um modelo aprovado pela Meta.">
            <textarea className={textareaCls} rows={5} value={texto} disabled={lock} onChange={(e) => setRascunho((r) => ({ ...r, [sel]: e.target.value }))} maxLength={1000} />
          </Campo>
          <div><Button size="lg" disabled={lock} onClick={() => executar(() => salvarAutomacaoAction(cursoId, 'whatsapp', sel, { texto }), 'Texto salvo')}><Check className="size-4" />Salvar texto</Button></div>
        </section>
        <aside>
          <div className="mb-2 text-xs font-semibold text-muted-foreground">Como chega no WhatsApp</div>
          <div className="overflow-hidden rounded-2xl border">
            <div className="bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white">{tenantNome}</div>
            <div className="bg-muted p-4">
              <div className={cn('max-w-[85%] rounded-xl rounded-tl-none bg-card p-3 text-sm shadow-sm')}>{sub(texto, cursoNome, nomeExemplo)}</div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
