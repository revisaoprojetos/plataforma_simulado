'use client'

import { BookOpen, CheckCircle2, XCircle, Circle, Home, Clock, FileText, FileStack, Trophy, Calendar, Moon, RefreshCw, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FitaTopo } from '@/components/prova/fita-topo'

function frameLogo(estilo?: string): string {
  if (estilo === 'quadrado') return 'rounded-none'
  if (estilo === 'borda') return 'rounded-lg border'
  return 'rounded-xl'
}

type Branding = { nome?: string; logoUrl?: string | null; logoGrandeUrl?: string | null; logoBg?: string; logoEstilo?: string }

/** Logo do topo: usa a logo grande (sem moldura) quando existe; senão a pequena com moldura. */
export function LogoTopo({ b }: { b?: Branding | null }) {
  if (b?.logoUrl) {
    return (
      <div className={cn('flex h-12 w-12 items-center justify-center overflow-hidden', frameLogo(b.logoEstilo))} style={{ background: b.logoBg ?? '#ffffff' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={b.logoUrl} alt="" className="h-full w-full object-contain" />
      </div>
    )
  }
  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
      <BookOpen className="h-6 w-6" />
    </div>
  )
}

/** Cor do selo de situação (cada situação tem sua cor, editável no HUD do login). */
function statusStyle(label: string): React.CSSProperties {
  if (label === 'Não iniciado') return { background: 'var(--prova-sit-nao-iniciado, #2563eb)', color: '#fff' }
  if (label === 'Encerrado') return { background: 'var(--prova-sit-encerrado, #dc2626)', color: '#fff' }
  if (label === 'Disponível') return { background: 'var(--prova-sit-disponivel, #6d28d9)', color: '#fff' }
  return { background: 'var(--prova-sit-andamento, #e6b83c)', color: '#1a1d24' } // Em andamento (amarelo, texto escuro)
}

/** Prévia (estática) da página de login do simulado. */
export function ProvaLoginPreview({ branding, titulo = 'Simulado', metodo = 'email_cpf', compact, status = 'Em andamento' }: {
  branding?: Branding | null; titulo?: string; metodo?: 'email' | 'email_cpf' | 'email_telefone'; compact?: boolean; status?: string
}) {
  const plataforma = (branding?.nome ?? 'Revisão').replace(/^plataforma\s+/i, '')
  const Campo = ({ label, ph }: { label: string; ph: string }) => (
    <div className="space-y-1.5">
      <span className="block text-sm font-medium">{label}</span>
      <div className="flex h-9 items-center rounded-md border px-3 text-sm text-muted-foreground" style={{ background: 'var(--prova-login-input, var(--background))' }}>{ph}</div>
    </div>
  )
  const InfoBoxDT = ({ label, valor }: { label: string; valor: string }) => (
    <div className="rounded-xl bg-muted/50 px-4 py-3">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"><Calendar className="h-3.5 w-3.5" /> {label}</p>
      <p className="mt-0.5 text-sm font-semibold">{valor}</p>
    </div>
  )
  return (
    <div className={cn('flex items-start justify-center bg-background p-4 text-foreground', compact ? 'h-full overflow-auto' : 'min-h-screen py-10')}>
      <div className="w-full max-w-2xl space-y-6 py-2">
        {/* Cabeçalho: status + título + logo + tema */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {branding?.logoUrl && (
              <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden', frameLogo(branding.logoEstilo))} style={{ background: branding.logoBg ?? '#ffffff' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={branding.logoUrl} alt="" className="h-full w-full object-contain" />
              </div>
            )}
            <div>
              <span className="inline-block rounded-full px-3 py-1 text-xs font-semibold" style={statusStyle(status)}>{status}</span>
              <h1 className="mt-2 text-3xl font-extrabold uppercase leading-none tracking-tight" style={{ color: 'var(--prova-titulo, var(--primary))' }}>{titulo}</h1>
            </div>
          </div>
          <Moon className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
        </div>

        {/* Card: Informações da prova */}
        <div className="relative overflow-hidden rounded-2xl border bg-card p-6 shadow-sm">
          <FitaTopo />
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold"><BookOpen className="h-5 w-5" style={{ color: 'var(--primary)' }} /> Informações do simulado</h2>
          <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-4 py-3 text-sm"><Clock className="h-4 w-4 text-muted-foreground" /> Duração: <strong className="font-semibold">42h</strong></div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <InfoBoxDT label="Início" valor="01/07/2026 00:00" />
            <InfoBoxDT label="Encerra" valor="02/07/2026 18:00" />
          </div>
        </div>

        {/* Card: Identificação */}
        <div className="relative overflow-hidden rounded-2xl border bg-card p-6 shadow-sm">
          <FitaTopo />
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold"><BookOpen className="h-5 w-5" style={{ color: 'var(--primary)' }} /> Identifique-se para iniciar</h2>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <span className="block text-sm font-medium">E-mail cadastrado na <strong className="font-semibold" style={{ color: 'var(--prova-login-destaque, var(--primary))' }}>plataforma do {plataforma}</strong> *</span>
              <div className="flex h-9 items-center rounded-md border px-3 text-sm text-muted-foreground" style={{ background: 'var(--prova-login-input, var(--background))' }}>seu@email.com</div>
            </div>
            {metodo === 'email_cpf' && <Campo label="CPF" ph="000.000.000-00" />}
            {metodo === 'email_telefone' && <Campo label="Telefone" ph="(00) 00000-0000" />}
            <div className="flex h-10 w-full items-center justify-center rounded-md text-sm font-medium text-primary-foreground" style={{ background: 'var(--prova-login-botao, var(--primary))' }}>Iniciar simulado</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoBox({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{valor}</p>
    </div>
  )
}

// Cores do navegador — iguais às da prova (respondem às CSS vars do caderno).
const COR_MARCADA = 'var(--prova-marcada, var(--primary))'
const COR_ANUL = 'var(--prova-anulada, #6b7280)'
const COR_ALT = 'var(--prova-alt, #0891b2)'
const COR_ACERTO = 'var(--prova-acerto, #16a34a)'
const COR_ERRO = 'var(--prova-erro, #dc2626)'
const COR_BRANCO = 'var(--prova-branco, #6b7280)'
const COR_MEDIA = 'var(--prova-media, #6d28d9)'
// Card de resultado: fundo = versão clara da própria cor.
const cardStat = (cor: string) => ({ borderColor: `color-mix(in oklab, ${cor} 30%, var(--border))`, background: `color-mix(in oklab, ${cor} 12%, var(--card))` })
// Botões da prova encerrada — mesma classe .hud-btn da tela real (normal + hover editável no HUD).
const BTN_CADERNO = 'hud-btn inline-flex h-10 items-center justify-center gap-1.5 rounded-md border px-4 text-sm font-medium'
const STYLE_CADERNO = {
  '--btn-bg': 'var(--prova-caderno-btn-fundo, var(--background))',
  '--btn-fg': 'var(--prova-caderno-btn, var(--foreground))',
  '--btn-bd': 'var(--prova-caderno-btn, var(--border))',
  '--btn-bg-ativo': 'var(--prova-caderno-btn-fundo-ativo, var(--prova-caderno-btn, var(--primary)))',
  '--btn-fg-ativo': 'var(--prova-caderno-btn-ativo, #fff)',
  '--btn-bd-ativo': 'var(--prova-caderno-btn-fundo-ativo, var(--prova-caderno-btn))',
} as React.CSSProperties
const STYLE_INICIO = {
  '--btn-bg': 'var(--prova-inicio-btn-fundo, var(--background))',
  '--btn-fg': 'var(--prova-inicio-btn, var(--foreground))',
  '--btn-bd': 'var(--prova-inicio-btn, var(--border))',
  '--btn-bg-ativo': 'var(--prova-inicio-btn-fundo-ativo, var(--prova-inicio-btn, var(--primary)))',
  '--btn-fg-ativo': 'var(--prova-inicio-btn-ativo, #fff)',
  '--btn-bd-ativo': 'var(--prova-inicio-btn-fundo-ativo, var(--prova-inicio-btn))',
} as React.CSSProperties
const STYLE_VOLTAR = {
  '--btn-bg': 'var(--prova-voltar-btn-fundo, var(--background))',
  '--btn-fg': 'var(--prova-voltar-btn, var(--foreground))',
  '--btn-bd': 'var(--prova-voltar-btn-fundo, var(--border))',
  '--btn-bg-ativo': 'var(--prova-voltar-btn-fundo-ativo, var(--prova-voltar-btn-fundo))',
  '--btn-fg-ativo': 'var(--prova-voltar-btn-ativo, var(--prova-voltar-btn, #fff))',
  '--btn-bd-ativo': 'var(--prova-voltar-btn-fundo-ativo, var(--prova-voltar-btn-fundo))',
} as React.CSSProperties

/** Prévia (estática) da tela de prova encerrada — igual ao real: resumo + navegador + primeira questão de revisão + voltar. */
export function ProvaEncerradaPreview({ branding, titulo = 'Simulado', compact, liberado = true }: {
  branding?: Branding | null; titulo?: string; compact?: boolean; liberado?: boolean
}) {
  const Stat = ({ icon: Icon, valor, label }: { icon: typeof Clock; valor: string; label: string }) => (
    <div className="rounded-xl border bg-muted/40 p-3 text-center">
      <Icon className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
      <p className="font-mono text-xl font-bold tabular-nums">{valor}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
  // Navegador de questões (demo): 1 acertou, 1 errou, 1 anulada, 1 alt. trocada, 1 em branco.
  const nav = [
    { n: 1, tipo: 'acertou', respondida: true },
    { n: 2, tipo: 'errou', respondida: true },
    { n: 3, tipo: 'anulada', respondida: true },
    { n: 4, tipo: 'alt', respondida: true },
    { n: 5, tipo: 'branco', respondida: false },
  ] as const
  // Alternativas (demo) — gabarito alterado: correta era A, virou B; o aluno marcou C (perdeu o ponto).
  const alts = [
    { l: 'A', texto: 'Correta antes da alteração do gabarito.', correta: false, marcada: false, corretaAntes: true },
    { l: 'B', texto: 'Correta após a alteração do gabarito.', correta: true, marcada: false, corretaAntes: false },
    { l: 'C', texto: 'Foi o que você marcou — não era nem a anterior nem a nova.', correta: false, marcada: true, corretaAntes: false },
    { l: 'D', texto: 'Alternativa incorreta.', correta: false, marcada: false, corretaAntes: false },
  ]
  // Desempenho por matéria (demo) — só aparece quando o gabarito está liberado.
  const stats = [
    { disciplina: 'Língua Portuguesa', acertos: 8, total: 10, percentual: 80 },
    { disciplina: 'Direito Constitucional', acertos: 5, total: 10, percentual: 50 },
    { disciplina: 'Raciocínio Lógico', acertos: 3, total: 10, percentual: 30 },
  ]
  return (
    <div className={cn('bg-background text-foreground', compact ? 'h-full overflow-auto' : 'min-h-screen')}>
      {/* Top bar — igual ao simulado real (cor própria via HUD) */}
      <header className="sticky top-0 z-40 border-b backdrop-blur" style={{ background: 'var(--prova-topbar, var(--background))', color: 'var(--prova-topbar-texto, var(--foreground))' }}>
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <span className="text-sm font-semibold">Simulado finalizado</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="hud-btn inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium" style={STYLE_INICIO}><ArrowLeft className="h-3.5 w-3.5" /> Voltar ao início</span>
            <span className="hud-btn inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium" style={STYLE_VOLTAR}><Home className="h-3.5 w-3.5" /> Meus simulados</span>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl space-y-5 p-4 py-6">
        {/* Resumo */}
        <div className="relative overflow-hidden rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          <FitaTopo />
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Trophy className="h-4 w-4" /> Simulado finalizado
          </div>
          <h2 className="text-2xl font-bold leading-tight">{titulo}</h2>
          <p className="mt-1 text-sm text-muted-foreground"><span className="font-medium text-foreground">Nome do aluno</span> · email@exemplo.com</p>

          <div className="mt-5 grid grid-cols-2 gap-4 border-t pt-5 sm:grid-cols-4">
            <InfoBox label="Data" valor="14/06/2026" />
            <InfoBox label="Início" valor="08:29" />
            <InfoBox label="Término" valor="12:31" />
            <InfoBox label="Tempo utilizado" valor="4h 02min" />
          </div>

          {liberado ? (
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-xl border p-3 text-center" style={cardStat(COR_ACERTO)}>
                <CheckCircle2 className="mx-auto mb-1 h-4 w-4" style={{ color: COR_ACERTO }} />
                <p className="text-xl font-bold tabular-nums" style={{ color: COR_ACERTO }}>3</p>
                <p className="text-[11px] text-muted-foreground">Acertadas</p>
              </div>
              <div className="rounded-xl border p-3 text-center" style={cardStat(COR_ERRO)}>
                <XCircle className="mx-auto mb-1 h-4 w-4" style={{ color: COR_ERRO }} />
                <p className="text-xl font-bold tabular-nums" style={{ color: COR_ERRO }}>1</p>
                <p className="text-[11px] text-muted-foreground">Erradas</p>
              </div>
              <div className="rounded-xl border p-3 text-center" style={cardStat(COR_BRANCO)}>
                <FileText className="mx-auto mb-1 h-4 w-4" style={{ color: COR_BRANCO }} />
                <p className="text-xl font-bold tabular-nums" style={{ color: COR_BRANCO }}>1</p>
                <p className="text-[11px] text-muted-foreground">Em branco</p>
              </div>
              <div className="rounded-xl border p-3 text-center" style={cardStat(COR_MEDIA)}>
                <Trophy className="mx-auto mb-1 h-4 w-4" style={{ color: COR_MEDIA }} />
                <p className="text-xl font-bold tabular-nums" style={{ color: COR_MEDIA }}>60%</p>
                <p className="text-[11px] text-muted-foreground">Média</p>
              </div>
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Stat icon={CheckCircle2} valor="4" label="Marcadas" />
              <Stat icon={FileText} valor="1" label="Em branco" />
            </div>
          )}

          <div className="mt-5 grid grid-cols-2 gap-2">
            <div className={BTN_CADERNO} style={STYLE_CADERNO}><FileText className="mr-1.5 h-4 w-4" /> Caderno de gabarito PDF</div>
            <div className={BTN_CADERNO} style={STYLE_CADERNO}><FileStack className="mr-1.5 h-4 w-4" /> Enunciados PDF</div>
          </div>

          {/* Voltar ao menu — logo abaixo dos downloads */}
          {/* Cadernos "como você fez" (sem gabarito), um por modalidade — a navegação fica na barra superior. */}
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <div className={cn(BTN_CADERNO, 'h-11 w-full')} style={STYLE_CADERNO}><FileStack className="mr-1.5 h-4 w-4" /> Folha de Respostas</div>
            <div className={cn(BTN_CADERNO, 'h-11 w-full')} style={STYLE_CADERNO}><FileStack className="mr-1.5 h-4 w-4" /> Enunciados</div>
            <div className={cn(BTN_CADERNO, 'h-11 w-full')} style={STYLE_CADERNO}><FileStack className="mr-1.5 h-4 w-4" /> Caderno Completo</div>
          </div>
        </div>

        {/* Desempenho por matéria — só quando o gabarito está liberado */}
        {liberado && (
          <div className="relative overflow-hidden rounded-2xl border bg-card p-5 pt-6 shadow-sm">
            <FitaTopo />
            <h2 className="mb-3 text-sm font-semibold">Desempenho por matéria</h2>
            <div className="space-y-3">
              {stats.map((s) => (
                <div key={s.disciplina} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{s.disciplina}</span>
                    <span className="text-muted-foreground">{s.acertos}/{s.total} · {s.percentual}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className={cn('h-full rounded-full', s.percentual >= 70 ? 'bg-green-500' : s.percentual >= 50 ? 'bg-amber-500' : 'bg-red-500')} style={{ width: `${s.percentual}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Grid: revisão à esquerda + navegador fixo à direita (mesmo modo da prova) */}
        <div className="grid gap-4 lg:grid-cols-[1fr_14rem] lg:gap-10">
          {/* Coluna: revisão — apenas a primeira questão (demo: gabarito alterado) */}
          <div className="space-y-3">
            <div className="relative overflow-hidden rounded-xl border bg-card">
              <FitaTopo />
              <div className="space-y-3 p-4 pt-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex h-7 min-w-7 items-center justify-center rounded-md bg-muted px-2 text-sm font-semibold">1</span>
                  {liberado ? (
                    <span className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ background: `color-mix(in oklab, ${COR_ERRO} 15%, var(--card))`, color: COR_ERRO }}>
                      <XCircle className="h-3.5 w-3.5" /> Errou
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                      <Circle className="h-3.5 w-3.5" /> Respondida
                    </span>
                  )}
                </div>
                <p className="text-sm leading-relaxed">Enunciado de exemplo da primeira questão do simulado, exibido na revisão após o encerramento.</p>

                {/* Gabarito alterado após a resposta (só com gabarito liberado) */}
                {liberado && (
                  <div className="rounded-md border p-3 text-xs" style={{ borderColor: COR_ALT, background: `color-mix(in oklab, ${COR_ALT} 10%, var(--card))` }}>
                    <p className="mb-1 flex items-center gap-1.5 font-semibold" style={{ color: COR_ALT }}>
                      <RefreshCw className="h-3.5 w-3.5" /> Esta questão teve a alternativa correta alterada
                    </p>
                    <p className="leading-relaxed">A alternativa correta mudou de <strong>A</strong> para <strong>B</strong>. Você marcou <strong>C</strong>.</p>
                  </div>
                )}

                <div className="space-y-2">
                  {alts.map((alt) => {
                    const correta = liberado && alt.correta
                    const erradaMarcada = liberado && alt.marcada && !alt.correta
                    const antesCorreta = liberado && alt.corretaAntes && !correta
                    const boxStyle: React.CSSProperties | undefined =
                      correta ? { borderColor: COR_ACERTO, background: `color-mix(in oklab, ${COR_ACERTO} 10%, var(--card))` }
                      : erradaMarcada ? { borderColor: COR_ERRO, background: `color-mix(in oklab, ${COR_ERRO} 10%, var(--card))` }
                      : antesCorreta ? { borderColor: COR_ALT, background: `color-mix(in oklab, ${COR_ALT} 8%, var(--card))` }
                      : undefined
                    const letraStyle: React.CSSProperties | undefined =
                      correta ? { borderColor: COR_ACERTO, background: COR_ACERTO, color: '#fff' }
                      : erradaMarcada ? { borderColor: COR_ERRO, background: COR_ERRO, color: '#fff' }
                      : antesCorreta ? { borderColor: COR_ALT, color: COR_ALT }
                      : undefined
                    return (
                      <div key={alt.l} className={cn(
                        'flex items-start gap-3 rounded-lg border p-3 text-sm',
                        !correta && !erradaMarcada && !antesCorreta && alt.marcada && 'border-primary bg-primary/5',
                      )}
                      style={boxStyle}>
                        <span className={cn(
                          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold',
                          !correta && !erradaMarcada && !antesCorreta && 'border-muted-foreground/30 text-muted-foreground',
                        )}
                        style={letraStyle}>{alt.l}</span>
                        <span className="flex-1">{alt.texto}</span>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {alt.marcada && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Sua resposta</span>}
                          {antesCorreta && <span className="rounded px-1.5 py-0.5 text-[10px] font-medium text-white" style={{ background: COR_ALT }}>Correta antes</span>}
                          {correta && <CheckCircle2 className="h-4 w-4" style={{ color: COR_ACERTO }} />}
                          {erradaMarcada && <XCircle className="h-4 w-4" style={{ color: COR_ERRO }} />}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Justificativa — cor segue acerto/erro (aqui: errou) */}
                {liberado && (
                  <div className="rounded-md border p-3 text-sm" style={{ borderColor: COR_ERRO, background: `color-mix(in oklab, ${COR_ERRO} 10%, var(--card))` }}>
                    <p className="mb-1 text-xs font-semibold" style={{ color: COR_ERRO }}>Justificativa</p>
                    <p className="leading-relaxed">Explicação da questão exibida quando o gabarito é liberado — a moldura segue a cor de acerto (verde) ou erro (vermelho) do aluno.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Navegador de questões — card lateral direito (mesmo modo da prova) */}
          <aside>
            <div className="relative overflow-hidden rounded-xl border bg-card pb-2 pt-3 lg:sticky lg:top-4">
              <FitaTopo />
              <div className="px-4">
                <p className="text-center text-sm font-semibold">Navegador de questões</p>
                <div className="mt-2 mb-3 border-t" />
                <div className="grid grid-cols-5 gap-1.5 px-1.5 py-1">
                  {nav.map((q) => {
                    let st: React.CSSProperties | undefined
                    let cls = 'bg-muted text-muted-foreground'
                    if (q.tipo === 'anulada') { cls = 'text-white'; st = { background: COR_ANUL, textDecoration: 'line-through' } }
                    else if (q.tipo === 'alt') { cls = 'text-white'; st = { background: COR_ALT } }
                    else if (liberado && q.tipo === 'acertou') { cls = 'text-white'; st = { background: COR_ACERTO } }
                    else if (liberado && q.tipo === 'errou') { cls = 'text-white'; st = { background: COR_ERRO } }
                    else if (q.respondida) { cls = 'text-white'; st = { background: COR_MARCADA } }
                    return (
                      <span key={q.n} className={cn('flex aspect-square items-center justify-center rounded-md text-xs font-bold', cls)} style={st}>{q.n}</span>
                    )
                  })}
                </div>
                <div className="mt-4 space-y-1.5 border-t pt-3 text-xs text-muted-foreground">
                  {liberado ? (
                    <>
                      <div className="flex items-center gap-2"><span className="h-3 w-3 rounded" style={{ background: COR_ACERTO }} /> Acertou (1)</div>
                      <div className="flex items-center gap-2"><span className="h-3 w-3 rounded" style={{ background: COR_ERRO }} /> Errou (1)</div>
                      <div className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-muted" /> Sem resposta (1)</div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2"><span className="h-3 w-3 rounded" style={{ background: COR_MARCADA }} /> Respondidas (4)</div>
                      <div className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-muted" /> Em branco (1)</div>
                    </>
                  )}
                  <div className="flex items-center gap-2"><span className="h-3 w-3 rounded" style={{ background: COR_ANUL }} /> Anuladas (1)</div>
                  <div className="flex items-center gap-2"><span className="h-3 w-3 rounded" style={{ background: COR_ALT }} /> Alternativa trocada (1)</div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
