'use client'

import { CheckCircle2, XCircle, Clock, Lock, Loader2, MessageCircle, Mail, Phone, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { FitaTopo } from '@/components/prova/fita-topo'

export type LoginResultadoTipo = 'sucesso' | 'email_invalido' | 'nao_iniciado' | 'encerrado'

export interface LoginContato {
  whatsapp?: string | null
  email_suporte?: string | null
  telefone?: string | null
  link_ajuda?: string | null
  horario_atendimento?: string | null
}

/** Card de contato/suporte (prioriza WhatsApp; senão e-mail / telefone / link). */
function ContatoCard({ contato }: { contato: LoginContato }) {
  if (contato.whatsapp) {
    const href = `https://wa.me/${contato.whatsapp.replace(/\D/g, '')}`
    return (
      <a href={href} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl border border-green-500/40 bg-green-50/70 p-3 text-left transition-colors hover:bg-green-50 dark:bg-green-900/15 dark:hover:bg-green-900/25">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-500 text-white"><MessageCircle className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-muted-foreground">Suporte via WhatsApp</span>
          <span className="block truncate text-sm font-semibold">{contato.whatsapp}</span>
        </span>
        <span className="shrink-0 text-xs font-medium text-green-700 dark:text-green-400">Abrir →</span>
      </a>
    )
  }
  if (contato.email_suporte) {
    return (
      <a href={`mailto:${contato.email_suporte}`} className="flex items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-muted/40">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"><Mail className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-muted-foreground">Suporte por e-mail</span>
          <span className="block truncate text-sm font-semibold">{contato.email_suporte}</span>
        </span>
        <span className="shrink-0 text-xs font-medium text-primary">Abrir →</span>
      </a>
    )
  }
  if (contato.telefone) {
    return (
      <a href={`tel:${contato.telefone.replace(/\s/g, '')}`} className="flex items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-muted/40">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"><Phone className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-muted-foreground">Telefone de suporte</span>
          <span className="block truncate text-sm font-semibold">{contato.telefone}</span>
        </span>
      </a>
    )
  }
  if (contato.link_ajuda) {
    return (
      <a href={contato.link_ajuda} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-muted/40">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"><ExternalLink className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-muted-foreground">Central de ajuda</span>
          <span className="block truncate text-sm font-semibold">Abrir link de suporte</span>
        </span>
        <span className="shrink-0 text-xs font-medium text-primary">Abrir →</span>
      </a>
    )
  }
  return null
}

/**
 * Pop-up mostrado após o aluno informar o e-mail no login:
 * - sucesso: identificado, mostra o nome e entra na prova
 * - email_invalido: e-mail não cadastrado / incorreto (com "o que verificar" + suporte)
 * - nao_iniciado: simulado ainda não liberado
 * - encerrado: simulado já encerrado
 */
export function LoginResultado({ tipo, nome, mensagem, quando, onVoltar, compact, overlay, contato, plataforma = 'Revisão' }: {
  tipo: LoginResultadoTipo
  nome?: string
  mensagem?: string
  quando?: string
  onVoltar?: () => void
  compact?: boolean
  /** overlay = aparece por cima da página de login (modal com fundo escurecido). */
  overlay?: boolean
  /** canais de contato/suporte exibidos nos pop-ups de bloqueio */
  contato?: LoginContato | null
  /** nome da plataforma (para o texto "plataforma do X") */
  plataforma?: string
}) {
  const cfg = {
    sucesso: {
      Icon: CheckCircle2, cor: 'var(--primary)', loading: true, botao: null as string | null,
      titulo: nome ? `Bem-vindo(a), ${nome}!` : 'Acesso liberado!',
      msg: 'Identificamos seu cadastro. Estamos preparando seu simulado.',
    },
    email_invalido: {
      Icon: Mail, cor: 'var(--destructive)', loading: false, botao: 'Tentar novamente',
      titulo: 'E-mail não encontrado',
      msg: mensagem ?? null,
    },
    nao_iniciado: {
      Icon: Clock, cor: 'var(--prova-aviso, #f59e0b)', loading: false, botao: 'Entendi',
      titulo: 'Simulado ainda não liberado',
      msg: mensagem ?? (quando ? `Este simulado ainda não começou — a liberação é em ${quando}. Volte no horário de início.` : 'Este simulado ainda não foi liberado para acesso. Volte no horário de início.'),
    },
    encerrado: {
      Icon: Lock, cor: 'var(--destructive)', loading: false, botao: 'Entendi',
      titulo: 'Simulado encerrado',
      msg: mensagem ?? 'O período para realizar este simulado já terminou. Não é mais possível iniciar.',
    },
  }[tipo]

  // "O que verificar" — só no e-mail inválido.
  const passos = tipo === 'email_invalido'
    ? [
        <>Confirme que digitou o e-mail corretamente, sem espaços.</>,
        <>Use o mesmo e-mail com o qual fez seu cadastro na <strong className="font-semibold" style={{ color: 'var(--prova-login-destaque, var(--primary))' }}>plataforma do {plataforma}</strong>.</>,
        <>Se o problema persistir, acione o suporte abaixo.</>,
      ]
    : null
  // Contato/suporte só no e-mail inválido (como se o e-mail não existisse e precisasse falar com o suporte).
  const temContato = tipo === 'email_invalido' && !!(contato && (contato.whatsapp || contato.email_suporte || contato.telefone || contato.link_ajuda))
  const temBody = !!(passos || temContato || cfg.loading || cfg.botao)

  return (
    <div className={cn(
      'flex items-center justify-center p-4 text-foreground',
      overlay
        ? cn('z-50 animate-in fade-in bg-black/50 backdrop-blur-sm duration-200', compact ? 'absolute inset-0' : 'fixed inset-0')
        : cn('bg-background', compact ? 'h-full' : 'min-h-screen'),
    )}>
      <div className="relative w-full max-w-md animate-in fade-in zoom-in-95 overflow-hidden rounded-2xl border bg-card text-center shadow-xl duration-500">
        <FitaTopo />
        {/* Cabeçalho — tom da situação */}
        <div className="px-8 pb-6 pt-8" style={{ background: `color-mix(in oklab, ${cfg.cor} 12%, var(--card))` }}>
          <span className="relative mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full" style={{ background: `color-mix(in oklab, ${cfg.cor} 22%, var(--card))` }}>
            {cfg.loading && <span className="absolute inset-0 animate-ping rounded-full" style={{ background: cfg.cor, opacity: 0.2 }} />}
            <cfg.Icon className="h-9 w-9" style={{ color: cfg.cor }} />
          </span>
          <h2 className="text-lg font-semibold" style={{ color: cfg.cor }}>{cfg.titulo}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {cfg.msg ?? (tipo === 'email_invalido'
              ? <>Este e-mail não está cadastrado na <strong className="font-semibold" style={{ color: 'var(--prova-login-destaque, var(--primary))' }}>plataforma do {plataforma}</strong>.</>
              : null)}
          </p>
        </div>

        {/* Corpo */}
        {temBody && (
          <div className="space-y-4 p-6">
            {cfg.loading && (
              <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Entrando no simulado...
              </p>
            )}
            {passos && (
              <div className="text-left">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">O que verificar</p>
                <ol className="space-y-2.5">
                  {passos.map((p, i) => (
                    <li key={i} className="flex gap-2.5 text-sm text-muted-foreground">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground">{i + 1}</span>
                      <span className="leading-snug">{p}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {temContato && <ContatoCard contato={contato!} />}
            {cfg.botao && (
              <Button className="w-full" size="lg" variant={tipo === 'email_invalido' ? 'default' : 'outline'} onClick={onVoltar}>
                {cfg.botao}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
