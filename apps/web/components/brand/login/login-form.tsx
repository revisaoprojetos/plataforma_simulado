'use client'

// ─────────────────────────────────────────────────────────────────────────────
// <LoginForm> — CORPO compartilhado do card de login (spec 02 §2.1).
// ─────────────────────────────────────────────────────────────────────────────
//
// Eyebrow + título + campo e-mail (sempre) + senha (só admin, animada) + CTA com
// spinner + nota de rodapé + erro/manutenção. A pílula flutuante Admin/Aluno é
// renderizada aqui uma vez (fixa no canto). Toda a cópia por marca (§2.1) está no
// mapa COPY abaixo. As cores vêm de `tokens` (type-safe), aplicadas via CSS vars
// no root `.lf` para suportar :focus-within/hover sem styled-components.
//
// As variantes (Revisão/VND/MEQ) encaixam este componente no slot do card e só
// desenham o chrome (fundo/efeitos/headline). A lógica vem de `core` (useLoginCore).

import { useId, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Mail, IdCard, Phone, Lock, ArrowRight, Loader2, Eye, EyeOff, Wrench, ShieldCheck, GraduationCap, Lock as LockIco } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { Brand, LoginCore, LoginFormTokens, LoginTheme } from './types'

type Copy = {
  eyebrowAluno: string
  eyebrowAdmin: string
  footerAluno: string
  footerAdmin: string
  pillParaAdmin: string // texto da pílula quando em modo aluno (→ admin)
  pillParaAluno: string // texto quando em modo admin (→ aluno)
  pillParaAlunoCurto: string // versão mobile
  tituloAluno: string
  tituloAdmin: string
}

const COPY: Record<Brand, Copy> = {
  revisao: {
    eyebrowAluno: 'ÁREA DO ESTUDANTE',
    eyebrowAdmin: 'ÁREA ADMINISTRATIVA',
    footerAluno: 'Use o mesmo e-mail cadastrado em revisaoensinojuridico.com.br — sem senha.',
    footerAdmin: 'Acesso restrito à equipe.',
    pillParaAdmin: 'Admin',
    pillParaAluno: 'Área do estudante',
    pillParaAlunoCurto: 'Estudante',
    tituloAluno: 'Login de Acesso',
    tituloAdmin: 'Acesso da equipe',
  },
  vnd: {
    eyebrowAluno: 'ÁREA DO ALUNO',
    eyebrowAdmin: 'ÁREA ADMINISTRATIVA',
    footerAluno: 'Sem senha. Como aluno, basta o seu e-mail.',
    footerAdmin: 'Acesso restrito à equipe.',
    pillParaAdmin: 'Admin',
    pillParaAluno: 'Área do aluno',
    pillParaAlunoCurto: 'Aluno',
    tituloAluno: 'Entrar',
    tituloAdmin: 'Acesso da equipe',
  },
  meq: {
    eyebrowAluno: 'ÁREA DO ALUNO',
    eyebrowAdmin: 'ÁREA ADMINISTRATIVA',
    footerAluno: 'Use o e-mail cadastrado em meqconcursos.com.br — sem senha.',
    footerAdmin: 'Acesso restrito à equipe.',
    pillParaAdmin: 'Admin',
    pillParaAluno: 'Área do aluno',
    pillParaAlunoCurto: 'Aluno',
    tituloAluno: 'Entrar na plataforma',
    tituloAdmin: 'Acesso da equipe',
  },
}

export interface LoginFormProps {
  brand: Brand
  theme: LoginTheme
  core: LoginCore
  tokens: LoginFormTokens
  preview?: boolean
  /** Override do título do card (ex.: V5 "Bem-vindo"). */
  tituloAluno?: string
  tituloAdmin?: string
  /** Rótulo do CTA (ex.: V5 "Entrar na plataforma"). Default "Entrar". */
  ctaLabel?: string
  /** Esconde o eyebrow/título internos (quando a variante já mostra a headline fora do card). */
  mostrarTitulo?: boolean
  /** Alinhamento central (clássico/vitrine) vs. esquerda (split/vitrine 2-col). */
  centro?: boolean
  /** Renderiza (ou não) a pílula flutuante Admin/Aluno. Default true. */
  mostrarPill?: boolean
  className?: string
}

