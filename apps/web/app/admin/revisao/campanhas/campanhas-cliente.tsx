'use client'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AlertTriangle, Check, Clock, Lock, Mail, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatBrt } from '@/lib/brt'
import { CampoCs, INPUT_CS, NotaCs, TEXTAREA_CS, chipCls } from '@/components/admin/revisao/cs-ui'
import {
  API_PROVEDORES, MODELOS_API, MODELOS_EMAIL,
  type ApiConfig, type CampanhaResumo, type GrupoOpcao, type PublicoItem,
} from '@/lib/admin-revisao/cs-tipos'
import { criarCampanhaAction, enviarTesteAction, estimarPublicoAction, salvarApiConfigAction } from './actions'

const TODOS: PublicoItem = { tipo: 'todos', nome: 'Todos os alunos' }
const SEM_ACESSO: PublicoItem = { tipo: 'sem_acesso_7d', nome: 'Sem acesso há 7 dias' }
const chave = (p: PublicoItem) => `${p.tipo}:${p.id ?? ''}`

const STATUS: Record<string, string> = { rascunho: 'Rascunho', agendada: 'Agendada', na_fila: 'Na fila de envio', enviando: 'Enviando', enviada: 'Enviada', erro: 'Erro no envio', cancelada: 'Cancelada' }

