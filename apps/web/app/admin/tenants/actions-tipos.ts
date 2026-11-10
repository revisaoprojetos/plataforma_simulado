// Tipos de actions.ts — sem 'use server' para não quebrar o next build

export type VisibilidadeModo = 'todos' | 'so_admin' | 'so_super' | 'oculta'

export interface AparenciaInput {
  nome_site?: string | null
  subtitulo_site?: string | null
  titulo_pagina?: string | null
  cor_primaria?: string | null
  cor_secundaria?: string | null
  cor_accent?: string | null
  modo_padrao?: string | null
  logo_url?: string | null
}

export interface EmbedConfigInput {
  ativo: boolean
  origens_permitidas: string[]
  metodo_identificacao: string
  otp_email: boolean
}

export type RbacCategoria = { id: string; nome: string; cor: string }
