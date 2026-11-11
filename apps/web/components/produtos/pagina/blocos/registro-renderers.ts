// REGISTRO tipo → renderer (compartilhado admin/aluno). Metadados/schema de cada tipo: lib/produtos/pagina/catalogo.ts.
import type { RendererElemento } from '@/lib/produtos/pagina/registro'
import type { TipoElemento } from '@/lib/produtos/pagina/tipos'
import { RendererHero } from './hero'
import { RendererAvisos, RendererContinuar, RendererProgresso } from './simples'
import { RendererModulos } from './modulos'
import { RendererCronograma } from './cronograma'
import { RendererCarrossel, RendererBanner } from './vitrine'
import { RendererTexto, RendererBotao, RendererDivisor, RendererInstrutores } from './livres'

export const RENDERERS: Record<TipoElemento, RendererElemento<any>> = {
  hero: RendererHero, avisos: RendererAvisos, progresso: RendererProgresso, continuar: RendererContinuar,
  modulos: RendererModulos, cronograma: RendererCronograma, carrossel: RendererCarrossel, banner: RendererBanner,
  texto: RendererTexto, botao: RendererBotao, divisor: RendererDivisor, instrutores: RendererInstrutores,
}
