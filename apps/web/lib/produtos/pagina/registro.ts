// CONTRATO do registro de elementos (só tipos). A definição (metadados) está em catalogo.ts; o RENDERER é do P3.
import type { ComponentType } from 'react'
import type { BlocoAny, BlocoV1, ConteudoPorTipo, Dispositivo, TipoElemento, EstiloBloco, Visibilidade } from './tipos'

export type TipoCampo = 'texto' | 'rich' | 'imagem' | 'link' | 'token-cor' | 'seletor' | 'toggle' | 'numero'

export interface CampoDef {
  /** Caminho no bloco: 'nome' | 'conteudo.<chave>' | 'estilo.<chave>' (ex.: 'conteudo.titulo', 'estilo.fundo'). */
  chave: string
  rotulo: string
  tipo: TipoCampo
  grupo: 'conteudo' | 'estilo' | 'avancado'
  ajuda?: string
  placeholder?: string
  opcoes?: { v: string; rotulo: string }[]        // seletor
  min?: number; max?: number; passo?: number       // numero
  max_chars?: number                               // texto/rich
  /** Mostra o campo só quando outro valor do bloco bater (ex.: { chave: 'conteudo.mostrar_botao', igual: true }). */
  visivelSe?: { chave: string; igual: unknown }
  /** 'inline' = o canvas pode editar no lugar (clique no texto); senão só o painel. */
  inline?: boolean
}

export interface VariacaoDef { id: string; rotulo: string }

export interface ContextoAdicionar { blocos: BlocoAny[]; temInstrutores: boolean }

export interface ElementoDef<T extends TipoElemento = TipoElemento> {
  tipo: T
  rotulo: string
  descricao: string
  /** Nome do ícone lucide-react (string, p/ manter este módulo sem JSX). NUNCA 'Sparkles'. */
  icone: string
  categoria: 'estrutura' | 'conteudo' | 'midia' | 'acao'
  variacoes: VariacaoDef[]
  /** Valores iniciais de um bloco NOVO (sem id). */
  defaults(): { variacao: string; nome?: string; conteudo: ConteudoPorTipo[T]; estilo?: EstiloBloco; visib?: Visibilidade }
  schema: CampoDef[]
  podeAdicionar(ctx: ContextoAdicionar): boolean
  /** true = no máximo 1 por página (hero, avisos, continuar, progresso). */
  unico?: boolean
  /** true = não pode ser removido (apenas ocultado). Nenhum por enquanto. */
  fixo?: boolean
}

export type CatalogoElementos = { [K in TipoElemento]: ElementoDef<K> }

export type ModoRender = 'aluno' | 'edicao'

/** Dados já carregados no servidor (ver loader.ts → DadosPagina). Os renderers NÃO consultam nada. */
export interface RenderProps<T extends TipoElemento = TipoElemento> {
  bloco: BlocoV1<T>
  modo: ModoRender
  dispositivo: Dispositivo
  dados: import('./dados').DadosPagina
}

/** Um renderer por tipo (P3 registra em components/produtos/pagina/registro-renderers.tsx). */
export type RendererElemento<T extends TipoElemento = TipoElemento> = ComponentType<RenderProps<T>>
