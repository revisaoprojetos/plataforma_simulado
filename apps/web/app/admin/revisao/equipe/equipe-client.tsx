'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, ChevronDown, ChevronUp, Copy, Loader2, Lock, Plus, Search, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createRoleAction } from '@/app/admin/rbac/actions'
import { criarAdministradorAction, removerAcessoAdminAction, trocarCargoAction } from '@/app/admin/administradores/actions'
import { AREAS_EQUIPE, NIVEL_ROTULO, rotuloPapel, type EquipeDados, type Nivel, type PapelEquipe } from '@/lib/admin/revisao/equipe-tipos'
import { definirNivelAreaAction } from './actions'

// Permissões da equipe: matriz papéis × áreas (clique cicla não vê → vê → edita), pessoas e criação de papel /
// convite. Tudo grava no RBAC real via server actions (checkPermission no servidor); a UI só reflete.

const POR_PAGINA = 10
const CAMPO = 'h-9 rounded-[10px] border bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50'

// áreas que compartilham o mesmo recurso do RBAC (andam juntas) — o cabeçalho avisa
const COMPARTILHA = (() => {
  const por = new Map<string, string[]>()
  for (const a of AREAS_EQUIPE) por.set(a.recurso, [...(por.get(a.recurso) ?? []), a.nome])
  return new Map(AREAS_EQUIPE.map((a) => [a.id, (por.get(a.recurso) ?? []).filter((n) => n !== a.nome)]))
})()

function Celula({ papel, areaId, nivel, onCiclo, ocupado, semPerm }: { papel: PapelEquipe; areaId: string; nivel: Nivel; onCiclo: () => void; ocupado: boolean; semPerm?: boolean }) {
  const travado = !papel.editavel || !!semPerm
  const cls = nivel === 2 ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : nivel === 1 ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : 'bg-muted text-muted-foreground'
  const nome = AREAS_EQUIPE.find((a) => a.id === areaId)?.nome ?? ''
  return (
    <button type="button" onClick={onCiclo} disabled={travado || ocupado}
      title={semPerm ? 'Permissão desta área ainda não cadastrada no banco (migration pendente)' : travado ? (papel.acessoTotal ? 'Acesso total: não depende da matriz' : 'Papel de sistema: não editável aqui') : 'Clique para trocar'}
      aria-label={`${papel.rotulo} em ${nome}: ${NIVEL_ROTULO[nivel]}`}
      className={cn('min-w-14 rounded-lg px-2.5 py-1.5 text-xs font-bold transition', cls, !travado && 'hover:brightness-95', travado && 'cursor-not-allowed opacity-80')}>
      {nivel === 2 ? 'Edita' : nivel === 1 ? 'Vê' : '—'}
    </button>
  )
}

