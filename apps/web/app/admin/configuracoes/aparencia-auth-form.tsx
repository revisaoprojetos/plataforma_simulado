'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Save, Loader2, Check, Sun, Moon, Droplet, LogIn, MonitorPlay, Building2, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'
import {
  type Brand,
  type Theme,
  BRANDS,
  catalogoDaMarca,
} from '@/lib/brand/appearance-catalogo'
import { lerAparenciaAuth, type AuthAppearance } from '@/lib/brand/aparencia-auth'

// TODO (próxima fase): os componentes visuais PlatformLogin/PlatformLoader (um por slug, spec 02
// §2 e §3) ainda não existem. Esta tela é só o ATIVADOR — escolhe marca, slug de login, slug de
// carregamento, tema padrão e "seguir sistema", e salva em tema.aparencia_auth. A tela de
// login/loading lerá isso via GET /api/public/appearance.

type Salvar = (t: Record<string, unknown>) => Promise<{ ok?: boolean } | void>

const TEMA_META: Record<Theme, { label: string; Icon: typeof Sun }> = {
  claro: { label: 'Claro', Icon: Sun },
  escuro: { label: 'Escuro', Icon: Moon },
  azul: { label: 'Azul', Icon: Droplet },
}

const BRAND_LABEL: Record<Brand, string> = { revisao: 'Revisão', vnd: 'VND', meq: 'MEQ' }

