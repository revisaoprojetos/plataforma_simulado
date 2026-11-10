// Tipos exportados por cadernos-teste/actions.ts — fora do 'use server' para não quebrar o next build.

import type { MaterialCaderno } from '@/lib/caderno-designer/material'

export type RegistroTeste = { id: string; nome: string; vars: Record<string, string>; respostas: Record<string, string> }
export type DiscBancoTeste = { nome: string; chave: string; pilar?: string }
export type QuestaoMeta = { numero: number; disciplinaChave: string; disciplinaNome: string; assunto: string }
export type CadernoTesteGrupo = { id: string; modalidade: string; label: string }
export type CadernoTesteResumo = { id: string; nome: string; atualizadoEm: string | null; itens: CadernoTesteGrupo[]; material: MaterialCaderno; materialEnunciado: MaterialCaderno }
export type MontagemGrupo = { cadernoId: string; cadernoNome: string; itemId: string; modalidade: string; modelo: string; label: string }
export type EntregaRef = { cadernoId?: string; itemId?: string; pdfUrl?: string; pdfNome?: string; docId?: string; versaoId?: string } | null
export type EntregaSlots = { diagnostico?: EntregaRef; folha?: EntregaRef; enunciado?: EntregaRef; gabarito?: EntregaRef }
export type MontagemPdf = { url: string; nome: string; origem: string }
export type DocOffice = { id: string; titulo: string; versaoAtualId: string }
export type TrechoPrevia = { tipo: string; rotulo: string | null; texto: string }
export type PastaModelo = { id: string; nome: string; pai_id: string | null; cor: string | null }
