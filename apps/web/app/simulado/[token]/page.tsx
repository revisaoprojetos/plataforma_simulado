import { resolveTemaDark } from '@/lib/hud/resolve-dark'
import { createAdminClient } from '@/lib/supabase/server'
import { resolverHudConfig } from '@/lib/hud/resolve-hud'
import { HUD_CORES_PADRAO, type HudCores, type HudPorPagina } from '@/lib/caderno-designer/types'
import { EmbedLoginForm } from '@/components/embed/embed-login-form'
import { AlertCircle } from 'lucide-react'
import { ProvaClient } from './prova-client'
import { FontScaleInit } from '@/components/font-scale-init'
import { lerAparenciaAuth } from '@/lib/brand/aparencia-auth'
import { EntradaReal } from '@/components/brand/simulado/meq/entrada-real'
import type { SimTheme, TipoResposta } from '@/components/brand/simulado/types'

// Página cheia da prova (acesso pelo portal do aluno ou por link direto).
// - Sem `?st=`: mostra a tela de identificação (branded) que, ao validar, redireciona
//   para `?st=<sessao>` — assim o aluno vê o login/carregamento com a marca do tenant.
// - Com `?st=`: renderiza o runner, com o HUD do caderno resolvido no servidor (sem flash).
export default async function ProvaPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ st?: string }> }) {
  const { token } = await params
  const { st } = await searchParams

  const sim = await fetchSimulado(token)
  const dark = await resolveTemaDark()

  // HUD (cores/estilo por página) do caderno vinculado — login e prova seguem o designer.
  let base: HudCores = HUD_CORES_PADRAO
  let porPagina: HudPorPagina = {}
  if (sim) {
    try {
      const hud = await resolverHudConfig(sim.id, sim.tenant_id)
      base = hud.base
      porPagina = hud.porPagina
    } catch { /* fallback padrão */ }
  }
  const branding = sim ? await fetchBranding(sim.tenant_id) : null

  // Sem sessão na URL → identificação branded (login por e-mail/CPF/telefone).
  if (!st) {
    if (!sim) return <SimuladoNaoEncontrado />
    const metodo = (sim.metodo_identificacao ?? 'email') as 'email' | 'email_cpf' | 'email_telefone'

    // MEQ: a entrada usa o layout "caderno de prova" (spec 06 §1) ligado aos dados reais.
    // Revisão e VND (quando `internoAtivo`): usam a MESMA entrada no design novo da marca. As demais
    // (e Revisão/VND sem internoAtivo) seguem o EmbedLoginForm genérico — produção intacta.
    // Antes o VND ficava de fora → o login do SIMULADO do VND caía no form genérico (não branded).
    const usaEntradaNova = branding?.brand === 'meq' || ((branding?.brand === 'revisao' || branding?.brand === 'vnd') && !!branding.internoAtivo)
    if (usaEntradaNova) {
      const info = await fetchInfoProva(sim.id, sim.tenant_id)
      return (
        <>
          <FontScaleInit scope={`aluno:${token}`} />
          <EntradaReal
            token={token}
            brand={branding!.brand}
            metodo={metodo}
            temaInicial={dark ? 'escuro' : branding!.temaInicial}
            plataforma={branding!.nome}
            agoraISO={new Date().toISOString()}
            prova={{
              titulo: sim.titulo,
              status: sim.status,
              dataInicio: sim.data_inicio,
              dataFim: sim.data_fim,
              tempoLimiteMin: sim.tempo_limite_min,
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

    return (
      <EmbedLoginForm
        token={token}
        metodo={metodo}
        simuladoTitulo={sim.titulo}
        branding={branding}
        destino="simulado"
        darkInicial={dark}
        hud={{ base, porPagina }}
        prova={{ status: sim.status, dataInicio: sim.data_inicio, dataFim: sim.data_fim, tempoLimiteMin: sim.tempo_limite_min }}
      />
    )
  }

  // Com sessão → runner temado.
  const brandingSimples = branding
    ? { logoUrl: branding.logoUrl, logoBg: branding.logoBg, logoEstilo: branding.logoEstilo }
    : null
  return (
    <>
      {/* Anti-flash: aplica a escala de fonte salva (por token do simulado) antes do 1º paint. */}
      <FontScaleInit scope={`aluno:${token}`} />
      <ProvaClient token={token} hudInicial={{ base, porPagina, branding: brandingSimples }} darkInicial={dark} internoAtivo={branding?.brand === 'revisao' && !!branding?.internoAtivo} />
    </>
  )
}

function SimuladoNaoEncontrado() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="space-y-3 text-center">
        <AlertCircle className="mx-auto h-10 w-10 text-destructive" />
        <h2 className="text-base font-semibold">Simulado não encontrado</h2>
        <p className="text-sm text-muted-foreground">O link de acesso é inválido ou o simulado não está disponível.</p>
      </div>
    </div>
  )
}

async function fetchSimulado(embedToken: string): Promise<{
  id: string
  titulo: string
  metodo_identificacao: string | null
  tenant_id: string
  status: string | null
  data_inicio: string | null
  data_fim: string | null
  tempo_limite_min: number | null
} | null> {
  try {
    const svc = createAdminClient()
    const { data } = await svc
      .from('simulado_simulados')
      .select('id, titulo, metodo_identificacao, tenant_id, status, data_inicio, data_fim, tempo_limite_min')
      .eq('embed_token', embedToken)
      .maybeSingle()
    return (data as any) ?? null
  } catch {
    return null
  }
}

/** Marca do tenant (logo + nome + brand/tema) para login/prova seguirem a configuração. */
async function fetchBranding(tenantId: string) {
  try {
    const svc = createAdminClient()
    const { data: t } = await svc.from('simulado_tenants').select('nome, slug, tema').eq('id', tenantId).maybeSingle()
    const tema = (t?.tema ?? {}) as any
    // Marca + tema default do tenant (mesma resolução do portal — lib/brand/aparencia-auth).
    const ap = lerAparenciaAuth(tema, { slug: (t as any)?.slug ?? null, nome: t?.nome ?? null })
    const temaInicial: SimTheme = ap.defaultTheme === 'escuro' ? 'escuro' : ap.defaultTheme === 'azul' ? 'azul' : 'claro'
    return {
      nome: tema.nome_site ?? t?.nome ?? 'Simulado',
      brand: ap.brand,
      internoAtivo: ap.internoAtivo,
      temaInicial,
      logoUrl: (tema.logo_url ?? null) as string | null,
      logoGrandeUrl: (tema.logo_grande_url ?? null) as string | null,
      logoBg: (tema.logo_png_bg ?? '#ffffff') as string,
      logoEstilo: (tema.logo_estilo ?? 'arredondado') as string,
    }
  } catch {
    return null
  }
}

/** Nº de questões, tipo (CE/A–E) e se o simulado permite abrir só a folha de respostas. */
async function fetchInfoProva(simuladoId: string, tenantId: string): Promise<{ nQuestoes: number | null; tipo: TipoResposta; permiteFolha: boolean }> {
  try {
    const svc = createAdminClient()
    const [{ count }, amostra, simRow] = await Promise.all([
      svc.from('simulado_prova_questoes').select('questao_id', { count: 'exact', head: true }).eq('simulado_id', simuladoId).eq('tenant_id', tenantId),
      svc.from('simulado_prova_questoes').select('questao_id').eq('simulado_id', simuladoId).eq('tenant_id', tenantId).limit(30),
      svc.from('simulado_simulados').select('regras, embed_ativo').eq('id', simuladoId).maybeSingle(),
    ])
    // Tipo: amostra os tipos das questões vinculadas; se a maioria é 'ce', trata como Certo/Errado.
    let tipo: TipoResposta = 'ABCDE'
    const ids = ((amostra.data ?? []) as any[]).map((r) => r.questao_id)
    if (ids.length) {
      const { data: qs } = await svc.from('simulado_questoes').select('tipo').in('id', ids)
      const ce = ((qs ?? []) as any[]).filter((q) => String(q.tipo ?? '').toLowerCase().includes('ce') || String(q.tipo ?? '').toLowerCase().includes('certo')).length
      if (ce > ids.length / 2) tipo = 'CE'
    }
    const regras = ((simRow.data as any)?.regras ?? {}) as Record<string, unknown>
    // Folha de respostas: por padrão permitida; desligada por regra explícita.
    const permiteFolha = regras.permite_folha !== false && regras.folha_ativa !== false
    return { nQuestoes: count ?? null, tipo, permiteFolha }
  } catch {
    return { nQuestoes: null, tipo: 'ABCDE', permiteFolha: true }
  }
}