export function EquipeClient({ dados, podeGerenciar }: { dados: EquipeDados; podeGerenciar: boolean }) {
  const router = useRouter()
  const [pend, start] = useTransition()
  const [painel, setPainel] = useState<'papel' | 'convite' | null>(null)
  const [niveis, setNiveis] = useState<Record<string, Record<string, Nivel>>>(() => Object.fromEntries(dados.papeis.map((p) => [p.id, p.niveis])))
  const [ocupadoCel, setOcupadoCel] = useState<string | null>(null)
  const [confirmar, setConfirmar] = useState<string | null>(null)
  const [novoPapel, setNovoPapel] = useState('')
  const [conv, setConv] = useState({ nome: '', email: '', cargo: dados.papeis.find((p) => !p.acessoTotal)?.nome ?? dados.papeis[0]?.nome ?? '' })
  const [senhaGerada, setSenhaGerada] = useState<string | null>(null)
  // lista de pessoas: busca + filtro por papel + ordenação + paginação
  const [busca, setBusca] = useState('')
  const [fPapel, setFPapel] = useState('')
  const [ordem, setOrdem] = useState<{ col: 'nome' | 'cargo' | 'ultimo'; asc: boolean }>({ col: 'nome', asc: true })
  const [pag, setPag] = useState(1)

  const papeisNomes = dados.papeis.map((p) => p.nome)
  const ciclo = (papel: PapelEquipe, areaId: string) => {
    const atual = niveis[papel.id]?.[areaId] ?? 0
    const novo = ((atual + 1) % 3) as Nivel
    const chave = `${papel.id}:${areaId}`
    setOcupadoCel(chave)
    setNiveis((n) => ({ ...n, [papel.id]: { ...n[papel.id], [areaId]: novo } }))
    start(async () => {
      const r = await definirNivelAreaAction(papel.id, areaId, novo)
      if (!r.ok) { setNiveis((n) => ({ ...n, [papel.id]: { ...n[papel.id], [areaId]: atual } })); toast.error(r.error ?? 'Não foi possível alterar.') }
      else router.refresh()
      setOcupadoCel(null)
    })
  }

  const criarPapel = () => start(async () => {
    const nome = novoPapel.trim()
    if (!nome) { toast.error('Dê um nome ao papel'); return }
    const r = await createRoleAction(nome, '')
    if (!r.ok) { toast.error(r.error ?? 'Erro ao criar o papel.'); return }
    toast.success(`Papel ${nome} criado. Marque o que ele pode fazer.`)
    setNovoPapel(''); setPainel(null); router.refresh()
  })

  const convidar = () => start(async () => {
    const email = conv.email.trim()
    if (!/^\S+@\S+\.\S+$/.test(email)) { toast.error('Confira o e-mail'); return }
    const r = await criarAdministradorAction({ nome: conv.nome.trim() || email.split('@')[0], email, cargo: conv.cargo })
    if (!r.ok) { toast.error(r.error ?? 'Erro ao convidar.'); return }
    toast.success(r.jaExistia ? 'Pessoa já tinha conta: acesso liberado.' : 'Acesso criado.')
    if (r.senha) setSenhaGerada(r.senha); else { setPainel(null) }
    setConv((c) => ({ ...c, nome: '', email: '' })); router.refresh()
  })

  const trocar = (userId: string, cargo: string) => start(async () => {
    const r = await trocarCargoAction(userId, cargo)
    if (!r.ok) toast.error(r.error ?? 'Erro ao trocar o papel.'); else { toast.success('Papel alterado'); router.refresh() }
  })
  const tirar = (userId: string) => start(async () => {
    const r = await removerAcessoAdminAction(userId)
    setConfirmar(null)
    if (!r.ok) toast.error(r.error ?? 'Erro ao tirar o acesso.'); else { toast.success('Acesso ao admin retirado'); router.refresh() }
  })

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const f = dados.pessoas.filter((p) => (!fPapel || p.cargo === fPapel) && (!q || `${p.nome ?? ''} ${p.emailMascarado} ${p.cargo}`.toLowerCase().includes(q)))
    const chave = (p: (typeof f)[number]) => (ordem.col === 'nome' ? (p.nome ?? p.emailMascarado) : ordem.col === 'cargo' ? p.cargo : p.ultimoAcesso)
    return f.sort((a, b) => chave(a).localeCompare(chave(b), 'pt-BR') * (ordem.asc ? 1 : -1))
  }, [dados.pessoas, busca, fPapel, ordem])
  const totalPag = Math.max(1, Math.ceil(lista.length / POR_PAGINA))
  const visiveis = lista.slice((Math.min(pag, totalPag) - 1) * POR_PAGINA, Math.min(pag, totalPag) * POR_PAGINA)
  const th = (col: 'nome' | 'cargo' | 'ultimo', rot: string) => (
    <th className="px-3 py-3"><button type="button" onClick={() => setOrdem((o) => ({ col, asc: o.col === col ? !o.asc : true }))} className="inline-flex items-center gap-1 uppercase">
      {rot}{ordem.col === col && (ordem.asc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}</button></th>
  )

  return (
    <div className="space-y-4">
      {podeGerenciar && (
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => { setPainel(painel === 'papel' ? null : 'papel'); setSenhaGerada(null) }} className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-background px-3 text-sm font-medium transition hover:bg-muted"><Plus className="h-4 w-4" />Criar papel</button>
          <button type="button" onClick={() => { setPainel(painel === 'convite' ? null : 'convite'); setSenhaGerada(null) }} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90"><Plus className="h-4 w-4" />Convidar pessoa da equipe</button>
        </div>
      )}

      {painel === 'convite' && (
        <section className="rounded-2xl border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Convidar pessoa da equipe</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs font-medium">Nome (opcional)<input className={CAMPO} value={conv.nome} onChange={(e) => setConv({ ...conv, nome: e.target.value })} placeholder="Nome da pessoa" /></label>
            <label className="flex flex-col gap-1 text-xs font-medium">E-mail<input className={CAMPO} type="email" value={conv.email} onChange={(e) => setConv({ ...conv, email: e.target.value })} placeholder="email@empresa.com.br" /></label>
            <label className="flex flex-col gap-1 text-xs font-medium">Papel<select className={CAMPO} value={conv.cargo} onChange={(e) => setConv({ ...conv, cargo: e.target.value })}>{dados.papeis.map((p) => <option key={p.id} value={p.nome}>{p.rotulo}</option>)}</select></label>
          </div>
          {senhaGerada && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-amber-200">
              <span>Senha provisória (aparece só agora):</span><code className="rounded bg-background/60 px-2 py-0.5 font-mono">{senhaGerada}</code>
              <button type="button" onClick={() => { void navigator.clipboard.writeText(senhaGerada); toast.success('Senha copiada') }} className="inline-flex items-center gap-1 text-xs underline"><Copy className="h-3 w-3" />copiar</button>
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={convidar} disabled={pend} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">{pend ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Dar acesso</button>
            <button type="button" onClick={() => { setPainel(null); setSenhaGerada(null) }} className="inline-flex h-9 items-center rounded-lg border bg-background px-3 text-sm font-medium hover:bg-muted">{senhaGerada ? 'Fechar' : 'Cancelar'}</button>
          </div>
        </section>
      )}
      {painel === 'papel' && (
        <section className="rounded-2xl border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Criar papel</h2>
          <label className="flex max-w-md flex-col gap-1 text-xs font-medium">Nome do papel
            <input className={CAMPO} value={novoPapel} onChange={(e) => setNovoPapel(e.target.value)} placeholder="Ex.: Monitoria" />
            <small className="font-normal text-muted-foreground">O papel novo começa sem acesso a nada. Depois marque o que ele pode ver ou editar.</small>
          </label>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={criarPapel} disabled={pend} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"><Check className="h-4 w-4" />Criar papel</button>
            <button type="button" onClick={() => setPainel(null)} className="inline-flex h-9 items-center rounded-lg border bg-background px-3 text-sm font-medium hover:bg-muted">Cancelar</button>
          </div>
        </section>
      )}

      <section className="rounded-2xl border bg-card py-4">
        <div className="px-4 pb-3"><h2 className="text-sm font-semibold">O que cada papel pode fazer</h2><p className="text-[11px] text-muted-foreground">Clique numa célula para trocar entre não vê, vê e edita</p></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-y text-left text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              <th className="sticky left-0 z-10 min-w-40 bg-card px-4 py-3">Papel</th>
              {AREAS_EQUIPE.map((a) => (
                <th key={a.id} className="min-w-24 px-2 py-3 text-center" title={COMPARTILHA.get(a.id)?.length ? `Usa a mesma permissão de: ${COMPARTILHA.get(a.id)!.join(', ')}` : undefined}>
                  {a.nome}{!!COMPARTILHA.get(a.id)?.length && <span className="block text-[9px] font-medium normal-case opacity-70">junto com {COMPARTILHA.get(a.id)![0]}</span>}
                </th>
              ))}
            </tr></thead>
            <tbody>
              {dados.papeis.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="sticky left-0 z-10 bg-card px-4 py-3 align-middle">
                    <b className="flex items-center gap-1.5">{p.rotulo}{!p.editavel && <Lock className="h-3 w-3 text-muted-foreground" aria-label="não editável" />}</b>
                    <span className="text-xs text-muted-foreground">{p.acessoTotal ? 'acesso total · ' : ''}{p.pessoas} pessoa{p.pessoas === 1 ? '' : 's'}</span>
                  </td>
                  {AREAS_EQUIPE.map((a) => (
                    <td key={a.id} className="px-2 py-2.5 text-center">
                      <Celula papel={p} areaId={a.id} nivel={niveis[p.id]?.[a.id] ?? 0} semPerm={dados.areasSemPermissao.includes(a.id)} ocupado={ocupadoCel === `${p.id}:${a.id}` || !podeGerenciar} onCiclo={() => ciclo(p, a.id)} />
                    </td>
                  ))}
                </tr>
              ))}
              {dados.papeis.length === 0 && <tr><td colSpan={AREAS_EQUIPE.length + 1} className="px-4 py-6 text-muted-foreground">Nenhum papel de equipe cadastrado.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border bg-card py-4">
        <div className="flex flex-wrap items-end justify-between gap-3 px-4 pb-3">
          <div><h2 className="text-sm font-semibold">Pessoas da equipe</h2><p className="text-[11px] text-muted-foreground">Troque o papel de alguém ou tire o acesso ao admin</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><input className={cn(CAMPO, 'pl-8')} placeholder="Buscar pessoa ou papel" value={busca} onChange={(e) => { setBusca(e.target.value); setPag(1) }} aria-label="Buscar" /></span>
            <select className={CAMPO} value={fPapel} onChange={(e) => { setFPapel(e.target.value); setPag(1) }} aria-label="Filtrar por papel"><option value="">Todos os papéis</option>{papeisNomes.map((n) => <option key={n} value={n}>{rotuloPapel(n)}</option>)}</select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-y text-left text-[11px] font-bold tracking-wide text-muted-foreground">{th('nome', 'E-mail')}{th('cargo', 'Papel')}{th('ultimo', 'Último acesso')}<th className="px-3 py-3" /></tr></thead>
            <tbody>
              {visiveis.map((m) => (
                <tr key={m.userId} className="border-b last:border-0">
                  <td className="px-4 py-3"><b>{m.nome ?? m.emailMascarado}</b>{m.nome && <span className="block text-xs text-muted-foreground">{m.emailMascarado}</span>}{!m.ativo && <span className="block text-xs text-amber-700 dark:text-amber-400">acesso desativado</span>}</td>
                  <td className="px-3 py-3">
                    <select className={CAMPO} disabled={!podeGerenciar || pend} value={m.cargo} onChange={(e) => trocar(m.userId, e.target.value)} aria-label="Papel">
                      {!papeisNomes.includes(m.cargo) && <option value={m.cargo}>{rotuloPapel(m.cargo)}</option>}
                      {dados.papeis.map((p) => <option key={p.id} value={p.nome}>{p.rotulo}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-3">{m.ultimoAcesso}</td>
                  <td className="px-3 py-3 text-right">
                    {podeGerenciar && !m.ehVoce && (confirmar === m.userId
                      ? <span className="inline-flex items-center gap-1.5 text-xs">Tirar o acesso?
                          <button type="button" onClick={() => tirar(m.userId)} className="rounded-lg bg-destructive/10 px-2 py-1 font-semibold text-destructive hover:bg-destructive/20">Sim</button>
                          <button type="button" onClick={() => setConfirmar(null)} className="rounded-lg border px-2 py-1 hover:bg-muted">Não</button></span>
                      : <button type="button" onClick={() => setConfirmar(m.userId)} className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border bg-background px-3 text-[13px] font-medium hover:bg-muted"><Lock className="h-3.5 w-3.5" />Tirar acesso</button>)}
                    {m.ehVoce && <span className="text-xs text-muted-foreground">você</span>}
                  </td>
                </tr>
              ))}
              {visiveis.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-muted-foreground">Ninguém encontrado.</td></tr>}
            </tbody>
          </table>
        </div>
        {totalPag > 1 && (
          <div className="flex items-center justify-between px-4 pt-3 text-xs text-muted-foreground">
            <span>{lista.length} pessoas · página {Math.min(pag, totalPag)} de {totalPag}</span>
            <span className="flex gap-1.5"><button type="button" disabled={pag <= 1} onClick={() => setPag(pag - 1)} className="rounded-lg border px-2.5 py-1 hover:bg-muted disabled:opacity-40">Anterior</button><button type="button" disabled={pag >= totalPag} onClick={() => setPag(pag + 1)} className="rounded-lg border px-2.5 py-1 hover:bg-muted disabled:opacity-40">Próxima</button></span>
          </div>
        )}
      </section>
    </div>
  )
}
