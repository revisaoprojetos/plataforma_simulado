'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { AlertTriangle, ExternalLink, KeyRound, Link2, Loader2, Lock, LockOpen, Mail, Trash2, X } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatBrt } from '@/lib/brt'
import { ehCorFundo } from '@/lib/aluno/personalizacao'
import { CampoCpfOculto } from '@/components/admin/campo-cpf-oculto'
import { iconeCargo } from '@/lib/gamificacao/cargo-icones'
import { AvatarMembro, PillOrigem, PillStatusMembro, INPUT_CS } from '@/components/admin/revisao/cs-ui'
import { ImpersonationLauncher } from '@/components/admin/impersonation/impersonation-launcher'
import { FICHA_ABAS, type FichaAba, type FichaAcessos, type FichaAtendimento, type FichaCadastro, type FichaDesempenho, type FichaHistorico, type FichaLeitura, type FichaPlano, type FichaResumo } from '@/lib/admin-revisao/ficha-tipos'
import type { MembroLinha } from '@/lib/admin-revisao/cs-tipos'

const dt = (s?: string | null) => (s ? formatBrt(s) ?? '—' : '—')
const dd = (s?: string | null) => (s ? (formatBrt(s) ?? '—').slice(0, 10) : '—')
const dur = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}min` : s >= 60 ? `${Math.round(s / 60)}min` : `${s}s`)

// Cache de seções da ficha compartilhado entre membros (60 s): reabrir/voltar é instantâneo e a lista pode PRÉ-CARREGAR o Resumo
// ao passar o mouse na linha — quando o clique acontece, o painel já tem os dados.
const FICHA_CACHE = new Map<string, { t: number; v: unknown }>()
const FICHA_EM_VOO = new Set<string>()
const FICHA_TTL = 60_000
const fichaGet = (k: string) => { const e = FICHA_CACHE.get(k); return e && Date.now() - e.t < FICHA_TTL ? e.v : undefined }
/** Ficha interna (/admin/estudantes/[id]) abre na MESMA aba levando o endereço atual de Membros (página, filtros, aluno) em `voltar`,
 *  para a seta de voltar da ficha retornar exatamente para cá. */
function fichaInternaHref(id: string) {
  const voltar = typeof window === 'undefined' ? '' : `${window.location.pathname}${window.location.search}`
  return `/admin/estudantes/${id}${voltar ? `?voltar=${encodeURIComponent(voltar)}` : ''}`
}
export function prefetchFicha(id: string, aba: FichaAba = 'resumo') {
  const k = `${id}:${aba}`
  if (fichaGet(k) !== undefined || FICHA_EM_VOO.has(k)) return
  FICHA_EM_VOO.add(k)
  fetch(`/api/admin/revisao/membros/${id}?aba=${aba}`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null)).then((j) => { if (j?.dados) FICHA_CACHE.set(k, { t: Date.now(), v: j.dados }) })
    .catch(() => {}).finally(() => FICHA_EM_VOO.delete(k))
}

function Vazio({ children }: { children: React.ReactNode }) { return <p className="rounded-xl bg-muted px-3 py-4 text-center text-sm text-muted-foreground">{children}</p> }
function H({ children }: { children: React.ReactNode }) { return <h3 className="mb-2 mt-1 text-sm font-semibold">{children}</h3> }
function Barra({ pct }: { pct: number }) { return <div className="h-2 w-full overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} /></div> }
function Tab({ cab, linhas }: { cab: string[]; linhas: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border"><table className="w-full text-sm">
      <thead><tr className="border-b bg-muted/50 text-left text-[11px] uppercase tracking-wide text-muted-foreground">{cab.map((c) => <th key={c} className="px-3 py-2 font-semibold">{c}</th>)}</tr></thead>
      <tbody>{linhas.map((l, i) => <tr key={i} className="border-b last:border-0">{l.map((c, j) => <td key={j} className="px-3 py-2 align-top">{c}</td>)}</tr>)}</tbody>
    </table></div>
  )
}
function Skeleton() {
  return <div className="grid animate-pulse gap-3" aria-busy="true" aria-label="Carregando">{[0, 1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl bg-muted" />)}</div>
}

export function FichaPainel({ membro, podeEditar, podeRemover, onFechar, onMudou, onRemovido }: {
  membro: MembroLinha; podeEditar: boolean; podeRemover: boolean; onFechar: () => void; onMudou: () => void; onRemovido: () => void
}) {
  const [aba, setAba] = useState<FichaAba>('resumo')
  const [dados, setDados] = useState<Record<string, unknown>>({})
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const seq = useRef(0)
  const [ocupado, setOcupado] = useState(false)
  const [confirmaRemover, setConfirmaRemover] = useState(false)
  const [bloqueado, setBloqueado] = useState(membro.bloqueado)

  const carregar = useCallback(async (a: FichaAba, forcar = false) => {
    const k = `${membro.id}:${a}`
    const hit = forcar ? undefined : fichaGet(k)
    if (hit !== undefined) { setDados((d) => ({ ...d, [a]: hit })); setCarregando(false); setErro(null); return }
    const mine = ++seq.current
    setCarregando(true); setErro(null)
    try {
      const r = await fetch(`/api/admin/revisao/membros/${membro.id}?aba=${a}`, { cache: 'no-store' })
      const j = await r.json().catch(() => ({}))
      if (mine !== seq.current) return
      if (!r.ok) throw new Error(j?.message || j?.error || `HTTP ${r.status}`)
      FICHA_CACHE.set(k, { t: Date.now(), v: j.dados }); setDados((d) => ({ ...d, [a]: j.dados }))
    } catch (e: any) { if (mine === seq.current) setErro(e?.message ?? 'Falha ao carregar.') }
    finally { if (mine === seq.current) setCarregando(false) }
  }, [membro.id])

  useEffect(() => { carregar(aba) }, [aba, carregar])

  async function acao(corpo: Record<string, unknown>, okMsg: string): Promise<boolean> {
    setOcupado(true)
    try {
      const r = await fetch(`/api/admin/revisao/membros/${membro.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) })
      const j = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }))
      if (!j.ok) { toast.error(j.error ?? 'Não foi possível concluir.'); return false }
      toast.success(okMsg)
      FICHA_CACHE.clear(); setDados({}); await carregar(aba, true); onMudou()
      return true
    } catch { toast.error('Falha de rede.'); return false } finally { setOcupado(false) }
  }

  const d = dados[aba] as any
  const capa = membro.perfilCapa?.trim() || null
  return (
    <section className="flex h-full min-h-0 flex-col rounded-2xl border bg-card shadow-sm">
      <div className={cn('relative flex items-start justify-between gap-3 overflow-hidden rounded-t-2xl border-b bg-gradient-to-br from-primary/[0.10] via-card to-card p-4', capa && 'text-white')}>
        {/* fundo do perfil: o MESMO do perfil do aluno (cor `#…` ou imagem) com o mesmo véu */}
        {capa && ehCorFundo(capa) && (<><div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: capa }} /><div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/5 via-black/15 to-black/40" /></>)}
        {capa && !ehCorFundo(capa) && (<>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img aria-hidden src={capa} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover dark:opacity-90" />
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 via-black/25 to-black/55" /></>)}
        <div className="relative flex min-w-0 items-center gap-3">
          <AvatarMembro nome={membro.nome} avatar={membro.avatar} cor={membro.avatarCor} className="h-16 w-16" />
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold" style={capa ? { textShadow: '0 1px 3px rgba(0,0,0,.55)' } : undefined}>{membro.nome}</h2>
            <p className={cn('truncate text-xs', capa ? 'text-white/90' : 'text-muted-foreground')} style={capa ? { textShadow: '0 1px 3px rgba(0,0,0,.55)' } : undefined}>{membro.email ?? '—'} · último acesso {membro.ultimoTxt}</p>
            {membro.nivel != null && (() => { const Ic = iconeCargo(membro.cargoIcone); return (
              <p className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-full bg-background px-2.5 py-1 text-xs font-semibold text-primary shadow-sm ring-1 ring-black/10">
                <Ic className="h-3.5 w-3.5 shrink-0" /><span className="shrink-0">Nível {membro.nivel}</span>{membro.cargo && <span className="truncate font-medium text-foreground">· {membro.cargo}</span>}
              </p>) })()}
          </div>
        </div>
        <div className="relative flex shrink-0 items-center gap-2">
          <span className="rounded-full bg-background"><PillStatusMembro bloqueado={bloqueado} risco={membro.risco && !bloqueado} /></span>
          <Button variant="ghost" size="icon-sm" className="xl:hidden" aria-label="Fechar painel" onClick={onFechar}><X /></Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <ImpersonationLauncher aluno={{ id: membro.id, nome: membro.nome, email: membro.email, avatar: membro.avatar, avatarCor: membro.avatarCor }} />
        <Button variant="outline" onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/aluno`); toast.success('Link de acesso copiado. O aluno entra só com o e-mail.') }}><Link2 /> Copiar link de acesso</Button>
        <Link href={`/admin/revisao/campanhas?aba=email&membro=${membro.id}`} className={buttonVariants({ variant: 'outline' })}><Mail /> Enviar e-mail</Link>
        {podeEditar && <Button variant="outline" disabled={ocupado} onClick={async () => { if (await acao({ acao: 'bloqueio' }, bloqueado ? `${membro.nome} voltou a ter acesso` : `${membro.nome} não consegue mais entrar`)) setBloqueado((b) => !b) }}>{bloqueado ? <LockOpen /> : <Lock />} {bloqueado ? 'Desbloquear' : 'Bloquear acesso'}</Button>}
        {podeRemover && (confirmaRemover ? (
          <span className="inline-flex items-center gap-2 text-sm">Remover da plataforma?
            <Button variant="destructive" size="sm" disabled={ocupado} onClick={async () => { if (await acao({ acao: 'remover' }, `${membro.nome} removido (vai para a Lixeira)`)) onRemovido() }}>Sim</Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmaRemover(false)}>Não</Button>
          </span>
        ) : <Button variant="outline" onClick={() => setConfirmaRemover(true)}><Trash2 /> Remover</Button>)}
        <Link href={fichaInternaHref(membro.id)} prefetch onClick={(e) => { e.currentTarget.href = fichaInternaHref(membro.id) }} className={cn(buttonVariants({ variant: 'ghost' }), 'text-muted-foreground')}><ExternalLink /> Ficha interna</Link>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b px-2" role="tablist" aria-label="Seções da ficha">
        {FICHA_ABAS.map((a) => (
          <button key={a.id} type="button" role="tab" aria-selected={aba === a.id} onClick={() => setAba(a.id)}
            className={cn('-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors', aba === a.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>{a.titulo}</button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {carregando && !d ? <Skeleton /> : erro ? (
          <div className="grid justify-items-center gap-3 rounded-xl bg-muted p-6 text-center text-sm">
            <AlertTriangle className="h-5 w-5 text-amber-500" /><p>Não foi possível carregar esta seção.<br /><span className="text-muted-foreground">{erro}</span></p>
            <Button variant="outline" onClick={() => carregar(aba, true)}>Tentar de novo</Button>
          </div>
        ) : d ? (
          <div className={cn('grid gap-4', carregando && 'opacity-60')}>
            {aba === 'resumo' && <Resumo d={d as FichaResumo} />}
            {aba === 'cadastro' && <Cadastro key={(d as FichaCadastro).atualizadoEm ?? "c"} d={d as FichaCadastro} podeEditar={podeEditar} ocupado={ocupado} salvar={(v) => acao({ acao: 'editar', ...v }, 'Cadastro salvo')} />}
            {aba === 'acessos' && <Acessos d={d as FichaAcessos} podeEditar={podeEditar} ocupado={ocupado} acao={acao} />}
            {aba === 'plano' && <Plano d={d as FichaPlano} />}
            {aba === 'desempenho' && <Desempenho d={d as FichaDesempenho} />}
            {aba === 'leitura' && <Leitura d={d as FichaLeitura} />}
            {aba === 'atendimento' && <Atendimento d={d as FichaAtendimento} />}
            {aba === 'historico' && <Historico d={d as FichaHistorico} />}
          </div>
        ) : null}
        {carregando && d && <div className="mt-2 flex items-center justify-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Atualizando…</div>}
      </div>
    </section>
  )
}

// ─────────── seções ───────────
function Resumo({ d }: { d: FichaResumo }) {
  return (<>
    <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
      {d.kpis.map((k) => (
        <div key={k.rotulo} className="rounded-xl bg-muted p-3.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{k.rotulo}</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{k.valor}</div>
          {k.detalhe && <div className="text-xs text-muted-foreground">{k.detalhe}</div>}
        </div>
      ))}
    </div>
    <div className="grid gap-3 md:grid-cols-2">
      <div><H>Gamificação</H>{d.gamificacao ? (
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-muted-foreground">Nível</dt><dd className="font-semibold">{d.gamificacao.nivel}</dd>
          <dt className="text-muted-foreground">XP total</dt><dd className="font-semibold tabular-nums">{d.gamificacao.xp.toLocaleString('pt-BR')}</dd>
          <dt className="text-muted-foreground">Liga</dt><dd className="font-semibold">{d.gamificacao.liga ?? '—'}</dd>
          <dt className="text-muted-foreground">Sequência atual / maior</dt><dd className="font-semibold">{d.gamificacao.sequenciaAtual} / {d.gamificacao.sequenciaMaior} dias</dd>
          <dt className="text-muted-foreground">Último dia ativo</dt><dd className="font-semibold">{dd(d.gamificacao.ultimoDia)}</dd>
        </dl>) : <Vazio>Sem dados de gamificação.</Vazio>}</div>
      <div><H>Tempo de estudo (30 dias)</H>{d.tempo30d.length ? (
        <div className="grid gap-1.5 text-sm">{d.tempo30d.map((t) => <div key={t.frente} className="flex justify-between"><span className="text-muted-foreground">{t.frente}</span><b>{dur(t.segundos)}</b></div>)}</div>
      ) : <Vazio>Nenhum tempo registrado nos últimos 30 dias.</Vazio>}</div>
    </div>
    <div><H>Conta</H>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt className="text-muted-foreground">Cadastrado em</dt><dd>{dt(d.cadastroResumo.criadoEm)}</dd>
        <dt className="text-muted-foreground">Último acesso</dt><dd>{dt(d.cadastroResumo.ultimoAcesso)}</dd>
        <dt className="text-muted-foreground">Classificação</dt><dd>{d.cadastroResumo.classificacao ?? '—'}</dd>
        <dt className="text-muted-foreground">Origem</dt><dd>{d.cadastroResumo.origem ?? 'Manual'}</dd>
        {d.cadastroResumo.bloqueadoEm && (<><dt className="text-muted-foreground">Bloqueado em</dt><dd>{dt(d.cadastroResumo.bloqueadoEm)}</dd></>)}
      </dl></div>
  </>)
}

function Cadastro({ d, podeEditar, ocupado, salvar }: { d: FichaCadastro; podeEditar: boolean; ocupado: boolean; salvar: (v: Record<string, unknown>) => Promise<boolean> }) {
  const [f, setF] = useState({ nome: d.nome, email: d.email ?? '', cpf: d.cpf ?? '', telefone: d.telefone ?? '', dataNascimento: d.dataNascimento ?? '', classificacao: d.classificacao ?? '', matriculaExterna: d.matriculaExterna ?? '' })
  const [erro, setErro] = useState<string | null>(null)
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }))
  const ro = !podeEditar
  function validar(): string | null {
    if (f.nome.trim().length < 2) return 'Informe o nome.'
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) return 'Confira o e-mail.'
    const cpfD = f.cpf.replace(/\D/g, '')
    if (f.cpf && !d.cpfMascarado && cpfD.length !== 11) return 'CPF deve ter 11 dígitos.'
    const tD = f.telefone.replace(/\D/g, '')
    if (f.telefone && (tD.length < 8 || tD.length > 15)) return 'Telefone inválido (8 a 15 dígitos).'
    return null
  }
  const mudou = f.cpf !== (d.cpf ?? '')
  return (<form noValidate className="grid gap-3" onSubmit={async (e) => { e.preventDefault(); const v = validar(); setErro(v); if (v) return; await salvar({ ...f, cpf: mudou ? f.cpf : undefined }) }}>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-sm"><span className="font-medium">Nome</span><input className={INPUT_CS} value={f.nome} onChange={(e) => set('nome', e.target.value)} disabled={ro} /></label>
      <label className="grid gap-1 text-sm"><span className="font-medium">E-mail</span><input className={INPUT_CS} type="email" value={f.email} onChange={(e) => set('email', e.target.value)} disabled={ro} /></label>
      <label className="grid gap-1 text-sm"><span className="font-medium">CPF</span><CampoCpfOculto className={INPUT_CS} value={f.cpf} onChange={(v) => set('cpf', v)} disabled={ro} /><small className="text-xs text-muted-foreground">{d.cpfMascarado ? 'Mascarado para o seu perfil; digite um CPF novo para substituir.' : 'Oculto por padrão; use o olho para ver (só super-admin).'}</small></label>
      <label className="grid gap-1 text-sm"><span className="font-medium">Telefone</span><input className={INPUT_CS} value={f.telefone} onChange={(e) => set('telefone', e.target.value)} disabled={ro} placeholder="+55 (31) 00000-0000" /></label>
      <label className="grid gap-1 text-sm"><span className="font-medium">Data de nascimento</span><input className={INPUT_CS} type="date" value={f.dataNascimento} onChange={(e) => set('dataNascimento', e.target.value)} disabled={ro} /></label>
      <label className="grid gap-1 text-sm"><span className="font-medium">Classificação</span>
        <select className={INPUT_CS} value={f.classificacao} onChange={(e) => set('classificacao', e.target.value)} disabled={ro}><option value="">—</option><option value="normal">Normal</option><option value="passaporte">Passaporte</option><option value="vitalicio">Vitalício</option></select></label>
      <label className="grid gap-1 text-sm"><span className="font-medium">Matrícula externa</span><input className={INPUT_CS} value={f.matriculaExterna} onChange={(e) => set('matriculaExterna', e.target.value)} disabled={ro} /></label>
    </div>
    {d.emailsSecundarios.length > 0 && <p className="text-sm text-muted-foreground">E-mails secundários: {d.emailsSecundarios.join(', ')}</p>}
    <dl className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
      <dt>Cadastrado em</dt><dd>{dt(d.criadoEm)}</dd><dt>Atualizado em</dt><dd>{dt(d.atualizadoEm)}</dd><dt>Origem</dt><dd>{d.origemProvider ?? 'Manual'}</dd><dt>Conta de login</dt><dd>{d.userId ? 'vinculada' : 'sem conta (entra por e-mail)'}</dd>
    </dl>
    {erro && <p className="text-sm text-destructive" role="alert">{erro}</p>}
    {podeEditar && <div><Button size="lg" type="submit" disabled={ocupado}>Salvar cadastro</Button></div>}
  </form>)
}

function Acessos({ d, podeEditar, ocupado, acao }: { d: FichaAcessos; podeEditar: boolean; ocupado: boolean; acao: (c: Record<string, unknown>, m: string) => Promise<boolean> }) {
  const [lib, setLib] = useState('')
  return (<>
    {d.bloqueado && <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-400">Acesso BLOQUEADO: o aluno não consegue entrar (o progresso fica guardado).</p>}
    <div><H>Grupos de acesso</H><div className="grid gap-2">
      {d.grupos.length === 0 && <Vazio>Sem nenhum grupo. Não vê nenhum curso.</Vazio>}
      {d.grupos.map((g) => (
        <div key={g.grupoId} className="flex items-center gap-3 rounded-xl border p-3">
          <span className="h-9 w-1 shrink-0 rounded-full bg-emerald-500" />
          <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{g.nome}</div><div className="flex items-center gap-2 text-xs text-muted-foreground">{g.validade} <PillOrigem origem={g.origem} /></div></div>
          {podeEditar && <Button variant="outline" size="sm" disabled={ocupado} onClick={() => acao({ acao: 'tirar', grupoId: g.grupoId }, `Saiu de ${g.nome}`)}>Tirar do grupo</Button>}
        </div>))}
    </div></div>
    {podeEditar && <div className="grid gap-2"><label className="text-sm font-medium" htmlFor="lib-grp">Liberar outro curso para este membro</label>
      <select id="lib-grp" className={INPUT_CS} value={lib} onChange={(e) => setLib(e.target.value)}><option value="">Escolha o grupo</option>{d.liberaveis.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}</select>
      <div><Button size="lg" disabled={ocupado || !lib} onClick={async () => { if (await acao({ acao: 'liberar', grupoId: lib }, 'Acesso liberado')) setLib('') }}><KeyRound /> Liberar acesso</Button></div></div>}
    <div><H>Produtos liberados</H>{d.produtos.length ? <Tab cab={['Produto', 'Situação', 'Início', 'Fim', 'Origem']} linhas={d.produtos.map((p) => [<b key="n">{p.nome}</b>, p.temAcesso ? 'Ativo' : p.status === 'scheduled' ? 'Agendado' : p.status === 'revoked' ? 'Revogado' : 'Expirado', dd(p.inicio), p.fim ? dd(p.fim) : 'Vitalício', p.origens.join(', ')])} /> : <Vazio>Nenhum produto liberado (por regra de venda ou manual).</Vazio>}</div>
    <div><H>Assinaturas (Guru / Curseduca / manual)</H>{d.assinaturas.length ? <Tab cab={['Origem', 'Produto', 'Situação', 'Início', 'Expira']} linhas={d.assinaturas.map((a) => [a.provider, a.produto ?? '—', a.status, dd(a.inicio), a.expira ? dd(a.expira) : '—'])} /> : <Vazio>Nenhuma assinatura registrada.</Vazio>}</div>
    <div><H>Matrículas em simulados</H>{d.matriculas.length ? <Tab cab={['Simulado', 'Situação', 'Plano', 'Validade']} linhas={d.matriculas.map((m) => [m.simulado ?? '—', m.status ?? (m.liberado ? 'liberado' : '—'), m.plano ?? '—', m.validade ? dd(m.validade) : '—'])} /> : <Vazio>Nenhuma matrícula.</Vazio>}</div>
  </>)
}

function Plano({ d }: { d: FichaPlano }) {
  if (!d.temPlano || !d.plano) return <Vazio>Este aluno ainda não gerou o Cronograma Adaptativo.</Vazio>
  const p = d.plano
  return (<>
    <div className="rounded-xl bg-muted p-4"><div className="flex items-baseline justify-between"><b>{p.titulo ?? 'Plano de estudos'}{p.pausado ? ' · pausado' : ''}</b><span className="text-2xl font-bold tabular-nums">{p.pct}%</span></div>
      <Barra pct={p.pct} />
      <p className="mt-2 text-xs text-muted-foreground">{p.feitas} de {p.total} metas concluídas · {p.naoRealizadas} não realizadas · <b className={p.atrasadas ? 'text-amber-600 dark:text-amber-400' : ''}>{p.atrasadas} atrasadas</b> · início {p.inicio ? dd(p.inicio) : dd(p.criadoEm)}{p.semanaAtual != null ? ` · semana ${p.semanaAtual}` : ''}{d.planosOutros ? ` · +${d.planosOutros} outro(s) plano(s)` : ''}</p></div>
    <div><H>Metas por tipo</H><Tab cab={['Tipo', 'Concluídas', 'Total']} linhas={d.porTipo.map((t) => [t.tipo, t.feitas, t.total])} /></div>
    <div><H>Metas por semana</H><div className="grid max-h-72 gap-1.5 overflow-y-auto pr-1">{d.semanas.map((s) => (
      <div key={s.semana} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-2 text-xs"><span className="text-muted-foreground">Semana {s.semana}</span><Barra pct={s.total ? (s.feitas / s.total) * 100 : 0} /><span className="tabular-nums">{s.feitas}/{s.total}{s.atrasadas ? <b className="ml-1 text-amber-600 dark:text-amber-400">· {s.atrasadas} atras.</b> : null}</span></div>))}</div></div>
  </>)
}

function Desempenho({ d }: { d: FichaDesempenho }) {
  return (<>
    <div className="grid gap-3 sm:grid-cols-4">{[['Simulados feitos', String(d.feitos)], ['Nota média', d.notaMedia == null ? '—' : String(d.notaMedia).replace('.', ',')], ['Melhor nota', d.melhorNota == null ? '—' : String(d.melhorNota).replace('.', ',')], ['Em andamento', String(d.emAndamento)]].map(([r, v]) => (
      <div key={r} className="rounded-xl bg-muted p-3.5"><div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{r}</div><div className="mt-1 text-2xl font-bold tabular-nums">{v}</div></div>))}</div>
    <div><H>Acerto por disciplina {d.amostraSessoes ? <span className="font-normal text-muted-foreground">(últimos {d.amostraSessoes} simulados)</span> : null}</H>
      {d.disciplinas.length ? <div className="grid gap-1.5">{d.disciplinas.map((x) => (<div key={x.nome} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-2 text-xs"><span className="truncate" title={x.nome}>{x.nome}</span><Barra pct={x.pct} /><span className="tabular-nums">{x.pct}% <span className="text-muted-foreground">({x.acertos}/{x.total})</span></span></div>))}</div> : <Vazio>Sem respostas registradas.</Vazio>}</div>
    <div><H>Simulados recentes</H>{d.sessoes.length ? <Tab cab={['Simulado', 'Situação', 'Nota', 'Acertos', 'Posição', 'Data']} linhas={d.sessoes.map((s) => [s.simulado ?? '—', s.status === 'finalizada' ? 'Finalizada' : s.status === 'em_andamento' ? 'Em andamento' : s.status, s.nota == null ? '—' : String(s.nota).replace('.', ','), s.total ? `${s.acertos}/${s.total}` : '—', s.posicao ?? '—', dd(s.finalizadoEm ?? s.iniciadoEm)])} /> : <Vazio>Nenhum simulado realizado.</Vazio>}</div>
  </>)
}

function Leitura({ d }: { d: FichaLeitura }) {
  return (<>
    <div className="grid gap-3 sm:grid-cols-3">{[['Documentos iniciados', String(d.iniciados)], ['Concluídos', String(d.concluidos)], ['Tempo total de leitura', d.tempoTotalSeg ? dur(d.tempoTotalSeg) : '—']].map(([r, v]) => (
      <div key={r} className="rounded-xl bg-muted p-3.5"><div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{r}</div><div className="mt-1 text-2xl font-bold tabular-nums">{v}</div></div>))}</div>
    {d.ultimoPonto && <p className="text-sm">Última leitura: <b>{d.ultimoPonto.documento ?? 'documento'}</b> em {dt(d.ultimoPonto.em)}</p>}
    <div><H>Documentos lidos (mais recentes)</H>{d.documentos.length ? <Tab cab={['Documento', 'Progresso', 'Tempo', 'Última leitura']} linhas={d.documentos.map((x) => [x.titulo ?? '(removido)', `${x.pct}%${x.concluidoEm ? ' · concluído' : ''}`, dur(x.tempoSeg), dt(x.atualizadoEm)])} /> : <Vazio>Nenhuma leitura registrada.</Vazio>}</div>
    <div><H>Tempo por frente (30 dias)</H>{d.tempo30d.length ? <Tab cab={['Frente', 'Tempo', 'Páginas']} linhas={d.tempo30d.map((t) => [t.frente, dur(t.segundos), t.paginas || '—'])} /> : <Vazio>Sem tempo registrado.</Vazio>}</div>
  </>)
}

function Atendimento({ d }: { d: FichaAtendimento }) {
  return (<>
    <div><H>Dúvidas</H>{d.duvidas.length ? <Tab cab={['Título', 'Situação', 'Aberta em', 'Última mensagem']} linhas={d.duvidas.map((x) => [x.titulo ?? '—', x.status === 'aberta' ? 'Aguardando' : x.status === 'respondida' ? 'Respondida' : 'Resolvida', dt(x.criadoEm), dt(x.ultimaMsgEm)])} /> : <Vazio>Nenhuma dúvida.</Vazio>}</div>
    <div><H>Requerimentos</H>{d.requerimentos.length ? <Tab cab={['Protocolo', 'Tipo', 'Situação', 'Descrição', 'Aberto em']} linhas={d.requerimentos.map((x) => [x.protocolo ?? '—', x.tipo ?? '—', x.status ?? '—', <span key="d" className="line-clamp-2">{x.descricao ?? '—'}</span>, dt(x.criadoEm)])} /> : <Vazio>Nenhum requerimento.</Vazio>}</div>
    <div><H>Reportes de questão</H>{d.reportes.length ? <Tab cab={['Tipo', 'Mensagem', 'Situação', 'Data']} linhas={d.reportes.map((x) => [x.tipo ?? '—', <span key="m" className="line-clamp-2">{x.mensagem ?? '—'}</span>, x.status ?? '—', dt(x.criadoEm)])} /> : <Vazio>Nenhum reporte.</Vazio>}</div>
  </>)
}

function Historico({ d }: { d: FichaHistorico }) {
  return (<>
    <div><H>Acessos ao portal (últimos)</H>{d.acessos.length ? <Tab cab={['Data', 'E-mail usado']} linhas={d.acessos.map((a) => [dt(a.em), a.email ?? '—'])} /> : <Vazio>Nenhum login registrado.</Vazio>}</div>
    <div><H>Alterações e eventos</H>{d.eventos.length ? <Tab cab={['Data', 'Operação', 'Módulo', 'Por', 'Detalhe']} linhas={d.eventos.map((e) => [dt(e.em), e.operacao, e.entidade, e.ator ?? '—', <span key="d" className="line-clamp-2 break-all text-xs text-muted-foreground">{e.detalhe ?? '—'}</span>])} /> : <Vazio>Nenhum evento registrado.</Vazio>}</div>
    <div><H>Notificações recentes</H>{d.notificacoes.length ? <Tab cab={['Título', 'Lida', 'Data']} linhas={d.notificacoes.map((n) => [n.titulo, n.lida ? 'sim' : 'não', dt(n.em)])} /> : <Vazio>Nenhuma notificação.</Vazio>}</div>
  </>)
}
