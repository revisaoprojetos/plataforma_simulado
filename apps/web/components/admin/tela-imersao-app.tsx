import { getTenantTheme } from '@/lib/tenant-theme'
import { TelaImersao, type EstiloImersao } from '@/components/admin/tela-imersao'

/** Tela de imersão full-screen com a config salva (estilo/logo/mensagem). */
export async function TelaImersaoApp({ mensagem }: { mensagem?: string }) {
  const { tema, tenantNome } = await getTenantTheme()
  const t = (tema ?? {}) as any
  return (
    <TelaImersao
      estilo={(t.splash_estilo as EstiloImersao) ?? 'spinner'}
      logo={t.splash_logo ?? t.logo_url ?? null}
      nome={t.nome_site ?? tenantNome ?? 'Plataforma'}
      mensagem={mensagem ?? t.splash_mensagem ?? 'Carregando…'}
    />
  )
}
