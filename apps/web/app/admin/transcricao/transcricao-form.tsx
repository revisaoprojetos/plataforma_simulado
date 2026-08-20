'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Loader2, Save, KeyRound, Eye, EyeOff, CheckCircle2, Trash2, ShieldCheck, Sparkles, AlertTriangle } from 'lucide-react'
import { salvarConfigIA, removerConfigIA, testarConfigIA, type StatusIA } from './actions'
import { formatBrt } from '@/lib/brt'

type Prov = 'anthropic' | 'openai' | 'gemini'
const LABEL: Record<Prov, string> = { anthropic: 'Claude (Anthropic)', openai: 'GPT (OpenAI)', gemini: 'Gemini (Google)' }
const MODELO_PADRAO: Record<Prov, string> = { anthropic: 'claude-opus-4-8', openai: 'gpt-4o', gemini: 'gemini-1.5-pro' }
const DICA: Record<Prov, string> = {
  anthropic: 'console.anthropic.com → API Keys (sk-ant-…)',
  openai: 'platform.openai.com → API keys (sk-…)',
  gemini: 'aistudio.google.com/apikey (AIza…)',
}
/** Detecção do provedor pelo formato da chave (espelha lib/ia/config.ts). */
function detectar(k: string): Prov | null {
  const s = (k || '').trim()
  if (/^sk-ant-/i.test(s)) return 'anthropic'
  if (/^AIza/i.test(s) || /^AQ\.[\w-]+/i.test(s)) return 'gemini'
  if (/^sk-/i.test(s)) return 'openai'
  return null
}

