import { resolveTemaDark } from '@/lib/hud/resolve-dark'
import { createAdminClient } from '@/lib/supabase/server'
import { EmbedLoginForm } from '@/components/embed/embed-login-form'
import { BookOpen } from 'lucide-react'
import { resolverHudConfig } from '@/lib/hud/resolve-hud'
import { lerAparenciaAuth } from '@/lib/brand/aparencia-auth'
import { EntradaReal } from '@/components/brand/simulado/meq/entrada-real'
import { AppearanceSeed } from '@/components/brand/appearance-seed'
import { FontScaleInit } from '@/components/font-scale-init'
import type { SimTheme, TipoResposta } from '@/components/brand/simulado/types'
import type { Metadata } from 'next'
import { cache } from 'react'

interface PageProps {
  searchParams: Promise<{ token?: string }>
}

// Título da aba = nome do tenant DO TOKEN (não do host). Antes, em localhost/sem subdomínio, caía no
// tenant padrão (Revisão) → a aba mostrava "Revisão" mesmo num simulado do VND.
export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const { token } = await searchParams
  if (!token) return { title: 'Simulado' }
  const sim = await fetchSimulado(token)
  if (!sim) return { title: 'Simulado' }
  const b = await fetchBranding(sim.tenant_id)
  return { title: b?.nome ? `${b.nome} · Simulado` : 'Simulado' }
}

/** Aviso simples (sem token / simulado inexistente). */
function Aviso({ titulo, msg, erro }: { titulo: string; msg: string; erro?: boolean }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="space-y-3 text-center">
        <BookOpen className={`mx-auto h-10 w-10 ${erro ? 'text-destructive' : 'text-muted-foreground'}`} />
        <h2 className="text-base font-semibold">{titulo}</h2>
        <p className="text-sm text-muted-foreground">{msg}</p>
      </div>
    </div>
  )
}

// cache(): dedupe por request — generateMetadata e a página compartilham o mesmo resultado.
const fetchSimulado = cache(async (token: string) => {
  try {
    const svc = createAdminClient()
    const { data } = await svc
      .from('simulado_simulados')
      .select('id, titulo, metodo_identificacao, tenant_id, status, data_inicio, data_fim, tempo_limite_min')
      .eq('embed_token', token)
      .single()
    return data ?? null
  } catch {
    return null
  }
})

const fetchBranding = cache(async (tenantId: string) => {
  try {
    const svc = createAdminClient()
    const { data: t } = await svc.from('simulado_tenants').select('nome, slug, tema').eq('id', tenantId).maybeSingle()
    const tema = (t?.tema ?? {}) as any
    // Marca + tema default do tenant (mesma resolução do portal / de /simulado/[token]).
    const ap = lerAparenciaAuth(tema, { slug: (t as any)?.slug ?? null, nome: t?.nome ?? null })
    const temaInicial: SimTheme = ap.defaultTheme === 'escuro' ? 'escuro' : ap.defaultTheme === 'azul' ? 'azul' : 'claro'
    return {
      nome: tema.nome_site ?? t?.nome ?? 'Simulado',
      brand: ap.brand,
      internoAtivo: ap.internoAtivo,
      temaInicial,
      // Aparência COMPLETA p/ semear os loaders pela marca do TOKEN (não a do host).
      aparencia: ap,
      logoUrl: (tema.logo_url ?? null) as string | null,
      logoGrandeUrl: (tema.logo_grande_url ?? null) as string | null,
      logoBg: (tema.logo_png_bg ?? '#ffffff') as string,
      logoEstilo: (tema.logo_estilo ?? 'arredondado') as string,
    }
  } catch {
    return null
  }
})

