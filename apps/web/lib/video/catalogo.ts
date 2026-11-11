import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import * as vc from './client'
import type {
  ArvoreCurso, AulaCatalogo, AulaProntaSeletor, CursoCatalogo, EstadoAula, ModuloCatalogo, PaginaCursos,
} from './catalogo-tipos'

/** Slug do tenant = identificador da empresa no serviço de vídeo. */
export async function slugDoTenant(tenantId: string): Promise<string | null> {
  const { data } = await createAdminClient().from('simulado_tenants').select('slug').eq('id', tenantId).maybeSingle()
  const s = (data as { slug?: string } | null)?.slug
  return s ? String(s) : null
}

const ESTADOS: Record<string, EstadoAula> = {
  uploading: 'enviando', uploaded: 'na_fila', queued: 'na_fila', processing: 'processando', ready: 'pronta', failed: 'erro',
}

// Cache curto só de vídeos PRONTOS (evita N chamadas a cada polling da árvore). Invalidado em reprocessar/remover.
const prontos = new Map<string, { v: vc.VideoServico; exp: number }>()
const TTL_PRONTO = 30_000
export function esquecerVideo(slug: string, videoId: string) { prontos.delete(`${slug}:${videoId}`) }

async function statusDe(slug: string, videoId: string): Promise<vc.VideoServico | null> {
  const c = prontos.get(`${slug}:${videoId}`)
  if (c && c.exp > Date.now()) return c.v
  try {
    const v = await vc.obterVideo(slug, videoId)
    if (v.status === 'ready') {
      if (prontos.size > 2000) prontos.clear()
      prontos.set(`${slug}:${videoId}`, { v, exp: Date.now() + TTL_PRONTO })
    }
    return v
  } catch (e) {
    if (e instanceof vc.VideoApiError && e.status === 404) return null
    throw e
  }
}

async function emLotes<T, R>(itens: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < itens.length; i += n) out.push(...(await Promise.all(itens.slice(i, i + n).map(fn))))
  return out
}

const paraCurso = (c: vc.CursoServico): CursoCatalogo => ({ id: c.id, titulo: c.title, status: c.status, criadoEm: c.createdAt ?? null })

export async function listarCursosCatalogo(slug: string, page: number, pageSize: number): Promise<PaginaCursos> {
  const r = await vc.listarCursos(slug, page, pageSize)
  return { rows: r.data.map(paraCurso), total: r.total }
}

function aulaBase(a: vc.AulaServico, v: vc.VideoServico | null): AulaCatalogo {
  const estado: EstadoAula = !a.videoId || !v ? 'sem_video' : (ESTADOS[v.status] ?? 'na_fila')
  return {
    id: a.id, titulo: a.title, posicao: a.position, estado, videoId: v ? a.videoId : null,
    duracaoS: v?.durationS ?? null, tamanhoBytes: v?.sizeBytes ?? null, erro: v?.error ?? null,
  }
}

/** Árvore completa de UM curso (módulos > aulas) com o estado do vídeo de cada aula (chamadas em lotes de 8). */
export async function arvoreCurso(slug: string, courseId: string): Promise<ArvoreCurso> {
  const [curso, mods] = await Promise.all([vc.obterCurso(slug, courseId), vc.listarModulos(slug, courseId)])
  const comVideo = mods.flatMap((m) => m.lessons).filter((a) => a.videoId)
  const vids = new Map<string, vc.VideoServico | null>()
  await emLotes(comVideo, 8, async (a) => { vids.set(a.id, await statusDe(slug, a.videoId!)) })
  const modulos: ModuloCatalogo[] = mods.map((m) => ({
    id: m.id, titulo: m.title, posicao: m.position,
    aulas: m.lessons.map((a) => aulaBase(a, vids.get(a.id) ?? null)),
  }))
  return { curso: paraCurso(curso), modulos }
}

/** Aula + vídeo (estado fresco, sem cache de pronto). */
export async function estadoAula(slug: string, lessonId: string): Promise<AulaCatalogo> {
  const a = await vc.obterAula(slug, lessonId)
  if (a.videoId) esquecerVideo(slug, a.videoId)
  return aulaBase(a, a.videoId ? await statusDe(slug, a.videoId) : null)
}

/** Aulas com vídeo PRONTO de um curso (para o seletor). */
export async function aulasProntasDoCurso(slug: string, courseId: string): Promise<AulaProntaSeletor[]> {
  const { modulos } = await arvoreCurso(slug, courseId)
  return modulos.flatMap((m) => m.aulas.filter((a) => a.estado === 'pronta').map((a) => ({ id: a.id, titulo: a.titulo, moduloTitulo: m.titulo, duracaoS: a.duracaoS })))
}