export function AparenciaAuthForm({ tema, salvarTema }: { tema: any; salvarTema: Salvar }) {
  // Lê a config atual já com fallback por marca (slug inválido → fallback).
  const inicial = useMemo<AuthAppearance>(
    () => lerAparenciaAuth(tema, { slug: tema?.__slug ?? null, nome: tema?.nome_site ?? null }),
    [tema],
  )

  const [cfg, setCfg] = useState<AuthAppearance>(inicial)
  const [pending, start] = useTransition()
  // A marca é uma propriedade DESTA plataforma — por padrão fica travada, mostrando só os estilos
  // dela. "Alterar marca" (recolhido) só é usado na reatribuição rara de onboarding.
  const [trocarAberto, setTrocarAberto] = useState(false)

  const catalogo = catalogoDaMarca(cfg.brand)

  // Ao trocar de marca, re-sanea slugs/tema para os da nova marca (evita slug órfão).
  function trocarMarca(brand: Brand) {
    const next = lerAparenciaAuth({ aparencia_auth: { ...cfg, brand } })
    setCfg(next)
    setTrocarAberto(false)
  }

  function salvar() {
    start(async () => {
      try {
        await salvarTema({ aparencia_auth: cfg })
        toast.success('Aparência de login e carregamento salva!')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erro ao salvar')
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Marca — travada nesta plataforma (só os estilos dela aparecem). */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-primary/10 p-1.5 text-primary"><Building2 className="h-4 w-4" /></span>
          <div>
            <p className="text-sm font-medium">Marca da plataforma</p>
            <p className="text-xs text-muted-foreground">Esta plataforma usa a marca abaixo — só os estilos dela aparecem.</p>
          </div>
        </div>

        {!trocarAberto ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-lg border-2 border-primary bg-primary/5 px-3 py-2.5 text-sm font-semibold text-primary">
              {BRAND_LABEL[cfg.brand]}
            </span>
            <button type="button" onClick={() => setTrocarAberto(true)}
              className="text-xs font-medium text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground">
              Alterar marca
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2 sm:max-w-md">
              {BRANDS.map((b) => (
                <button key={b} type="button" onClick={() => trocarMarca(b)}
                  className={cn('rounded-lg border-2 px-3 py-2.5 text-sm font-medium transition-colors',
                    cfg.brand === b ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:border-primary/50')}>
                  {BRAND_LABEL[b]}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              Trocar a marca redefine os estilos de login/carregamento para os da nova marca. Use só no onboarding.
            </p>
          </div>
        )}
      </section>

      {/* Ativador do NOVO login */}
      <label className="flex items-start gap-3 rounded-xl border bg-muted/20 p-4 cursor-pointer sm:max-w-xl">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Usar o novo login da marca</p>
          <p className="text-xs text-muted-foreground">
            Quando ligado, a tela de login passa a usar o estilo escolhido abaixo. Desligado (padrão),
            mantém o login atual personalizado da plataforma.
          </p>
        </div>
        <Switch checked={cfg.loginAtivo} onCheckedChange={(v) => setCfg((c) => ({ ...c, loginAtivo: v }))} />
      </label>

      {/* Estilo do login */}
      <EstiloGrade
        titulo="Estilo do login"
        Icon={LogIn}
        itens={catalogo.login}
        valor={cfg.loginStyle}
        onPick={(slug) => setCfg((c) => ({ ...c, loginStyle: slug }))}
        desativado={!cfg.loginAtivo}
      />

      {/* Ativador do carregamento branded */}
      <label className="flex items-start gap-3 rounded-xl border bg-muted/20 p-4 cursor-pointer sm:max-w-xl">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Usar o carregamento da marca</p>
          <p className="text-xs text-muted-foreground">
            Tela de carregamento branded (pós-login e no simulado). Desligado, volta ao carregamento genérico.
          </p>
        </div>
        <Switch checked={cfg.loadingAtivo} onCheckedChange={(v) => setCfg((c) => ({ ...c, loadingAtivo: v }))} />
      </label>

      {/* Estilo do carregamento */}
      <EstiloGrade
        titulo="Estilo do carregamento"
        Icon={MonitorPlay}
        itens={catalogo.loading}
        valor={cfg.loadingStyle}
        onPick={(slug) => setCfg((c) => ({ ...c, loadingStyle: slug }))}
        desativado={!cfg.loadingAtivo}
      />

      {/* Tema padrão (antes do login) */}
      <section className="space-y-3">
        <div>
          <p className="text-sm font-medium">Tema padrão</p>
          <p className="text-xs text-muted-foreground">Tema das telas de login/carregamento antes do usuário escolher o seu.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {catalogo.temas.map((t) => {
            const { label, Icon } = TEMA_META[t]
            const ativo = cfg.defaultTheme === t
            return (
              <button key={t} type="button" onClick={() => setCfg((c) => ({ ...c, defaultTheme: t }))}
                className={cn('flex items-center gap-2 rounded-lg border-2 px-4 py-2.5 text-sm font-medium transition-colors',
                  ativo ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:border-primary/50')}>
                <Icon className="h-4 w-4" /> {label}
                {ativo && <Check className="h-4 w-4" />}
              </button>
            )
          })}
        </div>
      </section>

      {/* Ativador do NOVO visual interno (portal do aluno) */}
      <label className="flex items-start gap-3 rounded-xl border bg-muted/20 p-4 cursor-pointer sm:max-w-xl">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Usar o novo visual interno (portal do aluno)</p>
          <p className="text-xs text-muted-foreground">
            Aplica o redesenho das telas internas (Início, Perfil, Resultados, Cronograma…) ligadas aos dados reais.
            Desligado (padrão), mantém o portal atual. Ativado por área conforme cada uma é ligada.
          </p>
        </div>
        <Switch checked={cfg.internoAtivo} onCheckedChange={(v) => setCfg((c) => ({ ...c, internoAtivo: v }))} />
      </label>

      {/* Seguir tema do sistema */}
      <label className="flex items-start gap-3 rounded-xl border bg-muted/20 p-4 cursor-pointer sm:max-w-xl">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Seguir tema do sistema</p>
          <p className="text-xs text-muted-foreground">
            Quando ligado, usa a preferência do dispositivo (claro/escuro) para quem ainda não escolheu um tema.
          </p>
        </div>
        <Switch checked={cfg.followSystemTheme} onCheckedChange={(v) => setCfg((c) => ({ ...c, followSystemTheme: v }))} />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={salvar} disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar aparência
        </button>
        {/* Abre login/carregamento em nova aba com os estilos atuais (sem precisar salvar). */}
        <a
          href={`/login/preview?view=login&brand=${cfg.brand}&login=${encodeURIComponent(cfg.loginStyle)}&loading=${encodeURIComponent(cfg.loadingStyle)}&theme=${cfg.defaultTheme}`}
          target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted">
          <ExternalLink className="h-4 w-4" /> Pré-ver login
        </a>
        <a
          href={`/login/preview?view=loading&brand=${cfg.brand}&login=${encodeURIComponent(cfg.loginStyle)}&loading=${encodeURIComponent(cfg.loadingStyle)}&theme=${cfg.defaultTheme}`}
          target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted">
          <ExternalLink className="h-4 w-4" /> Pré-ver carregamento
        </a>
      </div>
    </div>
  )
}

function EstiloGrade({ titulo, Icon, itens, valor, onPick, desativado = false }: {
  titulo: string
  Icon: typeof LogIn
  itens: { slug: string; nome: string; tags: string[] }[]
  valor: string
  onPick: (slug: string) => void
  desativado?: boolean
}) {
  return (
    <section className={cn('space-y-3', desativado && 'pointer-events-none opacity-50')} aria-disabled={desativado}>
      <div className="flex items-center gap-2">
        <span className="rounded-lg bg-primary/10 p-1.5 text-primary"><Icon className="h-4 w-4" /></span>
        <p className="text-sm font-medium">{titulo}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {itens.map((e) => {
          const ativo = valor === e.slug
          return (
            <button key={e.slug} type="button" onClick={() => onPick(e.slug)}
              className={cn('relative rounded-lg border-2 p-3 text-left transition-colors',
                ativo ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50')}>
              {ativo && <Check className="absolute right-2 top-2 h-4 w-4 text-primary" />}
              <p className="pr-5 text-sm font-medium">{e.nome}</p>
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{e.slug}</p>
              {e.tags.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {e.tags.map((t) => (
                    <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{t}</span>
                  ))}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}