// Info da prova p/ a entrada branded (nº de questões, tipo A–E/CE, permite folha). Espelha /simulado/[token].
async function fetchInfoProva(simuladoId: string, tenantId: string): Promise<{ nQuestoes: number | null; tipo: TipoResposta; permiteFolha: boolean }> {
  try {
    const svc = createAdminClient()
    const [{ count }, amostra, simRow] = await Promise.all([
      svc.from('simulado_prova_questoes').select('questao_id', { count: 'exact', head: true }).eq('simulado_id', simuladoId).eq('tenant_id', tenantId),
      svc.from('simulado_prova_questoes').select('questao_id').eq('simulado_id', simuladoId).eq('tenant_id', tenantId).limit(30),
      svc.from('simulado_simulados').select('regras, embed_ativo').eq('id', simuladoId).maybeSingle(),
    ])
    // CE = questão objetiva com EXATAMENTE 2 alternativas (Certo/Errado) — mesma regra do runner (ehCE).
    let tipo: TipoResposta = 'ABCDE'
    const ids = ((amostra.data ?? []) as any[]).map((r) => r.questao_id)
    if (ids.length) {
      const { data: qs } = await svc.from('simulado_questoes').select('id, tipo').in('id', ids)
      const objIds = ((qs ?? []) as any[]).filter((q) => q.tipo !== 'discursiva').map((q) => q.id)
      if (objIds.length) {
        const { data: alts } = await svc.from('simulado_alternativas').select('questao_id').in('questao_id', objIds)
        const nAlt = new Map<string, number>()
        for (const a of ((alts ?? []) as any[])) nAlt.set(a.questao_id, (nAlt.get(a.questao_id) ?? 0) + 1)
        const ce = objIds.filter((id) => (nAlt.get(id) ?? 0) === 2).length
        if (ce > objIds.length / 2) tipo = 'CE'
      }
    }
    const regras = ((simRow.data as any)?.regras ?? {}) as Record<string, unknown>
    const permiteFolha = regras.permite_folha !== false && regras.folha_ativa !== false
    return { nQuestoes: count ?? null, tipo, permiteFolha }
  } catch {
    return { nQuestoes: null, tipo: 'ABCDE', permiteFolha: true }
  }
}

/**
 * Login do aluno para o simulado (página cheia). Mesmo visual/HUD do embed:
 * cores da página "login" do caderno vinculado, pop-ups por cima, e ao identificar
 * segue para /simulado/[token] com a animação de entrada.
 */
export default async function AlunoLoginPage({ searchParams }: PageProps) {
  const { token } = await searchParams

  if (!token) {
    return <Aviso titulo="Link de acesso ausente" msg="Use o link do simulado enviado pela sua plataforma." />
  }

  const simulado = await fetchSimulado(token)
  if (!simulado) {
    return <Aviso erro titulo="Simulado não encontrado" msg="O link de acesso é inválido ou o simulado não está disponível." />
  }

  const metodo = (simulado.metodo_identificacao ?? 'email_cpf') as 'email' | 'email_cpf' | 'email_telefone'
  const [branding, dark] = await Promise.all([
    fetchBranding(simulado.tenant_id),
    resolveTemaDark(),
  ])

  // Entrada BRANDED da marca (mesma regra de /simulado/[token]): MEQ sempre; Revisão/VND com internoAtivo.
  // Antes o link do admin (/aluno/login) caía SEMPRE no EmbedLoginForm genérico (roxo), ignorando a marca
  // — por isso o simulado do VND abria com o visual do Revisão (e título da aba do Revisão).
  // POR ENQUANTO: só os modelos NOVOS (entrada branded) como padrão em TODOS os tenants — HUD/
  // EmbedLoginForm desativada no login. (Reversível.) Fallback: sem branding → genérico.
  const usaEntradaNova = !!branding
  if (usaEntradaNova && branding) {
    const info = await fetchInfoProva(simulado.id, simulado.tenant_id)
    return (
      <>
        <AppearanceSeed appearance={branding.aparencia} />
        <FontScaleInit scope={`aluno:${token}`} />
        <EntradaReal
          token={token}
          brand={branding.brand}
          loadingStyle={branding.aparencia.loadingStyle}
          logoUrl={branding.logoUrl}
          metodo={metodo}
          temaInicial={dark ? 'escuro' : branding.temaInicial}
          plataforma={branding.nome}
          agoraISO={new Date().toISOString()}
          prova={{
            titulo: simulado.titulo,
            status: simulado.status,
            dataInicio: simulado.data_inicio,
            dataFim: simulado.data_fim,
            tempoLimiteMin: simulado.tempo_limite_min,
            nQuestoes: info.nQuestoes,
            tipo: info.tipo,
            banca: info.tipo === 'CE' ? 'Padrão Cebraspe · Certo ou Errado' : 'Objetiva A–E',
            subtitulo: '',
            curto: 'CADERNO DE PROVA · SIMULADO',
            permiteFolha: info.permiteFolha,
          }}
        />
      </>
    )
  }

  // Fallback (demais marcas / sem internoAtivo): EmbedLoginForm genérico.
  const hud = await resolverHudConfig(simulado.id, simulado.tenant_id)
  return (
    <EmbedLoginForm
      token={token}
      destino="simulado"
      metodo={metodo}
      simuladoTitulo={simulado.titulo}
      branding={branding}
      darkInicial={dark}
      hud={{ base: hud.base, porPagina: hud.porPagina }}
      prova={{
        status: simulado.status,
        dataInicio: simulado.data_inicio,
        dataFim: simulado.data_fim,
        tempoLimiteMin: simulado.tempo_limite_min,
      }}
    />
  )
}