/** "Para quem": chips (Todos exclui os demais) + estimativa SERVER-SIDE de alunos distintos. */
function ParaQuem({ canal, grupos, membro, publico, setPublico, dica }: { canal: 'email' | 'api'; grupos: GrupoOpcao[]; membro: PublicoItem | null; publico: PublicoItem[]; setPublico: (p: PublicoItem[]) => void; dica?: string }) {
  const [est, setEst] = useState<number | null>(null)
  const opcoes = useMemo<PublicoItem[]>(() => [...(membro ? [membro] : []), TODOS, SEM_ACESSO, ...grupos.map((g) => ({ tipo: 'grupo' as const, id: g.id, nome: g.nome }))], [grupos, membro])
  const sel = new Set(publico.map(chave))
  const k = publico.map(chave).join('|')
  useEffect(() => {
    if (!publico.length) { setEst(0); return }
    let vivo = true
    const t = setTimeout(async () => { const r = await estimarPublicoAction(publico, canal); if (vivo && r.ok) setEst(r.total ?? 0) }, 250)
    return () => { vivo = false; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k])
  function alternar(p: PublicoItem) {
    if (p.tipo === 'todos') { setPublico(sel.has(chave(p)) ? [] : [p]); return }
    const base = publico.filter((x) => x.tipo !== 'todos')
    setPublico(sel.has(chave(p)) ? base.filter((x) => chave(x) !== chave(p)) : [...base, p])
  }
  const [buscaG, setBuscaG] = useState('')
  const fixos = opcoes.filter((o) => o.tipo !== 'grupo')
  const escolhidos = publico.filter((x) => x.tipo === 'grupo')
  const q = buscaG.trim().toLowerCase()
  const achados = q ? opcoes.filter((o) => o.tipo === 'grupo' && !sel.has(chave(o)) && o.nome.toLowerCase().includes(q)).slice(0, 30) : []
  return (
    <div className="grid gap-1.5 text-sm">
      <span className="font-medium">Para quem</span>
      <div className="flex flex-wrap gap-2">
        {fixos.map((p) => <button key={chave(p)} type="button" className={chipCls(sel.has(chave(p)))} onClick={() => alternar(p)}>{sel.has(chave(p)) && <Check className="h-3 w-3" />}{p.nome}</button>)}
        {escolhidos.map((p) => <button key={chave(p)} type="button" className={chipCls(true)} onClick={() => alternar(p)} title="Remover grupo"><Check className="h-3 w-3" />{p.nome}</button>)}
      </div>
      <div className="relative max-w-md">
        <input className="h-9 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" value={buscaG} onChange={(e) => setBuscaG(e.target.value)} placeholder={`Adicionar grupo (${grupos.length} disponíveis) — digite para buscar`} aria-label="Buscar grupo" />
        {achados.length > 0 && (
          <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border bg-card p-1 shadow-lg">
            {achados.map((g) => <li key={chave(g)}><button type="button" className="w-full rounded-lg px-3 py-1.5 text-left text-sm hover:bg-muted" onClick={() => { alternar(g); setBuscaG('') }}>{g.nome}</button></li>)}
          </ul>
        )}
        {q && achados.length === 0 && <p className="mt-1 text-xs text-muted-foreground">Nenhum grupo encontrado.</p>}
      </div>
      <small className="text-xs text-muted-foreground">{est == null ? 'Calculando…' : `${est.toLocaleString('pt-BR')} alunos vão receber.`}{dica ? ` ${dica}` : ''}</small>
    </div>
  )
}

function Ultimos({ titulo, itens, api }: { titulo: string; itens: CampanhaResumo[]; api: boolean }) {
  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <h2 className="mb-2 text-sm font-semibold">{titulo}</h2>
      {itens.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma campanha registrada ainda.</p> : (
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-2 font-semibold">{api ? 'Mensagem' : 'Assunto'}</th>
            <th className="px-2 py-2 text-right font-semibold">{api ? 'Entregues' : 'Abriram'}</th>
            <th className="px-2 py-2 text-right font-semibold">{api ? 'Lidas' : 'Clicaram'}</th>
            {api && <th className="py-2 pl-2 text-right font-semibold">Cliques</th>}
          </tr></thead>
          <tbody>{itens.map((c) => {
            const enviada = c.status === 'enviada'
            const pct = (v: number | null) => (enviada && v != null ? `${Math.round(v)}%` : '—')
            return (
              <tr key={c.id} className="border-b last:border-0 align-top">
                <td className="py-2 pr-2">
                  <b className="font-semibold">{c.titulo}</b>
                  <span className="block text-xs text-muted-foreground">{formatBrt(c.criadoEm)?.slice(0, 10)} · {c.publicoTxt} · {c.estimativa.toLocaleString('pt-BR')}</span>
                  {!enviada && <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-semibold text-muted-foreground">{STATUS[c.status] ?? c.status}{c.agendadoPara ? ` · ${formatBrt(c.agendadoPara)}` : ''}</span>}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{pct(c.p1)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{pct(c.p2)}</td>
                {api && <td className="py-2 pl-2 text-right tabular-nums">{pct(c.p3)}</td>}
              </tr>
            )
          })}</tbody>
        </table></div>
      )}
    </section>
  )
}

function AvisoProvedor({ on }: { on: boolean }) {
  if (on) return <NotaCs><Send className="mt-0.5 h-4 w-4 shrink-0" /><span>Envio ligado: a campanha entra na fila e sai pelo fluxo de envio configurado no servidor (ciclo do agendador). Envie com cuidado.</span></NotaCs>
  return <NotaCs tom="aviso"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>O provedor de envio ainda não está ligado ao servidor: a campanha fica <b>registrada na fila</b> (público, texto e horário) e sai quando o disparo for configurado. Nenhuma mensagem é enviada agora.</span></NotaCs>
}

// ───────────────────────────── E-mail ─────────────────────────────
export function CampanhaEmail({ grupos, membro, plataforma, recentes, podeEnviar, envioOn, nomeExemplo, cursoExemplo }: { envioOn: boolean; nomeExemplo: string; cursoExemplo: string; grupos: GrupoOpcao[]; membro: PublicoItem | null; plataforma: string; recentes: CampanhaResumo[]; podeEnviar: boolean }) {
  const router = useRouter(); const [pend, start] = useTransition()
  const [publico, setPublico] = useState<PublicoItem[]>(membro ? [membro] : [TODOS])
  const [assunto, setAssunto] = useState(''); const [txt, setTxt] = useState(''); const [cta, setCta] = useState(''); const [modelo, setModelo] = useState('')
  const [quando, setQuando] = useState(''); const [confirma, setConfirma] = useState(false)

  const pronto = podeEnviar && !!assunto.trim() && !!txt.trim() && publico.length > 0
  const preview = (s: string) => s.replace(/\{nome\}/g, nomeExemplo).replace(/\{curso\}/g, cursoExemplo)

  function enviar(agendar: boolean) {
    start(async () => {
      const r = await criarCampanhaAction({ canal: 'email', assunto, mensagem: txt, cta, modelo, publico, quando, agendar })
      setConfirma(false)
      if (!r.ok) { toast.error(r.error ?? 'Não foi possível registrar.'); return }
      toast.success((r.status === 'agendada' ? 'Campanha agendada.' : 'Campanha na fila de envio.') + (envioOn ? '' : ' O envio está desligado no servidor: nada sai até configurar.'))
      setAssunto(''); setTxt(''); setCta(''); setModelo(''); setQuando(''); router.refresh()
    })
  }
  function teste() { start(async () => { const r = await enviarTesteAction({ canal: 'email', assunto, mensagem: txt, cta }); toast[r.ok ? 'success' : 'error'](r.ok ? 'Teste enviado' : r.error ?? 'Indisponível') }) }

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <section className="grid gap-4 rounded-2xl border bg-card p-4 shadow-sm">
        <AvisoProvedor on={envioOn} />
        <ParaQuem canal="email" grupos={grupos} membro={membro} publico={publico} setPublico={setPublico} />
        <div className="grid gap-1.5 text-sm"><span className="font-medium">Começar de um modelo</span>
          <div className="flex flex-wrap gap-2">{Object.keys(MODELOS_EMAIL).map((k) => <button key={k} type="button" className={chipCls(modelo === k)} onClick={() => { const m = MODELOS_EMAIL[k]; setAssunto(m[0]); setTxt(m[1]); setCta(m[2]); setModelo(k) }}>{k}</button>)}</div>
        </div>
        <CampoCs rotulo="Assunto"><input className={INPUT_CS} value={assunto} onChange={(e) => setAssunto(e.target.value)} placeholder="Ex.: Nova edição do JurisClub no ar" maxLength={160} /></CampoCs>
        <CampoCs rotulo="Mensagem" dica="{nome} vira o primeiro nome do aluno."><textarea className={TEXTAREA_CS} rows={8} value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Escreva a mensagem" maxLength={4000} /></CampoCs>
        <CampoCs rotulo="Texto do botão"><input className={INPUT_CS} value={cta} onChange={(e) => setCta(e.target.value)} placeholder="Ex.: Abrir a plataforma" maxLength={60} /></CampoCs>
        <div className="grid gap-3 sm:grid-cols-2">
          <CampoCs rotulo="Enviar em" dica="Horário de Brasília. Usado ao clicar em Agendar."><input className={INPUT_CS} type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} /></CampoCs>
          <div className="grid content-end"><Button variant="outline" size="lg" className="h-10" disabled={pend || !podeEnviar} onClick={teste}><Mail /> Enviar teste para mim</Button></div>
        </div>
        {confirma ? (
          <NotaCs tom="aviso"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>Registrar o envio para os alunos escolhidos? Depois de enviado não dá para desfazer.
            <span className="mt-2 flex gap-2"><Button size="sm" disabled={pend} onClick={() => enviar(false)}>Sim, enviar</Button><Button size="sm" variant="ghost" onClick={() => setConfirma(false)}>Voltar</Button></span></span></NotaCs>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button size="lg" disabled={!pronto || pend} onClick={() => setConfirma(true)}><Send /> Enviar agora</Button>
            <Button size="lg" variant="outline" disabled={!pronto || pend || !quando} onClick={() => enviar(true)}><Clock /> Agendar</Button>
          </div>
        )}
      </section>
      <aside className="grid min-w-0 gap-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Como o aluno recebe</div>
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="bg-primary px-4 py-3 text-sm font-bold text-primary-foreground">{plataforma}</div>
          <div className="min-h-40 px-4 py-4">
            <h3 className="mb-2 text-base font-bold">{preview(assunto) || 'Assunto do e-mail'}</h3>
            <p className="whitespace-pre-wrap text-sm">{preview(txt) || 'A mensagem aparece aqui enquanto você escreve.'}</p>
            {cta && <span className="mt-3 inline-block rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">{cta}</span>}
          </div>
          <div className="border-t px-4 py-3 text-[11px] text-muted-foreground">Você recebe este e-mail porque é aluno de {plataforma}. Para não receber mais, ajuste nas configurações da sua conta.</div>
        </div>
        <Ultimos titulo="Últimos envios" itens={recentes} api={false} />
      </aside>
    </div>
  )
}

