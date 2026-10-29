import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { R } from '@/lib/nova/rotas'
import { carregarTrilhaLeituraAluno } from '@/lib/leitura/trilha'
import { desafiosDoAluno } from '@/lib/jurisprudencia/conteudo'
import { alunoTemAcessoMaratona } from '@/lib/maratona/participacao'
import { carregarDesafioMaratona, carregarProgressoMaratona } from '@/lib/maratona/carregar'

// CURSOS REAIS do aluno (decisão de produto): um "curso" NÃO é pasta da Biblioteca (isso é MATERIAL).
// Os cursos publicados são os PRODUTOS/desafios a que o aluno tem acesso — hoje: Lei Seca (leitura),
// Jurisprudência (jurisprudencia) e a Maratona ENAP+AGU (maratona). 1 card por produto, progresso geral,
// link direto pra área. Cada bloco é tolerante (sem acesso/erro → null; não aparece).

export type CursoReal = {
  id: 'leiseca' | 'juris' | 'maratona'
  titulo: string
  sub: string
  feitos: number
  total: number
  pct: number
  /** Curso encerrado (janela de publicação terminou / data fim passou). */
  encerrado: boolean
  cor: string | null
  capa: string | null
  href: string
  acao: string
}

const AREAS_MARATONA = 3

export async function carregarCursosReais(svc: SupabaseClient, tenantId: string, estId: string): Promise<CursoReal[]> {
  if (!tenantId || !estId) return []
  const [leiseca, juris, maratona] = await Promise.all([
    cursoLeiSeca(estId, tenantId),
    cursoJuris(svc, estId, tenantId),
    cursoMaratona(svc, tenantId, estId),
  ])
  return [leiseca, juris, maratona].filter((c): c is CursoReal => c !== null)
}

async function cursoLeiSeca(estId: string, tenantId: string): Promise<CursoReal | null> {
  try {
    const trilhas = await carregarTrilhaLeituraAluno(estId, tenantId)
    if (!trilhas?.length) return null
    const total = trilhas.reduce((s, t) => s + (t.total || 0), 0)
    const feitos = trilhas.reduce((s, t) => s + (t.done || 0), 0)
    const pct = total ? Math.round((feitos / total) * 100) : 0
    // Abre DIRETO a lei a continuar: a 1ª ainda não concluída (done<total) ou, se todas prontas, a 1ª.
    const continuar = trilhas.find((t: any) => (t.done || 0) < (t.total || 0)) ?? trilhas[0]
    return {
      id: 'leiseca', titulo: 'Desafio de Lei Seca',
      sub: `${trilhas.length} ${trilhas.length === 1 ? 'lei' : 'leis'}${total ? ` · ${feitos}/${total} aulas` : ''}`,
      feitos, total, pct, encerrado: false, cor: (trilhas[0] as any).cor ?? null, capa: (trilhas[0] as any).capaCard ?? (trilhas[0] as any).capa ?? null,
      href: `/aluno/leitura?modulo=${(continuar as any).id}&origem=${encodeURIComponent('/aluno/nova/cursos')}`, acao: pct > 0 ? 'Continuar' : 'Começar',
    }
  } catch { return null }
}

async function cursoJuris(svc: SupabaseClient, estId: string, tenantId: string): Promise<CursoReal | null> {
  try {
    const desafios = await desafiosDoAluno(estId, tenantId)
    if (!desafios?.length) return null
    const ids = desafios.map((d) => d.id)
    let feitos = 0, total = 0
    let continuarId = ids[0] // desafio a abrir direto (1º em andamento, senão o 1º)
    try {
      const [pastasRes, progRes] = await Promise.all([
        svc.from('simulado_pastas').select('id, desafio_jogo').in('id', ids),
        svc.from('simulado_jurisprudencia_progresso').select('desafio_id, dom').eq('estudante_id', estId).in('desafio_id', ids),
      ])
      const jogoMap = new Map((pastasRes.data ?? []).map((p: any) => [p.id, p.desafio_jogo ?? {}]))
      const domMap = new Map((progRes.data ?? []).map((p: any) => [p.desafio_id, p.dom ?? {}]))
      let achouContinuar = false
      for (const id of ids) {
        const dj: any = jogoMap.get(id) ?? {}
        const dias = dj?.dias && typeof dj.dias === 'object' ? dj.dias : {}
        const dom: any = domMap.get(id) ?? {}
        const keys = Object.keys(dias)
        const feitosDesafio = keys.filter((k) => { const teses = dias[k]?.teses; const n = Array.isArray(teses) ? teses.length : 0; const arr = dom[k]; return n > 0 && Array.isArray(arr) && arr.length >= n }).length
        total += keys.length
        feitos += feitosDesafio
        // 1º desafio não concluído = alvo do "Continuar".
        if (!achouContinuar && feitosDesafio < keys.length) { continuarId = id; achouContinuar = true }
      }
    } catch { /* progresso best-effort */ }
    const pct = total ? Math.round((feitos / total) * 100) : 0
    return {
      id: 'juris', titulo: 'Desafio de Jurisprudência',
      sub: `${desafios.length} ${desafios.length === 1 ? 'desafio' : 'desafios'}${total ? ` · ${feitos}/${total} dias` : ''}`,
      feitos, total, pct, encerrado: false, cor: null, capa: desafios[0].imagemTicket ?? null,
      href: `/aluno/jurisprudencia?desafio=${continuarId}&origem=${encodeURIComponent('/aluno/nova/cursos')}`, acao: pct > 0 ? 'Continuar' : 'Começar',
    }
  } catch { return null }
}

async function cursoMaratona(svc: SupabaseClient, tenantId: string, estId: string): Promise<CursoReal | null> {
  try {
    const tem = await alunoTemAcessoMaratona(svc, tenantId, estId)
    if (!tem) return null
    const d = await carregarDesafioMaratona(svc, tenantId)
    if (!d.lancada || !d.pastaId) return null
    const cur = await carregarProgressoMaratona(svc, tenantId, estId, d.pastaId).catch(() => 0)
    const cfg = d.config as any
    const pct = Math.round((cur / AREAS_MARATONA) * 100)
    // Encerrada = a data fim do evento (config.fim) já passou.
    const fimMs = cfg?.fim ? new Date(cfg.fim).getTime() : NaN
    const encerrado = Number.isFinite(fimMs) && fimMs < Date.now()
    return {
      id: 'maratona', titulo: cfg?.titulo || 'Maratona de Simulados',
      sub: `${cfg?.destaque ?? 'Maratona'} · ${cur}/${AREAS_MARATONA} etapas`,
      feitos: cur, total: AREAS_MARATONA, pct, encerrado, cor: null, capa: cfg?.capaUrl ?? null,
      href: `/aluno/maratona?origem=${encodeURIComponent('/aluno/nova/cursos')}`, acao: encerrado ? 'Ver resultado' : cur > 0 ? 'Continuar' : 'Começar',
    }
  } catch { return null }
}
