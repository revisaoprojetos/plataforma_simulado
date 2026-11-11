// CONTRATO DE DADOS da página do extensivo (editor visual). TS puro — usável no cliente e no servidor.
import type { TokenCor } from './tokens'

export type TipoElemento =
  | 'hero' | 'avisos' | 'progresso' | 'continuar' | 'modulos' | 'cronograma'
  | 'carrossel' | 'banner' | 'texto' | 'botao' | 'divisor' | 'instrutores'

export type Espaco = 'sm' | 'md' | 'lg'
export type Raio = 'none' | 'sm' | 'md' | 'lg' | 'full'
export type Alinhamento = 'left' | 'center' | 'right'
export type Dispositivo = 'desktop' | 'tablet' | 'mobile'

export interface EstiloBloco {
  cor?: TokenCor        // cor de destaque/texto principal do elemento
  fundo?: TokenCor      // fundo do elemento
  espaco?: Espaco       // respiro vertical (margem externa)
  raio?: Raio
  alinhamento?: Alinhamento
}
export type Visibilidade = Record<Dispositivo, boolean>

// ───────── conteúdo por tipo ─────────
export interface ConteudoHero {
  mostrar_voltar: boolean; mostrar_logo: boolean; mostrar_descricao: boolean; mostrar_validade: boolean
  titulo: string        // '' = nome do produto
  descricao: string     // '' = descrição do produto
  imagem: string        // '' = banner do produto
}
export interface ConteudoAvisos { max: number }                                   // 1..10 (fonte: simulado_produto_avisos)
export interface ConteudoContinuar { titulo: string; mostrar_barra: boolean; mostrar_proximo: boolean }
export type ConteudoProgresso = Record<string, never>
export interface ConteudoModulos {
  modulo_ids: string[]; restantes: boolean; recolhivel: boolean; recolhida: boolean; agrupar_prefixo: boolean
}
export interface ConteudoCronograma {
  titulo: string; subtitulo: string; texto_botao: string
  mostrar_metas: boolean; mostrar_progresso: boolean; mostrar_atrasadas: boolean; mostrar_hoje: boolean; mostrar_botao: boolean
  qtd_metas: number; cronograma_id: string | null
}
export interface ItemCarrossel { tipo_item: string; item_id: string }
export type TamanhoCarrossel = 'vertical_small' | 'vertical_large' | 'horizontal_small' | 'horizontal_large' | 'destaque'
export interface ConteudoCarrossel { itens: ItemCarrossel[]; tamanho: TamanhoCarrossel; ordenacao: 'manual' | 'alfabetica' | 'recentes' }
export interface ConteudoBanner { imagem: string; imagem_mobile: string; link: string; alt: string }
export interface ConteudoTexto { titulo: string; html: string }                 // html SANITIZADO (whitelist) — ver normalizar.ts
export interface ConteudoBotao { rotulo: string; link: string; nova_aba: boolean }
export interface ConteudoDivisor { rotulo: string }
export interface ConteudoInstrutores { titulo: string; ids: string[] }          // [] = todos os instrutores do produto

export interface ConteudoPorTipo {
  hero: ConteudoHero; avisos: ConteudoAvisos; progresso: ConteudoProgresso; continuar: ConteudoContinuar
  modulos: ConteudoModulos; cronograma: ConteudoCronograma; carrossel: ConteudoCarrossel; banner: ConteudoBanner
  texto: ConteudoTexto; botao: ConteudoBotao; divisor: ConteudoDivisor; instrutores: ConteudoInstrutores
}

export interface BlocoV1<T extends TipoElemento = TipoElemento> {
  id: string
  v: 1
  tipo: T
  variacao: string                 // id de ElementoDef.variacoes
  ativo: boolean
  nome?: string                    // título da seção / rótulo no editor
  conteudo: ConteudoPorTipo[T]
  estilo: EstiloBloco
  visib: Visibilidade
  ancora?: string                  // slug p/ #link (ex.: 'modulos')
}

/** União discriminada (útil para switch por `tipo`). */
export type BlocoAny = { [K in TipoElemento]: BlocoV1<K> }[TipoElemento]

export interface TemaPagina {
  cor?: TokenCor         // acento padrão dos elementos sem `estilo.cor`
  fundo?: TokenCor       // fundo da página (editor/aluno)
  raio?: Raio
  espaco?: Espaco
}
export interface PaginaV1 { v: 1; blocos: BlocoAny[]; tema?: TemaPagina }

export const VISIB_TODOS: Visibilidade = { desktop: true, tablet: true, mobile: true }