// ───────────────────────────── Mensagem por API ─────────────────────────────
export function CampanhaApi({ grupos, membro, plataforma, cfg, cfgOk, recentes, podeEnviar, podeConfigurar, envioOn, nomeExemplo }: { envioOn: boolean; nomeExemplo: string; grupos: GrupoOpcao[]; membro: PublicoItem | null; plataforma: string; cfg: ApiConfig; cfgOk: boolean; recentes: CampanhaResumo[]; podeEnviar: boolean; podeConfigurar: boolean }) {
  const router = useRouter(); const [pend, start] = useTransition()
  const [prov, setProv] = useState<string>(cfg.provedor); const [num, setNum] = useState(cfg.numero)
  const [publico, setPublico] = useState<PublicoItem[]>(membro ? [membro] : [TODOS])
  const [modelo, setModelo] = useState(''); const [txt, setTxt] = useState(''); const [quando, setQuando] = useState(''); const [confirma, setConfirma] = useState(false)

  const pode = podeEnviar && cfg.conectada && !!txt.trim() && publico.length > 0
  const preview = (s: string) => s.replace(/\{nome\}/g, nomeExemplo).replace(/\{link\}/g, '[link da plataforma]')

  function conexao() {
    start(async () => {
      const r = await salvarApiConfigAction({ provedor: prov, numero: num, conectada: !cfg.conectada })
      if (!r.ok) { toast.error(r.error ?? 'Não foi possível salvar.'); return }
      toast.success(cfg.conectada ? 'API desconectada' : 'API marcada como conectada'); router.refresh()
    })
  }
  function enviar(agendar: boolean) {
    start(async () => {
      const r = await criarCampanhaAction({ canal: 'api', assunto: modelo, mensagem: txt, modelo, publico, quando, agendar })
      setConfirma(false)
      if (!r.ok) { toast.error(r.error ?? 'Não foi possível registrar.'); return }
      toast.success((r.status === 'agendada' ? 'Disparo agendado.' : 'Disparo na fila.') + (envioOn ? '' : ' O envio está desligado no servidor: nada sai até configurar.'))
      setTxt(''); setModelo(''); setQuando(''); router.refresh()
    })
  }
  function teste() { start(async () => { const r = await enviarTesteAction({ canal: 'api', assunto: modelo, mensagem: txt }); toast[r.ok ? 'success' : 'error'](r.ok ? 'Teste enviado' : r.error ?? 'Indisponível') }) }

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="grid min-w-0 gap-4">
        <section className="grid gap-3 rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2"><h2 className="text-base font-semibold">Conexão da API</h2>
            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', cfg.conectada ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground')}>{cfg.conectada ? 'Conectada' : 'Não conectada'}</span></div>
          {!cfgOk && <NotaCs tom="aviso">Aplique a migração <b>20261112040000</b> para salvar a conexão e registrar campanhas.</NotaCs>}
          <div className="grid gap-3 sm:grid-cols-2">
            <CampoCs rotulo="Serviço de mensagens"><select className={INPUT_CS} value={prov} onChange={(e) => setProv(e.target.value)} disabled={!podeConfigurar}>{API_PROVEDORES.map((o) => <option key={o}>{o}</option>)}</select></CampoCs>
            <CampoCs rotulo="Número que envia"><input className={INPUT_CS} value={num} onChange={(e) => setNum(e.target.value)} placeholder="+55 (31) 00000-0000" disabled={!podeConfigurar} /></CampoCs>
          </div>
          <NotaCs><Lock className="mt-0.5 h-4 w-4 shrink-0" /><span>A chave de acesso da API é cadastrada pela Coordenação de Tech no servidor da plataforma. Ela nunca fica salva nesta tela.</span></NotaCs>
          <div><Button size="lg" variant={cfg.conectada ? 'outline' : 'default'} disabled={pend || !podeConfigurar} onClick={conexao}>{cfg.conectada ? 'Desconectar' : 'Marcar como conectada'}</Button></div>
        </section>

        <section className="grid gap-4 rounded-2xl border bg-card p-4 shadow-sm">
          <AvisoProvedor on={envioOn} />
          <ParaQuem canal="api" grupos={grupos} membro={membro} publico={publico} setPublico={setPublico} dica="Só recebe quem tem celular cadastrado." />
          <div className="grid gap-1.5 text-sm"><span className="font-medium">Modelo aprovado</span>
            <div className="flex flex-wrap gap-2">{Object.keys(MODELOS_API).map((k) => <button key={k} type="button" className={chipCls(modelo === k)} onClick={() => { setModelo(k); setTxt(MODELOS_API[k]) }}>{modelo === k && <Check className="h-3 w-3" />}{k}</button>)}</div>
            <small className="text-xs text-muted-foreground">Pela API oficial, mensagens em massa só saem com um modelo aprovado pela Meta.</small>
          </div>
          <CampoCs rotulo="Mensagem" dica="{nome} vira o primeiro nome do aluno e {link} o link da plataforma."><textarea className={TEXTAREA_CS} rows={5} value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Escreva a mensagem" maxLength={1024} /></CampoCs>
          <div className="grid gap-3 sm:grid-cols-2">
            <CampoCs rotulo="Enviar em" dica="Horário de Brasília. Usado ao clicar em Agendar."><input className={INPUT_CS} type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} /></CampoCs>
            <div className="grid content-end"><Button variant="outline" size="lg" className="h-10" disabled={pend || !podeEnviar} onClick={teste}><Send /> Enviar teste para mim</Button></div>
          </div>
          {!cfg.conectada && <NotaCs tom="aviso"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>Conecte a API acima para disparar.</span></NotaCs>}
          {confirma ? (
            <NotaCs tom="aviso"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>Registrar o disparo? Depois de enviado não dá para desfazer.
              <span className="mt-2 flex gap-2"><Button size="sm" disabled={pend} onClick={() => enviar(false)}>Sim, disparar</Button><Button size="sm" variant="ghost" onClick={() => setConfirma(false)}>Voltar</Button></span></span></NotaCs>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button size="lg" disabled={!pode || pend} onClick={() => setConfirma(true)}><Send /> Disparar agora</Button>
              <Button size="lg" variant="outline" disabled={!pode || pend || !quando} onClick={() => enviar(true)}><Clock /> Agendar</Button>
            </div>
          )}
        </section>
      </div>
      <aside className="grid min-w-0 gap-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Como chega no celular do aluno</div>
        <div className="overflow-hidden rounded-2xl border shadow-sm">
          <div className="bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white">{plataforma}</div>
          <div className="min-h-32 bg-muted p-3">
            <div className="max-w-[85%] rounded-xl rounded-tl-sm bg-card px-3 py-2 text-sm shadow-sm">
              <p className="whitespace-pre-wrap">{preview(txt) || 'A mensagem aparece aqui enquanto você escreve.'}</p>
              {quando && <small className="mt-1 block text-right text-[10px] text-muted-foreground">{quando.slice(11, 16)}</small>}
            </div>
          </div>
        </div>
        <Ultimos titulo="Últimos disparos" itens={recentes} api />
      </aside>
    </div>
  )
}