export function TranscricaoForm({ inicial }: { inicial: StatusIA }) {
  const [status, setStatus] = useState<StatusIA>(inicial)
  const [chave, setChave] = useState('')
  const [modelo, setModelo] = useState('')
  const [provManual, setProvManual] = useState<'auto' | Prov>('auto')
  const [ver, setVer] = useState(false)
  const [pending, start] = useTransition()
  const [testando, startTeste] = useTransition()

  const detectado = useMemo(() => detectar(chave), [chave])
  // Provedor efetivo = o escolhido à mão OU o detectado automaticamente.
  const provEfetivo: Prov | null = provManual === 'auto' ? detectado : provManual

  function salvar() {
    if (!provEfetivo) { toast.error('Escolha o provedor abaixo — não deu pra detectar automaticamente.'); return }
    start(async () => {
      const r = await salvarConfigIA(chave.trim(), provManual === 'auto' ? null : provManual, modelo.trim())
      if (!r.ok) { toast.error(r.error ?? 'Erro ao salvar'); return }
      setStatus({ configurado: true, provider: r.provider, providerLabel: r.providerLabel, modelo: r.modelo, mascara: r.mascara, testadaEm: null })
      setChave(''); setModelo('')
      toast.success(`Chave ${r.providerLabel} salva. Clique em Testar para validar.`)
    })
  }
  function testar() {
    startTeste(async () => {
      const r = await testarConfigIA()
      if (!r.ok) { toast.error(r.error ?? 'Falha no teste'); return }
      setStatus((s) => ({ ...s, testadaEm: new Date().toISOString() }))
      toast.success('Chave válida! A transcrição por IA está pronta.')
    })
  }
  function remover() {
    start(async () => {
      const r = await removerConfigIA()
      if (!r.ok) { toast.error(r.error ?? 'Erro ao remover'); return }
      setStatus({ configurado: false })
      toast.success('Chave removida. A correção volta a usar só o OCR local.')
    })
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,560px)_1fr]">
      <div className="space-y-4">
        {/* Estado atual */}
        {status.configurado && (
          <div className="rounded-2xl border border-emerald-300/40 bg-emerald-50/60 p-4 shadow-sm dark:bg-emerald-900/15">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-5 w-5" /></span>
                <div>
                  <p className="text-sm font-semibold">{status.providerLabel}</p>
                  <p className="text-xs text-muted-foreground">Modelo <span className="font-mono">{status.modelo}</span> · chave <span className="font-mono">{status.mascara}</span></p>
                </div>
              </div>
              <span className={status.testadaEm ? 'rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300' : 'rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300'}>
                {status.testadaEm ? `validada ${formatBrt(status.testadaEm) ?? ''}` : 'não testada'}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={testar} disabled={testando} className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-60">
                {testando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />} Testar chave
              </button>
              <button type="button" onClick={remover} disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/5 disabled:opacity-60">
                <Trash2 className="h-3.5 w-3.5" /> Remover
              </button>
            </div>
          </div>
        )}

        {/* Inserir / trocar a chave */}
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><KeyRound className="h-4 w-4" /></span>
            <span className="text-sm font-semibold">{status.configurado ? 'Trocar a chave' : 'Inserir a chave de API'}</span>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">Cole a chave de <b>qualquer</b> provedor — o sistema detecta automaticamente qual é (OpenAI, Anthropic ou Gemini).</p>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Chave de API</span>
            <div className="relative">
              <input type={ver ? 'text' : 'password'} value={chave} onChange={(e) => setChave(e.target.value)} autoComplete="off" spellCheck={false}
                placeholder="sk-…  ·  sk-ant-…  ·  AIza…"
                className="h-10 w-full rounded-lg border bg-background px-3 pr-10 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40" />
              <button type="button" onClick={() => setVer((v) => !v)} aria-label={ver ? 'Ocultar' : 'Mostrar'} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {ver ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>

          {/* Detecção ao vivo (quando em modo automático) */}
          {provManual === 'auto' && chave.trim().length > 0 && (
            <div className="mt-2">
              {detectado ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"><Sparkles className="h-3.5 w-3.5" /> Detectado: {LABEL[detectado]}</span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-300"><AlertTriangle className="h-3.5 w-3.5" /> Não reconhecida — escolha o provedor abaixo</span>
              )}
            </div>
          )}

          {/* Provedor: automático ou manual (fallback quando a detecção falha) */}
          <label className="mt-3 block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Provedor</span>
            <select value={provManual} onChange={(e) => setProvManual(e.target.value as 'auto' | Prov)}
              className="h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
              <option value="auto">Detectar automaticamente{detectado ? ` (${LABEL[detectado]})` : ''}</option>
              <option value="gemini">{LABEL.gemini}</option>
              <option value="openai">{LABEL.openai}</option>
              <option value="anthropic">{LABEL.anthropic}</option>
            </select>
            {provManual !== 'auto' && <span className="text-[11px] text-muted-foreground">Provedor fixado manualmente — a detecção automática é ignorada.</span>}
          </label>

          <label className="mt-3 block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Modelo (opcional)</span>
            <input value={modelo} onChange={(e) => setModelo(e.target.value)} spellCheck={false}
              placeholder={provEfetivo ? MODELO_PADRAO[provEfetivo] : 'padrão do provedor'}
              className="h-9 w-full rounded-lg border bg-background px-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40" />
            <span className="text-[11px] text-muted-foreground">Deixe em branco para usar o padrão de visão do provedor{provEfetivo ? ` (${MODELO_PADRAO[provEfetivo]})` : ''}.</span>
          </label>

          <button type="button" onClick={salvar} disabled={pending || !chave.trim() || !provEfetivo}
            className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {status.configurado ? 'Salvar nova chave' : 'Salvar chave'}
          </button>
        </div>
      </div>

      {/* Explicação / segurança */}
      <div className="space-y-3 lg:sticky lg:top-4 lg:self-start">
        <div className="rounded-2xl border bg-muted/20 p-4">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-primary" /> Como funciona e segurança</p>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            <li>• A chave é <b>criptografada</b> no servidor (AES-256-GCM) e <b>nunca</b> vai para o navegador.</li>
            <li>• Usada só na <b>correção de discursivas</b>: transcreve o manuscrito e sugere a correção (você aprova; a nota final é sua).</li>
            <li>• Sem chave, a correção usa só o <b>OCR local</b> (grátis). Com chave, a leitura de letra de mão fica muito melhor.</li>
            <li>• A imagem da resposta do aluno é enviada ao provedor escolhido — considere o consentimento <b>LGPD</b> do seu tenant.</li>
          </ul>
        </div>
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <p className="mb-2 text-sm font-semibold">Onde pegar a chave</p>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            {(Object.keys(LABEL) as Prov[]).map((p) => (
              <li key={p}>• <b>{LABEL[p]}</b>: <span className="font-mono">{DICA[p]}</span></li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-muted-foreground">Gemini tem cota gratuita generosa; Anthropic/OpenAI cobram por uso.</p>
        </div>
      </div>
    </div>
  )
}
