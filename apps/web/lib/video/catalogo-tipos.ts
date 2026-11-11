// Tipos/contratos do catálogo de vídeo (Curso > Módulo > Aula) lido DIRETO do serviço. Sem server-only:
// usável no client. Os ids são os do serviço de vídeo (sem espelho no Supabase).
import { z } from 'zod'

export const TIPOS_VIDEO_UPLOAD = [
  'video/mp4', 'video/quicktime', 'video/x-matroska', 'video/webm', 'video/x-msvideo', 'video/mpeg', 'video/x-m4v',
] as const

/** Estado de uma aula na visão do admin (derivado do vídeo no serviço). */
export type EstadoAula = 'sem_video' | 'enviando' | 'na_fila' | 'processando' | 'pronta' | 'erro'

export interface AulaCatalogo {
  id: string
  titulo: string
  posicao: number
  estado: EstadoAula
  videoId: string | null
  duracaoS: number | null
  tamanhoBytes: number | null
  erro: string | null
}
export interface ModuloCatalogo { id: string; titulo: string; posicao: number; aulas: AulaCatalogo[] }
export interface CursoCatalogo { id: string; titulo: string; status: string; criadoEm: string | null }
export interface ArvoreCurso { curso: CursoCatalogo; modulos: ModuloCatalogo[] }
export interface PaginaCursos { rows: CursoCatalogo[]; total: number }

/** Aula "pronta" para o seletor (somente com vídeo pronto). */
export interface AulaProntaSeletor { id: string; titulo: string; moduloTitulo: string; duracaoS: number | null }

export const listarCursosSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
})

const titulo = z.string().trim().min(1).max(200)
const uuid = z.string().uuid()

export const criarItemSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('curso'), titulo }),
  z.object({ tipo: z.literal('modulo'), titulo, cursoId: uuid }),
  z.object({ tipo: z.literal('aula'), titulo, moduloId: uuid }),
])
export const renomearSchema = z.object({ tipo: z.enum(['curso', 'modulo', 'aula']), titulo })
export const tipoItemSchema = z.enum(['curso', 'modulo', 'aula'])
export const iniciarUploadSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  size: z.number().int().positive(),
  contentType: z.enum(TIPOS_VIDEO_UPLOAD),
})
export const partesSchema = z.object({ partNumbers: z.array(z.number().int().min(1).max(10000)).min(1).max(100) })
export const concluirSchema = z.object({
  parts: z.array(z.object({ partNumber: z.number().int().min(1), etag: z.string().min(1).max(200) })).min(1).max(10000),
})
export const analyticsQuerySchema = z.object({
  from: z.string().max(40).optional(),
  to: z.string().max(40).optional(),
})
