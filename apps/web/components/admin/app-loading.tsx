import { getTenantTheme } from '@/lib/tenant-theme'
import { Loader, type EstiloLoader } from '@/components/admin/loaders'

/**
 * Tela de carregamento no estilo configurado em Configurações → Carregamento.
 * O `data-app-loading` marca este bloco como LOADER DE ROTA: a CascataEntrada o mostra
 * normalmente e só dispara a cascata quando o conteúdo real substitui o loader (o marcador some).
 */
export async function AppLoading() {
  const { tema } = await getTenantTheme()
  const estilo = (((tema as any)?.loading_estilo as EstiloLoader) ?? 'skeleton') as EstiloLoader
  return <div data-app-loading>{<Loader estilo={estilo} />}</div>
}
