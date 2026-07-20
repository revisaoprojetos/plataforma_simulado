'use client'

import { useState, useTransition, useEffect, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog'
import { Loader2, Plug, Check, AlertTriangle, Trash2, RefreshCw, Copy, DownloadCloud, KeyRound, GitBranch, Radio, RotateCw, Eye, Users, UserPlus, Search, Inbox, Braces, X, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { JsonViewer } from '@/components/admin/json-viewer'
import { ModalRequisicao } from '@/components/admin/modal-requisicao'
import { CAMPOS_PROVIDER, PROVIDER_META } from '@/app/admin/integracoes/campos'
import {
  salvarIntegracaoConfig, testarIntegracao, listarFontes, salvarMapeamento, excluirMapeamento, rodarImportIntegracao,
  listarEventos, reprocessarEvento, getEventoDetalhe, regenerarWebhookToken, testarWebhookInbound, type EventoDTO, type EventoDetalhe,
  listarAssinaturasSalvas, sincronizarAssinaturas, aplicarAssinaturasGuru, type AssinaturaGuruDTO,
  listarWebhookInbox, getWebhookInboxDetalhe, type InboxDTO, type InboxDetalhe,
  getMapaConfig, salvarMapaConfig, reprocessarLiberacoes,
  processarRecebido, processarRecebidosTodos,
  getReconciliacao, salvarReconciliacao, rodarReconciliacaoAgora,
} from '@/app/admin/integracoes/actions'
import type { Provider } from '@/lib/integracoes/tipos'
import { CAMPOS_MAPA } from '@/lib/integracoes/mapa-campos'
import { getStr, flattenPaths } from '@/lib/integracoes/jsonpath'
import { autoMapear, type AutoMatch } from '@/lib/integracoes/automap'
import { ehProdutoPassaporte, mapStatusMapa } from '@/lib/integracoes/normalizar-mapa'

interface Config { ativo: boolean; baseUrl: string; camposPreenchidos: string[]; webhookToken: string | null; cripto: boolean }
interface Mapeamento { id: string; fonteRef: string; fonteNome: string | null; classificacao: string | null; grupoId: string | null; pastaId: string | null; simuladoId: string | null; ativo: boolean }
interface Grupo { id: string; nome: string }
interface Fonte { ref: string; nome: string; total?: number }

type Aba = 'credenciais' | 'mapeamentos' | 'importar' | 'eventos' | 'assinaturas' | 'recebidos' | 'mapa'
const SEM = '__sem__'

export function IntegracaoProviderClient({ provider, appUrl, config, mapeamentos, gruposSistema, pastasSistema = [], simuladosSistema, mapaInicial }: {
  provider: Provider; appUrl: string; config: Config; mapeamentos: Mapeamento[]; gruposSistema: Grupo[]; pastasSistema?: Grupo[]; simuladosSistema: Grupo[]
  mapaInicial?: { mapa: Record<string, string>; ultimoPayload: unknown | null }
}) {
  const meta = PROVIDER_META[provider]
  const campos = CAMPOS_PROVIDER[provider]
  // Área (só para provedores push, ex.: Guru): separa COLETA (API/User Token) de RECEBIMENTO (Webhook/Account Token).
  const [area, setArea] = useState<'api' | 'webhook'>('api')
  const [aba, setAba] = useState<Aba | null>(null)

  // Ordem: as VISÕES primeiro, a CONFIGURAÇÃO por último (não abrir direto nas configs).
  const abas: { id: Aba; label: string; Icon: any }[] = meta.push
    ? (area === 'api'
        ? [
            { id: 'assinaturas', label: 'Assinaturas', Icon: Users },
            { id: 'mapeamentos', label: 'Mapeamentos', Icon: GitBranch },
            { id: 'credenciais', label: 'Credenciais', Icon: KeyRound },
          ]
        : [
            { id: 'recebidos', label: 'Recebidos', Icon: Inbox },
            { id: 'eventos', label: 'Eventos', Icon: Radio },
            { id: 'mapa', label: 'Mapa JSON', Icon: Braces },
            { id: 'credenciais', label: 'Configuração', Icon: KeyRound },
          ])
    : [
        { id: 'recebidos', label: 'Recebidos', Icon: Inbox },
        { id: 'importar', label: 'Importar', Icon: DownloadCloud },
        { id: 'mapeamentos', label: 'Mapeamentos', Icon: GitBranch },
        { id: 'credenciais', label: 'Credenciais', Icon: KeyRound },
      ]

  // Aba ativa: a escolhida (se existe na área atual) OU a primeira (uma visão, nunca a config).
  const abaAtiva: Aba = aba && abas.some((a) => a.id === aba) ? aba : abas[0].id

  // Ao trocar de área, volta para a 1ª aba (visão) da nova área.
  const trocarArea = (a: 'api' | 'webhook') => { setArea(a); setAba(null) }

  return (
    <div className="space-y-4">
      {meta.push && (
        <div className="inline-flex rounded-xl border bg-muted/40 p-1">
          <button type="button" onClick={() => trocarArea('api')}
            className={cn('inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors', area === 'api' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            <DownloadCloud className="h-4 w-4" /> Coleta via API
          </button>
          <button type="button" onClick={() => trocarArea('webhook')}
            className={cn('inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors', area === 'webhook' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            <Radio className="h-4 w-4" /> Recebimento via Webhook
          </button>
        </div>
      )}

      {meta.push && (
        <p className="text-xs text-muted-foreground">
          {area === 'api'
            ? 'Puxa dados da Guru pela API (User Token) — sincroniza assinaturas e adiciona alunos manualmente.'
            : 'Recebe eventos em tempo real por webhook (Account Token) — a Guru envia cada compra/assinatura.'}
        </p>
      )}

      <div className="flex gap-1 border-b">
        {abas.map(({ id, label, Icon }) => (
          <button key={id} type="button" onClick={() => setAba(id)}
            className={cn('inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors', abaAtiva === id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {abaAtiva === 'credenciais' && <Credenciais provider={provider} appUrl={appUrl} config={config} meta={meta} campos={campos} area={meta.push ? area : undefined} />}
      {abaAtiva === 'mapeamentos' && <Mapeamentos provider={provider} mapeamentos={mapeamentos} gruposSistema={gruposSistema} pastasSistema={pastasSistema} simuladosSistema={simuladosSistema} />}
      {abaAtiva === 'assinaturas' && meta.push && <Assinaturas provider={provider} />}
      {abaAtiva === 'importar' && !meta.push && <Importar provider={provider} />}
      {abaAtiva === 'eventos' && meta.push && <Eventos provider={provider} />}
      {abaAtiva === 'recebidos' && (meta.push || provider === 'curseduca') && <Recebidos provider={provider} appUrl={appUrl} token={config.webhookToken} />}
      {abaAtiva === 'mapa' && meta.push && <MapaJson provider={provider} inicial={mapaInicial} />}
    </div>
  )
}

// ── Assinaturas (Guru): analisa quem comprou e adiciona ao sistema ────────────
function Assinaturas({ provider }: { provider: Provider }) {
  const [itens, setItens] = useState<AssinaturaGuruDTO[] | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [busca, setBusca] = useState('')
  const [syncEm, setSyncEm] = useState<string | null>(null)
  const [nuncaSync, setNuncaSync] = useState(false)
  const [carregando, start] = useTransition()
  const [sincronizando, startSync] = useTransition()
  const [aplicando, startAplicar] = useTransition()
  const nomeProv = PROVIDER_META[provider].nome

  // Lê da BASE local (rápido, sem tocar a API).
  const carregar = () => start(async () => {
    const r = await listarAssinaturasSalvas(provider)
    if (!r.ok) { toast.error(r.error ?? 'Erro ao ler a base'); setItens([]); return }
    setItens(r.itens ?? [])
    setSyncEm(r.sincronizadoEm ?? null)
    setNuncaSync(!!r.nuncaSync)
    setSel(new Set())
  })

  // Toca a API do provedor e grava na base; depois relê a base.
  const sincronizar = () => startSync(async () => {
    const r = await sincronizarAssinaturas(provider)
    if (!r.ok) { toast.error(r.error ?? 'Falha ao sincronizar'); return }
    toast.success(`Sincronizado: ${r.total ?? 0} assinatura(s) da ${nomeProv}`)
    carregar()
  })

  useEffect(() => { carregar() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fmtSync = (iso: string | null) => {
    if (!iso) return 'nunca sincronizado'
    const d = new Date(iso), min = Math.round((Date.now() - d.getTime()) / 60000)
    const quando = min < 1 ? 'agora há pouco' : min < 60 ? `há ${min} min` : min < 1440 ? `há ${Math.round(min / 60)} h` : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    return `última sincronização ${quando}`
  }

  const filtrados = (itens ?? []).filter((a) => {
    const q = busca.trim().toLowerCase()
    // Inclui o ID do produto (produtoRef) além do nome → dá p/ filtrar por "1783709089".
    return !q || `${a.nome} ${a.email ?? ''} ${a.cpf ?? ''} ${a.produtoNome ?? ''} ${a.produtoRef ?? ''}`.toLowerCase().includes(q)
  })
  const key = (a: AssinaturaGuruDTO) => `${a.pessoaExternalId}::${a.entExternalId}`
  const toggle = (a: AssinaturaGuruDTO) => setSel((p) => { const n = new Set(p); const k = key(a); n.has(k) ? n.delete(k) : n.add(k); return n })
  const selecionaveis = filtrados // permite reaplicar mesmo os já no sistema (idempotente)
  const todosMarcados = selecionaveis.length > 0 && selecionaveis.every((a) => sel.has(key(a)))
  const marcarTodos = () => setSel(todosMarcados ? new Set() : new Set(selecionaveis.map(key)))

  const aplicar = () => {
    const escolhidos = (itens ?? []).filter((a) => sel.has(key(a)))
    if (!escolhidos.length) { toast.error('Selecione ao menos uma assinatura.'); return }
    startAplicar(async () => {
      const r = await aplicarAssinaturasGuru(provider, escolhidos)
      if (!r.ok) { toast.error(r.error ?? 'Erro ao adicionar'); return }
      const s = r.resumo!
      toast.success(`${s.concedidos} com acesso · ${s.criados} aluno(s) · ${s.semMapeamento} sem mapeamento${s.erros ? ` · ${s.erros} erro(s)` : ''}`)
      carregar()
    })
  }

  const badge = (a: AssinaturaGuruDTO) => {
    const cor = a.status === 'ativo' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
      : a.status === 'cancelado' || a.status === 'reembolsado' ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
      : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
    return <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', cor)}>{a.status}</span>
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, e-mail, CPF, produto ou ID do produto…" className="pl-8" />
        </div>
        <Button variant="outline" onClick={sincronizar} disabled={sincronizando || carregando}>
          {sincronizando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DownloadCloud className="mr-2 h-4 w-4" />} Sincronizar da {nomeProv}
        </Button>
        <Button onClick={aplicar} disabled={aplicando || sel.size === 0}>
          {aplicando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />} Confirmar e adicionar ({sel.size})
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        A lista vem da <b>base salva no sistema</b> (rápida e sem sobrecarregar a API). Clique em <b>Sincronizar da {nomeProv}</b> para atualizar a base com o que há na plataforma — a API só é consultada nesse momento. Depois, marque e clique em <b>Confirmar e adicionar</b>: cria o aluno e, se o produto estiver mapeado, já concede o acesso/grupo. O <b>webhook</b> mantém a base em dia automaticamente a cada nova compra.
      </p>
      {itens !== null && (
        <p className="text-[11px] text-muted-foreground">
          {(itens?.length ?? 0)} na base · {fmtSync(syncEm)}
        </p>
      )}

      {itens === null ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Lendo a base…</div>
      ) : filtrados.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {nuncaSync
            ? <>A base ainda está vazia. Clique em <b>Sincronizar da {nomeProv}</b> para trazer as assinaturas (verifique antes o User Token em Credenciais).</>
            : busca.trim()
              ? <>Nenhum resultado para “{busca}”.</>
              : <>Nenhuma assinatura na base. Clique em <b>Sincronizar da {nomeProv}</b> para atualizar.</>}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-10 px-3 py-2"><input type="checkbox" checked={todosMarcados} onChange={marcarTodos} /></th>
                <th className="px-3 py-2">Comprador</th>
                <th className="px-3 py-2">Produto</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">No sistema</th>
                <th className="px-3 py-2">Mapeado</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtrados.map((a) => {
                const on = sel.has(key(a))
                return (
                  <tr key={key(a)} className={cn('cursor-pointer transition-colors hover:bg-muted/30', on && 'bg-primary/5')} onClick={() => toggle(a)}>
                    <td className="px-3 py-2"><input type="checkbox" checked={on} onChange={() => toggle(a)} onClick={(e) => e.stopPropagation()} /></td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{a.nome}</div>
                      <div className="text-[11px] text-muted-foreground">{a.email ?? '—'}{a.cpf ? ` · ${a.cpf}` : ''}</div>
                    </td>
                    <td className="px-3 py-2">{a.produtoNome ?? a.produtoRef}</td>
                    <td className="px-3 py-2">{badge(a)}</td>
                    <td className="px-3 py-2">{a.jaNoSistema ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><Check className="h-3.5 w-3.5" /> sim</span> : <span className="text-muted-foreground">não</span>}</td>
                    <td className="px-3 py-2">{a.temMapeamento ? <span className="text-emerald-600 dark:text-emerald-400">sim</span> : <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"><AlertTriangle className="h-3.5 w-3.5" /> não</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Mapa JSON (mapeamento AUTOMÁTICO + ajuste manual das chaves do webhook) ────
function MapaJson({ provider, inicial }: { provider: Provider; inicial?: { mapa: Record<string, string>; ultimoPayload: unknown | null } }) {
  // Estado inicial vindo do SERVIDOR (instantâneo, sem esperar round-trip).
  const detInicial = (inicial?.ultimoPayload && Object.keys(inicial.mapa ?? {}).length === 0) ? autoMapear(inicial.ultimoPayload) : null
  const [mapa, setMapa] = useState<Record<string, string>>(detInicial ? Object.fromEntries(Object.entries(detInicial).map(([k, v]) => [k, v.path])) : (inicial?.mapa ?? {}))
  const [auto, setAuto] = useState<Record<string, AutoMatch>>(detInicial ?? {})
  const [payload, setPayload] = useState<unknown | null>(inicial?.ultimoPayload ?? null)
  const [ativo, setAtivo] = useState<string | null>(null)          // campo em foco (recebe o clique no JSON)
  const [carregando, start] = useTransition()
  const [salvando, startSalvar] = useTransition()
  const nomeProv = PROVIDER_META[provider].nome

  const carregar = () => start(async () => {
    const r = await getMapaConfig(provider)
    if (!r.ok) { toast.error(r.error ?? 'Erro'); return }
    const salvo = r.dados?.mapa ?? {}
    const pl = r.dados?.ultimoPayload ?? null
    setPayload(pl)
    // Se ainda não há mapa salvo e temos um payload → já detecta automaticamente.
    if (pl && Object.keys(salvo).length === 0) {
      const det = autoMapear(pl)
      setAuto(det)
      setMapa(Object.fromEntries(Object.entries(det).map(([k, v]) => [k, v.path])))
    } else {
      setMapa(salvo); setAuto({})
    }
  })
  // Só busca do servidor se NÃO veio nada pré-carregado (refina em background, não bloqueia a tela).
  useEffect(() => { if (!inicial) carregar() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const detectar = () => {
    if (!payload) { toast.error('Sem payload recebido para detectar. Envie um evento e clique em Recarregar.'); return }
    const det = autoMapear(payload)
    setAuto(det)
    setMapa((m) => ({ ...m, ...Object.fromEntries(Object.entries(det).map(([k, v]) => [k, v.path])) }))
    const n = Object.keys(det).length
    toast.success(n ? `${n} campo(s) detectado(s) automaticamente — revise e salve` : 'Não consegui detectar campos neste payload')
  }

  const paths = payload ? flattenPaths(payload) : []
  const set = (k: string, v: string) => { setMapa((m) => ({ ...m, [k]: v })); setAuto((a) => { const n = { ...a }; delete n[k]; return n }) }
  const labelAtivo = ativo ? (CAMPOS_MAPA.find((c) => c.key === ativo)?.label ?? ativo) : null
  const clicarPath = (path: string) => {
    if (ativo) { set(ativo, path); toast.success(`“${path}” → ${labelAtivo}`) }
    else { navigator.clipboard?.writeText(path); toast.message(`Copiado: ${path}`, { description: 'Clique num campo primeiro para atribuir direto.' }) }
  }
  const salvar = () => startSalvar(async () => {
    const r = await salvarMapaConfig(provider, mapa)
    if (r.ok) toast.success('Mapa salvo — os próximos webhooks usam este mapeamento'); else toast.error(r.error ?? 'Erro ao salvar')
  })
  const resolver = (k: string) => {
    const campo = CAMPOS_MAPA.find((c) => c.key === k)
    const caminho = (mapa[k]?.trim()) || campo?.padrao
    return payload ? getStr(payload, caminho) : null
  }
  const corConf = (c: number) => c >= 80 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : c >= 55 ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
  const resolvidos = payload ? CAMPOS_MAPA.filter((c) => resolver(c.key) != null).length : Object.values(mapa).filter((v) => (v ?? '').trim()).length
  const pct = Math.round((resolvidos / CAMPOS_MAPA.length) * 100)
  // Identificação (mesma regra do motor) para o payload atual: passaporte por nome + status.
  const produtoNome = resolver('produto_nome') as string | null
  const ehPass = ehProdutoPassaporte(produtoNome)
  const statusBruto = resolver('status') as string | null
  const statusMap = mapStatusMapa(statusBruto)
  const statusLabel = statusMap === 'ativo' ? 'libera acesso' : statusMap ? 'cancela acesso' : '—'

  return (
    <div className="space-y-4">
      {/* Cabeçalho: descrição + progresso + ações */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-gradient-to-br from-primary/[0.07] to-transparent p-4">
        <div className="min-w-0 max-w-xl">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Braces className="h-4 w-4 text-primary" /> Mapa do JSON</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Ligue cada campo do sistema à chave que a {nomeProv} envia. Clique num campo, depois na chave em <b>Dados recebidos</b> — ou use <b>Detectar</b>.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right leading-none">
            <p className="text-2xl font-bold tabular-nums">{resolvidos}<span className="text-sm font-medium text-muted-foreground">/{CAMPOS_MAPA.length}</span></p>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">campos ok</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={carregar} disabled={carregando}>{carregando ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />} Recarregar</Button>
            <Button variant="outline" size="sm" onClick={detectar} disabled={!payload}><RotateCw className="mr-2 h-3.5 w-3.5" /> Detectar</Button>
            <Button size="sm" onClick={salvar} disabled={salvando}>{salvando ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-2 h-3.5 w-3.5" />} Salvar</Button>
          </div>
        </div>
      </div>
      {/* Barra de progresso */}
      <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-primary to-violet-500 transition-all" style={{ width: `${pct}%` }} /></div>

      {/* Identificação do payload atual (mesma regra do motor) */}
      {payload != null && (
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="text-muted-foreground">Este produto seria:</span>
          {ehPass
            ? <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 font-semibold text-violet-600 dark:text-violet-400"><Sparkles className="h-3 w-3" /> PASSAPORTE (acesso a todos os simulados)</span>
            : <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">Normal (usa o mapeamento)</span>}
          {statusBruto && <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium">status: <b className="font-semibold">{statusBruto}</b> → {statusLabel}</span>}
        </div>
      )}

      {!payload && (
        <div className="rounded-xl border border-dashed bg-muted/20 p-4 text-center text-xs text-muted-foreground">
          <Inbox className="mx-auto mb-1.5 h-6 w-6 opacity-40" />
          Nenhum payload recebido ainda. Envie um evento (compra real ou Postman) na URL do webhook e clique em <b>Recarregar</b> — a detecção roda no JSON real.
        </div>
      )}

      <datalist id={`paths-${provider}`}>
        {paths.map((p) => <option key={p.path} value={p.path}>{p.sample ? `${p.path} — ${p.sample}` : p.path}</option>)}
      </datalist>

      {/* Grid: campos (esquerda, flexível) + JSON (direita, largura fixa, sticky, sem cortar) */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {/* Campos do sistema — UM card, linhas inline (label → input) */}
        <div className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
          {CAMPOS_MAPA.map((c) => {
            const resolvido = resolver(c.key)
            const conf = auto[c.key]?.confianca
            const emFoco = ativo === c.key
            const ok = payload != null && resolvido != null
            return (
              <div key={c.key} onClick={() => setAtivo(c.key)}
                className={cn('flex items-center gap-2.5 px-3 py-2 transition-colors', emFoco ? 'bg-primary/[0.06]' : 'hover:bg-muted/30')}>
                {/* Verificação (animada) */}
                <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-all duration-300',
                  payload == null ? 'bg-muted text-muted-foreground' : ok ? 'scale-100 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400')}
                  title={payload == null ? 'sem payload' : ok ? `= ${resolvido}` : 'não resolve neste payload'}>
                  {payload == null ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : ok ? <Check className="h-3 w-3 animate-in zoom-in" /> : <AlertTriangle className="h-3 w-3" />}
                </span>
                {/* Rótulo */}
                <div className="w-32 shrink-0">
                  <span className="flex items-center gap-1 truncate text-sm font-medium" title={c.label}>
                    {c.label}{c.obrigatorio && <span className="text-primary" title="Campo principal">★</span>}
                  </span>
                  {conf != null && <span className={cn('mt-0.5 inline-block rounded px-1 text-[9px] font-semibold', corConf(conf))} title="Detectado automaticamente">auto {conf}%</span>}
                </div>
                <span className="shrink-0 text-sky-500">→</span>
                <Input list={`paths-${provider}`} value={mapa[c.key] ?? ''} onClick={(e) => e.stopPropagation()} onFocus={() => setAtivo(c.key)} onChange={(e) => set(c.key, e.target.value)} placeholder={c.padrao} className="h-8 min-w-0 flex-1 font-mono text-xs" />
                {/* Valor que essa chave resolve no payload — largura FIXA p/ alinhar todos os inputs */}
                <span className="hidden w-44 shrink-0 truncate text-right text-[11px] font-medium md:block" title={resolvido ?? ''}>
                  {payload == null ? '' : ok ? <span className="text-emerald-600 dark:text-emerald-400">= {resolvido}</span> : <span className="text-amber-600 dark:text-amber-400">= vazio</span>}
                </span>
              </div>
            )
          })}
        </div>

        {/* Dados recebidos — JSON real clicável */}
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm lg:sticky lg:top-2">
          <div className="flex items-center gap-1.5 border-b bg-muted/30 px-3 py-2">
            <Braces className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-xs font-semibold">Dados recebidos</p>
            <span className="ml-auto truncate text-[11px] text-muted-foreground">{labelAtivo ? <>→ <b className="text-foreground">{labelAtivo}</b></> : 'clique numa chave'}</span>
          </div>
          {!payload ? (
            <p className="p-4 text-[11px] text-muted-foreground">Sem payload recebido. Envie um evento na URL do webhook e clique em <b>Recarregar</b>.</p>
          ) : (
            <div className="max-h-[62vh] overflow-auto p-3">
              <JsonViewer data={payload} onPick={clicarPath} />
            </div>
          )}
        </div>
      </div>

      <p className="px-1 text-[11px] text-muted-foreground">Dica: <b>Detectar</b> preenche tudo automaticamente; ou clique num campo e depois na chave em <b>Dados recebidos</b>. Lembre de <b>Salvar</b>.</p>
    </div>
  )
}

// ── Recebidos (inbox CRU: toda requisição que bate na URL do webhook) ─────────
function Recebidos({ provider, appUrl, token }: { provider: Provider; appUrl: string; token: string | null }) {
  const [itens, setItens] = useState<InboxDTO[] | null>(null)
  const [semTabela, setSemTabela] = useState(false)
  const [carregando, start] = useTransition()
  const [detalhe, setDetalhe] = useState<InboxDetalhe | null>(null)
  const [abrindo, setAbrindo] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [processandoId, setProcessandoId] = useState<string | null>(null)
  const [processandoTodos, startTodos] = useTransition()

  const carregar = () => start(async () => {
    const r = await listarWebhookInbox(provider)
    if (!r.ok) { toast.error(r.error ?? 'Falha ao carregar'); setItens([]); return }
    setItens(r.itens ?? []); setSemTabela(!!r.semTabela)
  })
  useEffect(() => { carregar() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const abrir = (id: string) => { setAbrindo(id); (async () => { const r = await getWebhookInboxDetalhe(provider, id); setAbrindo(null); if (r.ok && r.detalhe) setDetalhe(r.detalhe); else toast.error(r.error ?? 'Erro') })() }
  const processar = (id: string) => { setProcessandoId(id); (async () => {
    const r = await processarRecebido(provider, id); setProcessandoId(null)
    if (!r.ok) { toast.error(r.error ?? 'Falha ao processar'); return }
    toast.success(r.acao === 'concedido' ? 'Aluno criado/liberado ✓' : `Processado: ${r.acao}${r.motivo ? ` — ${r.motivo}` : ''}`)
    carregar()
  })() }
  const processarTodos = () => startTodos(async () => {
    const r = await processarRecebidosTodos(provider)
    if (!r.ok) { toast.error(r.error ?? 'Falha'); return }
    const s = r.resumo!
    toast.success(`${s.concedidos} liberado(s) · ${s.ignorados} sem efeito · ${s.erros} erro(s) (de ${s.total})`)
    carregar()
  })
  const fmt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const corStatus = (s: number | null) => s == null ? 'bg-muted text-muted-foreground' : s < 300 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : s < 500 ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'

  const urlDedicada = token ? `${appUrl}/api/webhooks/${provider}/${token}` : null
  const copiar = () => { if (!urlDedicada) return; navigator.clipboard.writeText(urlDedicada).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1500) }) }

  return (
    <div className="space-y-3">
      {/* URL dedicada deste provedor — recebe E processa a compra/assinatura */}
      <div className="flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/[0.04] p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Inbox className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">URL dedicada da {PROVIDER_META[provider].nome}</h3>
          <p className="mb-2 text-xs text-muted-foreground">Cadastre esta URL na {PROVIDER_META[provider].nome} (Webhooks de compra/assinatura). Ela <b>recebe e processa</b> o evento (cria/concede o aluno) e cada chamada aparece na lista abaixo.</p>
          {urlDedicada ? (
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md border bg-background px-2.5 py-1.5 text-xs">{urlDedicada}</code>
              <Button variant="outline" size="sm" onClick={copiar}>{copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}</Button>
            </div>
          ) : (
            <p className="text-xs text-amber-600 dark:text-amber-400">Salve as credenciais primeiro para gerar o token do webhook.</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-md text-sm text-muted-foreground">Toda requisição que chega na URL do webhook (últimas 100), <b>inclusive as que falham</b>. <b>Processar</b> aplica o dado no sistema (cria/concede o aluno) usando o Mapa JSON.</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={carregar} disabled={carregando}>{carregando ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />} Atualizar</Button>
          <Button size="sm" onClick={processarTodos} disabled={processandoTodos}>{processandoTodos ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RotateCw className="mr-2 h-3.5 w-3.5" />} Processar todos</Button>
        </div>
      </div>

      {semTabela && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
          A tabela do inbox ainda não foi criada. Aplique a migration <b>20260717000002_webhook_inbox</b> para começar a registrar as requisições.
        </div>
      )}

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr className="border-b">
              <th className="px-3 py-2 font-medium">Recebido</th>
              <th className="px-3 py-2 font-medium">Método</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Resultado</th>
              <th className="px-3 py-2 font-medium">Comprador</th>
              <th className="px-3 py-2 text-right font-medium">Ação</th>
            </tr>
          </thead>
          <tbody>
            {itens === null ? (
              <tr><td colSpan={6} className="py-8 text-center text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
            ) : itens.length === 0 ? (
              <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Nenhuma requisição recebida ainda. Cadastre a URL na {PROVIDER_META[provider].nome} e faça uma compra de teste (ou abra a URL no navegador para um ping GET).</td></tr>
            ) : itens.map((e) => (
              <tr key={e.id} className="border-b last:border-0 align-top hover:bg-muted/30">
                <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{fmt(e.recebidoEm)}</td>
                <td className="px-3 py-2 text-xs font-medium">{e.metodo}</td>
                <td className="px-3 py-2"><span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', corStatus(e.statusResp))}>{e.statusResp ?? '—'}</span></td>
                <td className="max-w-[240px] px-3 py-2 text-xs">{e.resultado ?? '—'}</td>
                <td className="px-3 py-2 text-xs">{e.comprador ?? '—'}</td>
                <td className="px-3 py-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button type="button" onClick={() => abrir(e.id)} disabled={abrindo === e.id} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-60">
                      {abrindo === e.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />} Ver
                    </button>
                    {e.metodo === 'POST' && (
                      <button type="button" onClick={() => processar(e.id)} disabled={processandoId === e.id} title="Aplicar este dado no sistema (cria/concede o aluno)" className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/5 px-2 py-1 text-xs text-primary hover:bg-primary/10 disabled:opacity-60">
                        {processandoId === e.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw className="h-3 w-3" />} Processar
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!detalhe} onOpenChange={(o) => { if (!o) setDetalhe(null) }}>
        <ModalRequisicao detalhe={detalhe} />
      </Dialog>
    </div>
  )
}


// ── Eventos (monitor dos webhooks recebidos) ──────────────────────────────────
function Eventos({ provider }: { provider: Provider }) {
  const [eventos, setEventos] = useState<EventoDTO[] | null>(null)
  const [carregando, startCarregar] = useTransition()
  const [reprocessando, setReprocessando] = useState<string | null>(null)
  const [detalhe, setDetalhe] = useState<EventoDetalhe | null>(null)
  const [abrindo, setAbrindo] = useState<string | null>(null)

  function carregar() {
    startCarregar(async () => { const r = await listarEventos(provider); if (r.ok) setEventos(r.eventos ?? []); else toast.error(r.error ?? 'Falha ao carregar') })
  }
  useEffect(() => { carregar() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function abrirDetalhe(id: string) {
    setAbrindo(id)
    ;(async () => { const r = await getEventoDetalhe(provider, id); setAbrindo(null); if (r.ok && r.detalhe) setDetalhe(r.detalhe); else toast.error(r.error ?? 'Erro') })()
  }

  function reprocessar(id: string) {
    setReprocessando(id)
    ;(async () => { const r = await reprocessarEvento(provider, id); setReprocessando(null); if (r.ok) { toast.success('Reprocessado'); carregar() } else toast.error(r.error ?? 'Erro') })()
  }

  const cor: Record<string, string> = {
    processado: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    erro: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
    recebido: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    ignorado: 'bg-muted text-muted-foreground',
    processando: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  }
  const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Webhooks recebidos da {PROVIDER_META[provider].nome} (últimos 50). Reprocesse os que deram erro.</p>
        <Button variant="outline" size="sm" onClick={carregar} disabled={carregando}>{carregando ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />} Atualizar</Button>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr className="border-b">
              <th className="px-3 py-2 font-medium">Recebido</th>
              <th className="px-3 py-2 font-medium">Tipo</th>
              <th className="px-3 py-2 font-medium">Comprador</th>
              <th className="px-3 py-2 font-medium">Produto</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Ação</th>
            </tr>
          </thead>
          <tbody>
            {eventos === null ? (
              <tr><td colSpan={6} className="py-8 text-center text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
            ) : eventos.length === 0 ? (
              <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Nenhum webhook recebido ainda.</td></tr>
            ) : eventos.map((e) => (
              <tr key={e.id} className="border-b last:border-0 align-top hover:bg-muted/30">
                <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{fmt(e.recebidoEm)}</td>
                <td className="px-3 py-2 text-xs">{e.tipo ?? '—'}</td>
                <td className="px-3 py-2 text-xs">{e.comprador ?? '—'}</td>
                <td className="max-w-[220px] truncate px-3 py-2 text-xs">{e.produto ?? '—'}</td>
                <td className="px-3 py-2"><span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', cor[e.status] ?? 'bg-muted')}>{e.status}</span>{e.erro && <span className="mt-0.5 block max-w-[220px] truncate text-[10px] text-rose-600 dark:text-rose-400" title={e.erro}>{e.erro}</span>}</td>
                <td className="px-3 py-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button type="button" onClick={() => abrirDetalhe(e.id)} disabled={abrindo === e.id} title="Ver detalhe (payload completo)" className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-60">
                      {abrindo === e.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />} Ver
                    </button>
                    {(e.status === 'erro' || e.status === 'recebido') && (
                      <button type="button" onClick={() => reprocessar(e.id)} disabled={reprocessando === e.id} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-60">
                        {reprocessando === e.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw className="h-3 w-3" />} Reprocessar
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pop-up de detalhe — payload completo (headers + query + body), estilo n8n */}
      <Dialog open={!!detalhe} onOpenChange={(o) => { if (!o) setDetalhe(null) }}>
        <DialogContent className="flex max-h-[85vh] w-[95vw] max-w-[95vw] flex-col sm:max-w-3xl">
          <DialogHeader><DialogTitle>Detalhe do webhook</DialogTitle></DialogHeader>
          {detalhe && (
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
                <span><b className="text-muted-foreground">event_id:</b> {detalhe.eventId}</span>
                <span><b className="text-muted-foreground">tipo:</b> {detalhe.tipo ?? '—'}</span>
                <span><b className="text-muted-foreground">status:</b> {detalhe.status}</span>
                <span><b className="text-muted-foreground">recebido:</b> {new Date(detalhe.recebidoEm).toLocaleString('pt-BR')}</span>
                {detalhe.processadoEm && <span><b className="text-muted-foreground">processado:</b> {new Date(detalhe.processadoEm).toLocaleString('pt-BR')}</span>}
              </div>
              {detalhe.erro && <div className="rounded-md border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">{detalhe.erro}</div>}
              <JsonBloco titulo="headers" valor={detalhe.headers} />
              {detalhe.query != null && Object.keys(detalhe.query as any).length > 0 && <JsonBloco titulo="query" valor={detalhe.query} />}
              <JsonBloco titulo="body" valor={detalhe.body} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Bloco de JSON formatado (estilo n8n) com botão de copiar. */
function JsonBloco({ titulo, valor }: { titulo: string; valor: unknown }) {
  const txt = JSON.stringify(valor ?? null, null, 2)
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
        <button type="button" onClick={() => { navigator.clipboard?.writeText(txt); toast.success('Copiado') }} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"><Copy className="h-3 w-3" /> copiar</button>
      </div>
      <pre className="max-h-72 overflow-auto rounded-lg border bg-muted/30 p-3 text-[11px] leading-relaxed"><code>{txt}</code></pre>
    </div>
  )
}

// ── Credenciais ──────────────────────────────────────────────────────────────
function Credenciais({ provider, appUrl, config, meta, campos, area }: { provider: Provider; appUrl: string; config: Config; meta: typeof PROVIDER_META[Provider]; campos: typeof CAMPOS_PROVIDER[Provider]; area?: 'api' | 'webhook' }) {
  // Filtra os campos por área: API mostra o User Token; Webhook mostra o Account Token.
  const camposArea = area === 'api' ? campos.filter((c) => c.key !== 'webhook_secret')
    : area === 'webhook' ? campos.filter((c) => c.key === 'webhook_secret')
    : campos
  const mostrarBaseUrl = area !== 'webhook'
  const mostrarTestarConexao = area !== 'webhook'
  const mostrarWebhook = area !== 'api' && (meta.push || provider === 'curseduca') // Curseduca: URL de sincronização
  const [vals, setVals] = useState<Record<string, string>>({})
  const [baseUrl, setBaseUrl] = useState(config.baseUrl || meta.baseUrlPadrao)
  const [ativo, setAtivo] = useState(config.ativo)
  const [salvando, startSalvar] = useTransition()
  const [testando, startTestar] = useTransition()
  const [testandoWh, startTestarWh] = useTransition()
  const [regenerando, startRegenerar] = useTransition()

  function salvar() {
    startSalvar(async () => {
      const r = await salvarIntegracaoConfig(provider, { baseUrl, ativo, credenciais: vals })
      if (r.ok) { toast.success('Credenciais salvas'); setVals({}) } else toast.error(r.error ?? 'Erro ao salvar')
    })
  }
  function testar() {
    startTestar(async () => {
      const r = await testarIntegracao(provider)
      if (r.ok) toast.success('Conexão OK'); else toast.error(r.error ?? 'Falha na conexão')
    })
  }
  function testarWebhook() {
    startTestarWh(async () => {
      const r = await testarWebhookInbound(provider, appUrl)
      if (r.ok) toast.success('Webhook OK — a URL recebeu o evento de teste'); else toast.error(r.error ?? 'Falha no teste do webhook')
    })
  }
  function regenerar() {
    if (!confirm('Gerar um novo token invalida a URL atual — você terá que recadastrar a nova URL na ' + meta.nome + '. Continuar?')) return
    startRegenerar(async () => {
      const r = await regenerarWebhookToken(provider)
      if (r.ok) { toast.success('Token regenerado — copie a nova URL'); location.reload() } else toast.error(r.error ?? 'Erro')
    })
  }

  const webhookUrl = config.webhookToken ? `${appUrl || ''}/api/webhooks/${provider}/${config.webhookToken}` : null

  return (
    <div className="max-w-xl space-y-4">
      {!config.cripto && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> <span><strong>APP_ENCRYPTION_KEY</strong> ausente — as credenciais serão salvas em texto puro. Defina a chave no ambiente para criptografar em repouso.</span>
        </div>
      )}

      {mostrarBaseUrl && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Base URL</label>
          <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={meta.baseUrlPadrao} />
        </div>
      )}

      {camposArea.map((c) => {
        const preenchido = config.camposPreenchidos.includes(c.key)
        return (
          <div key={c.key} className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">{c.label}{preenchido && <span className="ml-1 text-emerald-600 dark:text-emerald-400">• já configurado</span>}</label>
            <Input type={c.secret ? 'password' : 'text'} value={vals[c.key] ?? ''} onChange={(e) => setVals((v) => ({ ...v, [c.key]: e.target.value }))}
              placeholder={preenchido ? '•••••••• (deixe em branco para manter)' : `Informe ${c.label}`} />
          </div>
        )
      })}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="h-4 w-4 rounded border" />
        Integração ativa {area === 'webhook' && <span className="text-xs text-muted-foreground">(necessária para o webhook processar)</span>}
      </label>

      <div className="flex gap-2">
        <Button onClick={salvar} disabled={salvando}>{salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} Salvar</Button>
        {mostrarTestarConexao && <Button variant="outline" onClick={testar} disabled={testando}>{testando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plug className="mr-2 h-4 w-4" />} Testar conexão</Button>}
      </div>

      {mostrarWebhook && webhookUrl && (
        <div className="space-y-2 rounded-2xl border bg-card p-3 shadow-sm">
          <p className="text-xs font-semibold">{meta.push ? 'URL do webhook' : 'URL de sincronização (webhook)'}</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1 text-xs">{webhookUrl}</code>
            <Button variant="outline" size="sm" onClick={() => { navigator.clipboard?.writeText(webhookUrl); toast.success('Copiado') }} title="Copiar"><Copy className="h-3.5 w-3.5" /></Button>
          </div>
          <ol className="list-decimal space-y-0.5 pl-4 text-[11px] text-muted-foreground">
            {meta.push
              ? <><li>Copie esta URL e cadastre em <strong>{meta.nome} → Webhooks</strong> (eventos de compra/assinatura).</li><li>Salve com a <strong>Integração ativa</strong> marcada.</li></>
              : <><li>Faça <strong>POST</strong> nesta URL (n8n/Curseduca) com <code>{'{ grupos:[ids], sincronizar? }'}</code> para importar/sincronizar em tempo real.</li><li>Salve com a <strong>Integração ativa</strong> marcada. Cada chamada aparece na aba <strong>Recebidos</strong>.</li></>}
            <li>Clique em <strong>Testar webhook</strong> abaixo para confirmar que a URL responde.</li>
          </ol>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={testarWebhook} disabled={testandoWh}>{testandoWh ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Plug className="mr-2 h-3.5 w-3.5" />} Testar webhook</Button>
            <Button variant="outline" size="sm" onClick={regenerar} disabled={regenerando} className="text-muted-foreground">{regenerando ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />} Regenerar token</Button>
          </div>
          <p className="text-[11px] text-muted-foreground">Token único deste tenant. Se vazar, regenere (a URL antiga para de funcionar).</p>
        </div>
      )}
    </div>
  )
}

// ── Mapeamentos ──────────────────────────────────────────────────────────────
function Mapeamentos({ provider, mapeamentos, gruposSistema, pastasSistema, simuladosSistema }: { provider: Provider; mapeamentos: Mapeamento[]; gruposSistema: Grupo[]; pastasSistema: Grupo[]; simuladosSistema: Grupo[] }) {
  const [fontes, setFontes] = useState<Fonte[]>([])
  const [carregandoFontes, startFontes] = useTransition()
  const [salvando, startSalvar] = useTransition()
  // form
  const [fonteRef, setFonteRef] = useState('')
  const [classificacao, setClassificacao] = useState('passaporte')
  const [grupoId, setGrupoId] = useState(SEM)
  const [pastaId, setPastaId] = useState(SEM)
  const [simuladoId, setSimuladoId] = useState(SEM)

  function carregarFontes() {
    startFontes(async () => {
      const r = await listarFontes(provider)
      if (r.ok) setFontes(r.fontes ?? []); else toast.error(r.error ?? 'Falha ao carregar fontes')
    })
  }
  function salvar() {
    if (!fonteRef) { toast.error('Selecione o produto/grupo de origem'); return }
    const nome = fontes.find((f) => f.ref === fonteRef)?.nome
    startSalvar(async () => {
      const r = await salvarMapeamento(provider, { fonteRef, fonteNome: nome, classificacao, grupoId: grupoId === SEM ? null : grupoId, pastaId: pastaId === SEM ? null : pastaId, simuladoId: simuladoId === SEM ? null : simuladoId, ativo: true })
      if (r.ok) { toast.success('Mapeamento salvo'); location.reload() } else toast.error(r.error ?? 'Erro')
    })
  }
  function remover(id: string) {
    startSalvar(async () => { const r = await excluirMapeamento(provider, id); if (r.ok) location.reload(); else toast.error(r.error ?? 'Erro') })
  }
  const nomeGrupo = (id: string | null) => gruposSistema.find((g) => g.id === id)?.nome ?? '—'
  const nomePasta = (id: string | null) => pastasSistema.find((g) => g.id === id)?.nome ?? '—'
  const nomeSimulado = (id: string | null) => simuladosSistema.find((s) => s.id === id)?.nome ?? '—'
  const [reprocessando, startReproc] = useTransition()
  const reprocessar = () => startReproc(async () => {
    const r = await reprocessarLiberacoes(provider)
    if (!r.ok) { toast.error(r.error ?? 'Falha ao reprocessar'); return }
    const s = r.resumo!
    toast.success(`${s.concedidos} liberação(ões) aplicadas · ${s.total} assinaturas ativas`, {
      description: `${s.semMapeamento} sem mapeamento${s.erros ? ` · ${s.erros} erro(s)` : ''}${s.produtosSemMapa.length ? ` · produtos sem mapa: ${s.produtosSemMapa.slice(0, 5).join(', ')}` : ''}`,
    })
  })

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Diga o que cada <strong>produto</strong> comprado concede: a <strong>classificação</strong> (ex.: passaporte), e opcionalmente um <strong>grupo</strong> e/ou um <strong>simulado</strong> (matrícula automática).</p>

      {/* Reprocessar liberações (recuperação de erro) */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/25 bg-primary/[0.04] p-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Reprocessar liberações</p>
          <p className="text-[11px] text-muted-foreground">Re-aplica o acesso de <b>todas as assinaturas ativas</b> (idempotente) — corrige quem comprou mas não ficou alocado no grupo/simulado (produto mapeado depois, erro no webhook…). Não revoga nada.</p>
        </div>
        <Button variant="outline" size="sm" onClick={reprocessar} disabled={reprocessando}>
          {reprocessando ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RotateCw className="mr-2 h-3.5 w-3.5" />} Reprocessar
        </Button>
      </div>

      {/* Passo a passo */}
      <ol className="space-y-2 rounded-2xl border bg-card p-4 text-sm shadow-sm">
        {[
          <>Gere o <b>User Token</b> na Guru (perfil → aba <b>API</b>) e salve na aba <b>Credenciais</b>. O token só aparece uma vez.</>,
          <>Clique em <b>Carregar produtos/grupos</b> abaixo — a Guru lista seus produtos. (Sem token, dá pra digitar o <b>ID do produto</b> na mão.)</>,
          <>Para cada produto, defina o destino: <b>classificação</b> (passaporte), e opcional <b>grupo</b>/<b>simulado</b>. Salve.</>,
          <>Pronto: o <b>webhook</b> aplica isso <b>automaticamente</b> a cada nova compra (cria o aluno + concede). Na aba <b>Assinaturas</b> você confere/adiciona manualmente quem já comprou.</>,
        ].map((txt, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{i + 1}</span>
            <span className="text-muted-foreground [&_b]:text-foreground">{txt}</span>
          </li>
        ))}
      </ol>

      {/* Lista atual */}
      <div className="divide-y rounded-2xl border bg-card shadow-sm">
        {mapeamentos.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhum mapeamento ainda.</p>
        ) : mapeamentos.map((m) => (
          <div key={m.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
            <span className="font-medium">{m.fonteNome ?? m.fonteRef}</span>
            <span className="text-muted-foreground">→</span>
            {m.classificacao && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{m.classificacao}</span>}
            {m.grupoId && <span className="rounded-full border px-2 py-0.5 text-xs">grupo: {nomeGrupo(m.grupoId)}</span>}
            {m.pastaId && <span className="rounded-full border px-2 py-0.5 text-xs">banco: {nomePasta(m.pastaId)}</span>}
            {m.simuladoId && <span className="rounded-full border px-2 py-0.5 text-xs">simulado: {nomeSimulado(m.simuladoId)}</span>}
            <button type="button" onClick={() => remover(m.id)} className="ml-auto text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>

      {/* Novo mapeamento */}
      <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Novo mapeamento</p>
          <Button variant="outline" size="sm" onClick={carregarFontes} disabled={carregandoFontes}>
            {carregandoFontes ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />} Carregar produtos/grupos
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Produto/Grupo</label>
            {fontes.length ? (
              <Select value={fonteRef} onValueChange={(v) => setFonteRef(v ?? '')} items={Object.fromEntries(fontes.map((f) => [f.ref, f.nome]))}>
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>{fontes.map((f) => <SelectItem key={f.ref} value={f.ref}>{f.nome}</SelectItem>)}</SelectContent>
              </Select>
            ) : (
              <Input value={fonteRef} onChange={(e) => setFonteRef(e.target.value)} placeholder="ID do produto/grupo" />
            )}
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Classificação</label>
            <Select value={classificacao} onValueChange={(v) => setClassificacao(v ?? 'passaporte')} items={{ passaporte: 'Passaporte', normal: 'Normal' }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="passaporte">Passaporte</SelectItem><SelectItem value="normal">Normal</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Grupo (opcional)</label>
            <Select value={grupoId} onValueChange={(v) => setGrupoId(v ?? SEM)} items={{ [SEM]: 'Nenhum', ...Object.fromEntries(gruposSistema.map((g) => [g.id, g.nome])) }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={SEM}>Nenhum</SelectItem>{gruposSistema.map((g) => <SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Banco (libera os simulados dele)</label>
            <Select value={pastaId} onValueChange={(v) => setPastaId(v ?? SEM)} items={{ [SEM]: 'Nenhuma', ...Object.fromEntries(pastasSistema.map((g) => [g.id, g.nome])) }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={SEM}>Nenhuma</SelectItem>{pastasSistema.map((g) => <SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Simulado (opcional)</label>
            <Select value={simuladoId} onValueChange={(v) => setSimuladoId(v ?? SEM)} items={{ [SEM]: 'Nenhum', ...Object.fromEntries(simuladosSistema.map((s) => [s.id, s.nome])) }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={SEM}>Nenhum</SelectItem>{simuladosSistema.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={salvar} disabled={salvando}>{salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} Salvar mapeamento</Button>
      </div>
    </div>
  )
}

// ── Importar ─────────────────────────────────────────────────────────────────
function Importar({ provider }: { provider: Provider }) {
  const [fontes, setFontes] = useState<Fonte[]>([])
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [carregando, startFontes] = useTransition()
  const [importando, startImport] = useTransition()
  const [resumo, setResumo] = useState<{ total: number; concedidos: number; revogados: number; ignorados: number; erros: number } | null>(null)

  function carregar() {
    startFontes(async () => { const r = await listarFontes(provider); if (r.ok) setFontes(r.fontes ?? []); else toast.error(r.error ?? 'Falha ao carregar') })
  }
  function toggle(ref: string) { setSel((p) => { const n = new Set(p); n.has(ref) ? n.delete(ref) : n.add(ref); return n }) }
  function importar() {
    if (!sel.size) { toast.error('Selecione ao menos uma fonte'); return }
    startImport(async () => {
      const r = await rodarImportIntegracao(provider, [...sel])
      if (r.ok) { setResumo(r.resumo ?? null); toast.success('Importação concluída') } else toast.error(r.error ?? 'Erro na importação')
    })
  }

  return (
    <div className="space-y-4">
      {provider === 'curseduca' && <ReconciliacaoCurseduca provider={provider} />}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Importa alunos das fontes selecionadas e aplica os mapeamentos (concede acesso). É uma ação manual.</p>
        <Button variant="outline" size="sm" onClick={carregar} disabled={carregando}>{carregando ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />} Carregar fontes</Button>
      </div>

      {fontes.length > 0 && (
        <div className="max-h-80 space-y-1 overflow-y-auto rounded-lg border p-2">
          {fontes.map((f) => (
            <label key={f.ref} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
              <input type="checkbox" checked={sel.has(f.ref)} onChange={() => toggle(f.ref)} className="h-4 w-4 rounded border" />
              <span className="flex-1 truncate">{f.nome}</span>
              {f.total != null && <span className="text-xs text-muted-foreground">{f.total}</span>}
            </label>
          ))}
        </div>
      )}

      <Button onClick={importar} disabled={importando || !sel.size}>{importando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DownloadCloud className="mr-2 h-4 w-4" />} Importar {sel.size > 0 ? `(${sel.size})` : ''}</Button>

      {resumo && (
        <div className="grid grid-cols-2 gap-2 rounded-lg border p-3 text-sm sm:grid-cols-5">
          <Kpi rotulo="Total" valor={resumo.total} />
          <Kpi rotulo="Concedidos" valor={resumo.concedidos} tom="emerald" />
          <Kpi rotulo="Revogados" valor={resumo.revogados} tom="amber" />
          <Kpi rotulo="Ignorados" valor={resumo.ignorados} />
          <Kpi rotulo="Erros" valor={resumo.erros} tom={resumo.erros ? 'rose' : undefined} />
        </div>
      )}
    </div>
  )
}

// ── Reconciliação automática (Curseduca): agenda + liga/desliga ───────────────
function ReconciliacaoCurseduca({ provider }: { provider: Provider }) {
  const [fontes, setFontes] = useState<Fonte[]>([])
  const [ativo, setAtivo] = useState(false)
  const [horas, setHoras] = useState(6)
  const [grupos, setGrupos] = useState<Set<number>>(new Set())
  const [sincronizar, setSincronizar] = useState(true)
  const [ultima, setUltima] = useState<string | null>(null)
  const [ultimoResultado, setUltimoResultado] = useState<any | null>(null)
  const [carregando, start] = useTransition()
  const [salvando, startSalvar] = useTransition()
  const [rodando, startRodar] = useTransition()

  const carregar = () => start(async () => {
    const [r, rf] = await Promise.all([getReconciliacao(), listarFontes(provider)])
    if (r.ok && r.dados) { setAtivo(r.dados.ativo); setHoras(Math.max(1, Math.round(r.dados.intervaloMin / 60))); setGrupos(new Set(r.dados.grupos)); setSincronizar(r.dados.sincronizar); setUltima(r.dados.ultimaExecucao); setUltimoResultado(r.dados.ultimoResultado) }
    if (rf.ok) setFontes(rf.fontes ?? [])
  })
  useEffect(() => { carregar() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const salvar = () => startSalvar(async () => {
    const r = await salvarReconciliacao({ ativo, intervaloMin: horas * 60, grupos: [...grupos], sincronizar })
    if (r.ok) toast.success(ativo ? 'Reconciliação automática ativada' : 'Configuração salva'); else toast.error(r.error ?? 'Erro ao salvar')
  })
  const rodar = () => startRodar(async () => {
    const r = await rodarReconciliacaoAgora()
    if (!r.ok) { toast.error(r.error ?? 'Erro'); return }
    const s = r.resultado ?? {}
    toast.success(`Reconciliação executada — ${s.novos ?? 0} novo(s), ${s.removidos ?? 0} removido(s)`)
    carregar()
  })
  const toggleG = (id: number) => setGrupos((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'nunca'

  return (
    <div className="space-y-3 rounded-2xl border border-primary/25 bg-primary/[0.04] p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold"><RotateCw className="h-4 w-4 text-primary" /> Reconciliação automática</h3>
          <p className="text-[11px] text-muted-foreground">Sincroniza os grupos periodicamente (importa novos e, se marcado, remove quem saiu). Última execução: {fmt(ultima)}.</p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="h-4 w-4 rounded border" />
          {ativo ? <span className="text-emerald-600 dark:text-emerald-400">Ativada</span> : <span className="text-muted-foreground">Desativada</span>}
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1.5">A cada
          <Input type="number" min={1} max={168} value={horas} onChange={(e) => setHoras(Math.max(1, Number(e.target.value) || 1))} className="h-8 w-16 text-center" /> hora(s)
        </label>
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={sincronizar} onChange={(e) => setSincronizar(e.target.checked)} className="h-4 w-4 rounded border" />
          Remover do sistema quem saiu do grupo (reconciliação)
        </label>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs font-medium">Grupos a reconciliar ({grupos.size})</p>
          <Button variant="outline" size="sm" onClick={carregar} disabled={carregando}>{carregando ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1.5 h-3 w-3" />} Carregar grupos</Button>
        </div>
        {fontes.length === 0 ? (
          <p className="rounded-lg border border-dashed p-3 text-[11px] text-muted-foreground">Clique em <b>Carregar grupos</b> para listar os grupos da Curseduca (exige credenciais salvas).</p>
        ) : (
          <div className="max-h-52 space-y-0.5 overflow-y-auto rounded-lg border bg-background p-2">
            {fontes.map((f) => {
              const id = Number(f.ref)
              return (
                <label key={f.ref} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted">
                  <input type="checkbox" checked={grupos.has(id)} onChange={() => toggleG(id)} className="h-4 w-4 rounded border" />
                  <span className="flex-1 truncate">{f.nome}</span>
                  <span className="text-[10px] text-muted-foreground">#{f.ref}</span>
                </label>
              )
            })}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={salvar} disabled={salvando}>{salvando ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-2 h-3.5 w-3.5" />} Salvar</Button>
        <Button variant="outline" size="sm" onClick={rodar} disabled={rodando || grupos.size === 0}>{rodando ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RotateCw className="mr-2 h-3.5 w-3.5" />} Rodar agora</Button>
        {ultimoResultado && <span className="self-center text-[11px] text-muted-foreground">último: {ultimoResultado.ok === false ? `erro — ${ultimoResultado.error}` : `${ultimoResultado.novos ?? 0} novos · ${ultimoResultado.removidos ?? 0} removidos`}</span>}
      </div>
    </div>
  )
}

function Kpi({ rotulo, valor, tom }: { rotulo: string; valor: number; tom?: 'emerald' | 'amber' | 'rose' }) {
  const cor = tom === 'emerald' ? 'text-emerald-600 dark:text-emerald-400' : tom === 'amber' ? 'text-amber-600 dark:text-amber-400' : tom === 'rose' ? 'text-rose-600 dark:text-rose-400' : ''
  return (<div className="text-center"><p className={cn('text-lg font-bold tabular-nums', cor)}>{valor}</p><p className="text-[11px] text-muted-foreground">{rotulo}</p></div>)
}
