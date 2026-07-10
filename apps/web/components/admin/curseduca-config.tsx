'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { KeyRound, Loader2, ChevronDown, CheckCircle2, Server, Lock, ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getCurseducaConfig, salvarCurseducaConfig, type CurseducaConfigDTO } from '@/app/admin/curseduca/actions'

/** Configuração das credenciais Curseduca do tenant (com fallback para o .env global). */
export function CurseducaConfig({ inicialAberto = false, semColapso = false }: { inicialAberto?: boolean; semColapso?: boolean }) {
  const [aberto, setAberto] = useState(inicialAberto || semColapso)
  const [cfg, setCfg] = useState<CurseducaConfigDTO | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)

  const [baseUrl, setBaseUrl] = useState('')
  const [usuario, setUsuario] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [senha, setSenha] = useState('')
  const [ativo, setAtivo] = useState(true)

  useEffect(() => {
    let vivo = true
    getCurseducaConfig().then((r) => {
      if (!vivo) return
      setCarregando(false)
      if (r.ok && r.config) {
        setCfg(r.config)
        setBaseUrl(r.config.base_url)
        setUsuario(r.config.usuario)
        setAtivo(r.config.ativo)
      }
    })
    return () => { vivo = false }
  }, [])

  async function salvar() {
    setSalvando(true)
    const r = await salvarCurseducaConfig({ base_url: baseUrl, usuario, api_key: apiKey || undefined, senha: senha || undefined, ativo })
    setSalvando(false)
    if (!r.ok) { toast.error(r.error ?? 'Falha ao salvar.'); return }
    toast.success('Credenciais salvas e validadas.')
    setApiKey(''); setSenha('')
    const nova = await getCurseducaConfig()
    if (nova.ok && nova.config) setCfg(nova.config)
  }

  return (
    <div className="rounded-2xl border bg-card">
      <button type="button" onClick={() => !semColapso && setAberto((v) => !v)} className={cn('flex w-full items-center gap-3 px-4 py-3 text-left', semColapso && 'cursor-default')}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><KeyRound className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Credenciais da Curseduca</p>
          <p className="truncate text-xs text-muted-foreground">
            {carregando ? 'carregando…'
              : cfg?.usandoEnv ? 'Usando as credenciais globais do servidor (.env). Configure aqui para este cliente.'
              : cfg?.existe ? `Configurado para este tenant · usuário ${cfg.usuario || '—'} · ${cfg.ativo ? 'ativo' : 'inativo'}`
              : 'Não configurado — informe as credenciais desta plataforma.'}
          </p>
        </div>
        {!carregando && (cfg?.existe || cfg?.usandoEnv) && (
          <span className={cn('mr-1 hidden items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium sm:inline-flex',
            cfg.usandoEnv ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400')}>
            {cfg.usandoEnv ? <><Server className="h-3 w-3" /> global (.env)</> : <><CheckCircle2 className="h-3 w-3" /> por tenant</>}
          </span>
        )}
        {!semColapso && <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', aberto && 'rotate-180')} />}
      </button>

      {aberto && (
        <div className="space-y-3 border-t p-4">
          {/* Status de criptografia em repouso */}
          {!carregando && cfg && (
            cfg.criptografiaAtiva
              ? <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400"><Lock className="h-3.5 w-3.5" /> Segredos {cfg.criptografado ? 'guardados criptografados' : 'serão criptografados'} no banco (AES-256).</div>
              : <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400"><ShieldAlert className="h-3.5 w-3.5" /> <b>APP_ENCRYPTION_KEY</b> ausente no servidor — os segredos ficam em texto puro. Defina a chave para criptografar.</div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Usuário (e-mail de acesso)" value={usuario} onChange={setUsuario} placeholder="automacao@exemplo.com" />
            <Campo label="Base URL" value={baseUrl} onChange={setBaseUrl} placeholder="https://prof.curseduca.pro" />
            <Campo label="API key" value={apiKey} onChange={setApiKey} type="password"
              placeholder={cfg?.temApiKey ? '•••••••• (mantém a atual)' : 'cole a API key'} />
            <Campo label="Senha" value={senha} onChange={setSenha} type="password"
              placeholder={cfg?.temSenha ? '•••••••• (mantém a atual)' : 'senha de acesso'} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="h-4 w-4 rounded border" />
            Integração ativa para este cliente
          </label>
          <p className="text-[11px] text-muted-foreground">
            Ao salvar, fazemos um login de teste na Curseduca para validar. Deixe API key/senha em branco para manter as atuais.
            Sem configuração aqui, o sistema usa as credenciais globais do servidor.
          </p>
          <div className="flex justify-end">
            <button type="button" onClick={salvar} disabled={salvando}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60">
              {salvando ? <><Loader2 className="h-4 w-4 animate-spin" /> Validando…</> : 'Salvar credenciais'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Campo({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete="off"
        className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
    </label>
  )
}