export function LoginForm({
  brand,
  theme,
  core,
  tokens,
  preview = false,
  tituloAluno,
  tituloAdmin,
  ctaLabel = 'Entrar',
  mostrarTitulo = true,
  centro = false,
  mostrarPill = true,
  className,
}: LoginFormProps) {
  const copy = COPY[brand]
  const ehAdmin = core.modo === 'admin'
  const uid = useId().replace(/:/g, '')
  const cls = `lf-${uid}`
  // A pílula é renderizada via portal no <body> — assim não fica "presa"/recortada por um
  // ancestral com transform (ex.: o card animado), bug clássico de position:fixed.
  const [montado, setMontado] = useState(false)
  useEffect(() => setMontado(true), [])

  const eyebrow = ehAdmin ? copy.eyebrowAdmin : copy.eyebrowAluno
  const titulo = ehAdmin ? (tituloAdmin ?? copy.tituloAdmin) : (tituloAluno ?? copy.tituloAluno)
  const footer = ehAdmin ? copy.footerAdmin : copy.footerAluno

  const rootStyle: React.CSSProperties = {
    // CSS vars consumidas pelo <style> escopado (foco/hover) e pelos inline styles.
    ['--lf-fg' as any]: tokens.fg,
    ['--lf-muted' as any]: tokens.muted,
    ['--lf-field-bg' as any]: tokens.fieldBg,
    ['--lf-field-border' as any]: tokens.fieldBorder,
    ['--lf-field-fg' as any]: tokens.fieldFg,
    ['--lf-primary' as any]: tokens.primary,
    ['--lf-cta-bg' as any]: tokens.ctaBg,
    ['--lf-cta-fg' as any]: tokens.ctaFg,
    color: tokens.fg,
  }

  return (
    <div className={cn(cls, 'w-full', className)} style={rootStyle}>
      <style>{scopedCss(cls)}</style>

      {mostrarTitulo && (
        <div className={cn('mb-5 flex flex-col gap-1', centro ? 'items-center text-center' : 'items-start text-left')}>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: tokens.primary }}>{eyebrow}</p>
          <h1 className="text-[1.65rem] font-extrabold leading-tight tracking-tight">{titulo}</h1>
        </div>
      )}

      <form onSubmit={core.submit} className="space-y-3.5" noValidate>
        <Campo cls={cls} icon={Mail} type="email" placeholder="seu@email.com" value={core.email}
          onChange={core.setEmail} autoComplete="email" required readOnly={preview} erro={!!core.erro} />

        {ehAdmin ? (
          <div className="lf-reveal space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold" style={{ color: tokens.fg }}>Senha</label>
              <a href="#" onClick={(e) => e.preventDefault()} className="text-xs font-medium lf-link">Esqueci a senha</a>
            </div>
            <Campo cls={cls} icon={Lock} type="password" placeholder="••••••••" value={core.senha}
              onChange={core.setSenha} autoComplete="current-password" required readOnly={preview} erro={!!core.erro} />
          </div>
        ) : (
          <>
            {core.metodo === 'email_cpf' && (
              <Campo cls={cls} icon={IdCard} type="text" placeholder="CPF" value={core.cpf}
                onChange={core.setCpf} inputMode="numeric" readOnly={preview} erro={!!core.erro} />
            )}
            {core.metodo === 'email_telefone' && (
              <Campo cls={cls} icon={Phone} type="text" placeholder="Telefone" value={core.telefone}
                onChange={core.setTelefone} inputMode="tel" readOnly={preview} erro={!!core.erro} />
            )}
          </>
        )}

        {core.manutencao && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-left text-sm text-amber-700 dark:text-amber-300">
            <Wrench className="mt-0.5 h-4 w-4 shrink-0" />
            <div><p className="font-semibold">{core.manutencao.titulo}</p><p className="opacity-90">{core.manutencao.mensagem}</p></div>
          </div>
        )}
        {core.erro && <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[13px] font-medium text-red-600 dark:text-red-400">{core.erro}</p>}

        <button type="submit" disabled={core.carregando || (!preview && (!core.email || (ehAdmin && !core.senha)))}
          className="lf-cta group flex w-full items-center justify-center gap-2" style={{ background: tokens.ctaBg, color: tokens.ctaFg }}>
          {core.carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {ctaLabel}
          {!core.carregando && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-[3px]" />}
        </button>

        {footer && (
          <div className={cn('flex items-start gap-2 pt-0.5 text-[12.5px] leading-relaxed', centro ? 'justify-center text-center' : 'text-left')} style={{ color: tokens.muted }}>
            {ehAdmin && <LockIco className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
            <span>
              {!ehAdmin && brand === 'vnd' ? <><strong style={{ color: tokens.fg }}>Sem senha.</strong> Como aluno, basta o seu e-mail.</> : footer}
              {ehAdmin && (
                <>{' '}
                  <button type="button" onClick={core.alternarModo} className="font-semibold lf-link">
                    {brand === 'revisao' ? 'Sou estudante' : 'Sou aluno'}
                  </button>
                </>
              )}
            </span>
          </div>
        )}
      </form>

      {mostrarPill && montado && !core.entrando && createPortal(
        <button type="button" onClick={core.alternarModo}
          aria-label={ehAdmin ? 'Voltar para a área do aluno' : 'Acesso administrativo'}
          className="fixed bottom-4 right-4 z-[80] inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold backdrop-blur transition hover:brightness-110"
          style={{ background: tokens.pillBg, color: tokens.pillFg, borderColor: tokens.pillBorder }}>
          {ehAdmin ? <GraduationCap className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{ehAdmin ? copy.pillParaAluno : copy.pillParaAdmin}</span>
          <span className="sm:hidden">{ehAdmin ? copy.pillParaAlunoCurto : copy.pillParaAdmin}</span>
        </button>,
        document.body,
      )}
    </div>
  )
}

function Campo({
  cls, icon: Icon, type, placeholder, value, onChange, autoComplete, inputMode, required, readOnly, erro,
}: {
  cls: string
  icon: React.ComponentType<{ className?: string }>
  type: string
  placeholder: string
  value: string
  onChange: (v: string) => void
  autoComplete?: string
  inputMode?: 'numeric' | 'tel'
  required?: boolean
  readOnly?: boolean
  erro?: boolean
}) {
  const [verSenha, setVerSenha] = useState(false)
  const ehSenha = type === 'password'
  const tipo = ehSenha && verSenha ? 'text' : type
  return (
    <div className="lf-fldwrap group relative">
      <Icon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 lf-fldicon" />
      <input
        type={tipo}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        inputMode={inputMode}
        required={required}
        readOnly={readOnly}
        tabIndex={readOnly ? -1 : undefined}
        className={cn('lf-fld w-full', ehSenha ? 'pr-11' : 'pr-4', erro && 'lf-fld-err')}
      />
      {ehSenha && !readOnly && (
        <button type="button" onClick={() => setVerSenha((v) => !v)} tabIndex={-1}
          aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-0.5 lf-fldicon transition-colors">
          {verSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      )}
    </div>
  )
}

function scopedCss(cls: string) {
  return `
.${cls} .lf-fld{height:54px;border-radius:14px;border:1.5px solid var(--lf-field-border);background:var(--lf-field-bg);color:var(--lf-field-fg);padding-left:44px;font-size:14px;outline:none;transition:border-color .18s,box-shadow .18s}
.${cls} .lf-fld::placeholder{color:var(--lf-muted);opacity:.85}
/* Neutraliza o autofill do Chrome (fundo/borda amarelos) — mantém as cores do tema. */
.${cls} .lf-fld:-webkit-autofill,.${cls} .lf-fld:-webkit-autofill:hover,.${cls} .lf-fld:-webkit-autofill:focus,.${cls} .lf-fld:-webkit-autofill:active{-webkit-text-fill-color:var(--lf-field-fg);caret-color:var(--lf-field-fg);-webkit-box-shadow:0 0 0 1000px var(--lf-field-bg) inset;box-shadow:0 0 0 1000px var(--lf-field-bg) inset;border:1.5px solid var(--lf-field-border);transition:background-color 9999s ease-in-out 0s}
.${cls} .lf-fldwrap:focus-within .lf-fld{border-color:var(--lf-primary);box-shadow:0 0 0 4px color-mix(in oklab,var(--lf-primary) 15%,transparent)}
.${cls} .lf-fld-err{border-color:#ef4444!important;box-shadow:0 0 0 4px rgba(239,68,68,.14)!important}
.${cls} .lf-fldicon{color:var(--lf-muted);transition:color .18s}
.${cls} .lf-fldwrap:focus-within .lf-fldicon{color:var(--lf-primary)}
.${cls} .lf-cta{height:56px;border-radius:14px;font-weight:800;font-size:14.5px;box-shadow:0 8px 24px -10px color-mix(in oklab,var(--lf-primary) 60%,transparent);transition:filter .18s,transform .18s,box-shadow .18s}
.${cls} .lf-cta:hover:not(:disabled){filter:brightness(1.08);transform:translateY(-1px)}
.${cls} .lf-cta:disabled{opacity:.6;cursor:default}
.${cls} .lf-link{color:var(--lf-primary);text-decoration:none;transition:opacity .15s}
.${cls} .lf-link:hover{opacity:.75;text-decoration:underline;text-underline-offset:2px}
.${cls} .lf-reveal{animation:lfUp${cls} .5s cubic-bezier(.2,.8,.2,1) both}
.${cls} .lf-pill{border-width:1px;border-style:solid;border-radius:999px;padding:6px 12px;font-size:12px;font-weight:600;backdrop-filter:blur(6px);transition:filter .15s,transform .15s}
.${cls} .lf-pill:hover{filter:brightness(1.06);transform:translateY(-1px)}
@keyframes lfUp${cls}{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.${cls} .lf-reveal{animation:none}}
`
}
