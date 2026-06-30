import { getTenantTheme } from '@/lib/tenant-theme'
import { Loader, type EstiloLoader } from '@/components/admin/loaders'

/** Tela de carregamento no estilo configurado em Configurações → Carregamento. */
export async function AppLoading() {
  const { tema } = await getTenantTheme()
  const estilo = (((tema as any)?.loading_estilo as EstiloLoader) ?? 'skeleton') as EstiloLoader
  return <Loader estilo={estilo} />
}
