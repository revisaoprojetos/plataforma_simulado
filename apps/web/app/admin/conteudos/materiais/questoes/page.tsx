import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { SemAcessoArea } from '@/app/admin/conteudos/_components/sem-acesso-area'
import { lerClassificacaoPadraoLote } from './actions'
import { listarBancosFiltrados, contarQuestoesPorBanco } from './bancos-lista'
import {
  BancosAcervo, type BancoRow, type QuestaoPreviewLinha, type QuestaoDetalhe,
} from './bancos-acervo'

export const dynamic = 'force-dynamic'
const SEM = '00000000-0000-0000-0000-000000000000'
const PP = [5, 10, 25, 50]
const MAX_VINCULOS = 5000
const LETRAS = 'ABCDEFGHIJ'
const DIF_RANK: Record<string, number> = { facil: 0, medio: 1, dificil: 2 }

// BANCO DE QUESTÕES › índice (Estúdio). Dois níveis no MESMO padrão de navegador do Produtos:
//  - sem ?sel: lista de bancos (pastas folder_area='banco') paginada/filtrada no banco (.range + count);
//  - com ?sel: questões DO banco (busca/ordem/página/filtros no servidor) + prévia da questão (?qsel).
// Classificação padrão (disciplina/banca) do banco vem do tema do tenant.
export default async function QuestoesAcervoPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const access = await getCurrentAccess()
  if (!(access.isAdmin || access.permissions.includes('questoes:view'))) return <SemAcessoArea />
  const tid = access.tenantId ?? SEM
  const svc = createAdminClient()
  const sp = await searchParams
  const page = Math.max(1, Number(sp.page ?? 1) || 1)
  const pp = PP.includes(Number(sp.pp)) ? Number(sp.pp) : 10
  const q = (sp.q ?? '').trim()
  const dir = sp.dir === 'asc' ? 'asc' : 'desc'

  const fDisc = (sp.disc ?? '').trim() || null
  const fBanca = (sp.banca ?? '').trim() || null
  const fAnoRaw = Number(sp.ano)
  const fAno = Number.isInteger(fAnoRaw) && fAnoRaw > 1900 ? fAnoRaw : null
  const fDif = ['facil', 'medio', 'dificil'].includes(sp.dif) ? sp.dif : null
  const fSit = ['publicada', 'rascunho', 'arquivada'].includes(sp.sit) ? sp.sit : null

  const classLote = await lerClassificacaoPadraoLote()
  const selBancoId = (sp.sel ?? '').trim() || null

  // ───────────── Nível 2: banco aberto → questões ─────────────
  if (selBancoId) {
    const { data: b } = await svc.from('simulado_pastas').select('id, nome, tipo').eq('tenant_id', tid).eq('folder_area', 'banco').eq('id', selBancoId).maybeSingle()
    if (b) {
      const vinc = await fetchAll<{ questao_id: string }>(() =>
        svc.from('simulado_questao_pasta').select('questao_id').eq('tenant_id', tid).eq('pasta_id', selBancoId).order('questao_id', { ascending: true }))
      const ids = vinc.map((v) => v.questao_id).slice(0, MAX_VINCULOS)
      const todas = ids.length
        ? await fetchAllByIn<any>(ids, (chunk) =>
            svc.from('simulado_questoes')
              .select('id, enunciado, tipo, ano, nivel_dificuldade, status, comentario_professor, created_at, disciplinas:simulado_disciplinas(nome), assuntos:simulado_assuntos(nome), bancas:simulado_bancas(nome), orgaos:simulado_orgaos(nome)')
              .in('id', chunk).eq('tenant_id', tid).eq('deletado', false).order('id', { ascending: true }))
        : []
      // Numeração estável = ordem de criação.
      todas.sort((a: any, b2: any) => String(a.created_at ?? '').localeCompare(String(b2.created_at ?? '')) || String(a.id).localeCompare(String(b2.id)))
      const numeroPor = new Map<string, number>(todas.map((x: any, i: number) => [x.id, i + 1]))

      const opcoes = (get: (x: any) => string | null) => [...new Set(todas.map(get).filter(Boolean) as string[])].sort((a, c) => a.localeCompare(c, 'pt-BR'))
      const disciplinasFiltro = opcoes((x) => x.disciplinas?.nome ?? null)
      const bancasFiltro = opcoes((x) => x.bancas?.nome ?? null)
      const anosFiltro = [...new Set(todas.map((x: any) => x.ano).filter((a: any) => typeof a === 'number') as number[])].sort((a, c) => c - a)

      const ql = q.toLowerCase()
      let lista = todas.filter((x: any) =>
        (!ql || String(x.enunciado ?? '').toLowerCase().includes(ql))
        && (!fDisc || x.disciplinas?.nome === fDisc)
        && (!fBanca || x.bancas?.nome === fBanca)
        && (fAno == null || x.ano === fAno)
        && (!fDif || x.nivel_dificuldade === fDif)
        && (!fSit || x.status === fSit))
      const sort = sp.sort ?? 'numero'
      const sdir = sp.sort ? dir : 'asc'
      const mult = sdir === 'asc' ? 1 : -1
      lista = [...lista].sort((a: any, c: any) => {
        if (sort === 'ano') return ((a.ano ?? 0) - (c.ano ?? 0)) * mult
        if (sort === 'dificuldade') return ((DIF_RANK[a.nivel_dificuldade ?? ''] ?? 99) - (DIF_RANK[c.nivel_dificuldade ?? ''] ?? 99)) * mult
        return ((numeroPor.get(a.id) ?? 0) - (numeroPor.get(c.id) ?? 0)) * mult
      })
      const total = lista.length
      const fatia = lista.slice((page - 1) * pp, page * pp)

      // Alternativas só da fatia + da questão selecionada.
      const qsel = (sp.qsel ?? '').trim() || null
      const idsAlt = [...new Set([...fatia.map((x: any) => x.id), ...(qsel ? [qsel] : [])])]
      const alts = idsAlt.length
        ? await fetchAllByIn<any>(idsAlt, (chunk) =>
            svc.from('simulado_alternativas').select('id, questao_id, ordem, texto, correta').in('questao_id', chunk).order('id', { ascending: true }))
        : []
      const altsPor = new Map<string, any[]>()
      for (const a of alts) { const arr = altsPor.get(a.questao_id) ?? []; arr.push(a); altsPor.set(a.questao_id, arr) }
      for (const arr of altsPor.values()) arr.sort((x, y) => (x.ordem ?? 0) - (y.ordem ?? 0))
      const gabaritoDe = (qid: string) => {
        const i = (altsPor.get(qid) ?? []).findIndex((a) => a.correta)
        return i >= 0 ? (LETRAS[i] ?? null) : null
      }
      const provaDe = (x: any) => [x.bancas?.nome, x.ano].filter(Boolean).join(' · ') || null

      const questoes: QuestaoPreviewLinha[] = fatia.map((x: any) => ({
        id: x.id, numero: numeroPor.get(x.id) ?? 0, enunciado: x.enunciado ?? '',
        tipo: x.tipo === 'discursiva' ? 'discursiva' : 'objetiva',
        altCount: altsPor.get(x.id)?.length ?? 0, gabarito: gabaritoDe(x.id), prova: provaDe(x),
        ano: typeof x.ano === 'number' ? x.ano : null,
        dificuldade: x.nivel_dificuldade ?? null, status: x.status ?? null,
        temExplicacao: !!(x.comentario_professor && String(x.comentario_professor).trim()),
      }))

      let detalhe: QuestaoDetalhe | null = null
      const xs: any = qsel ? todas.find((x: any) => x.id === qsel) : null
      if (xs) {
        detalhe = {
          id: xs.id, numero: numeroPor.get(xs.id) ?? 0, enunciado: xs.enunciado ?? '', tipo: xs.tipo === 'discursiva' ? 'discursiva' : 'objetiva',
          gabarito: gabaritoDe(xs.id),
          alternativas: (altsPor.get(xs.id) ?? []).map((a, i) => ({ letra: LETRAS[i] ?? '?', texto: a.texto ?? '', correta: !!a.correta })),
          explicacao: xs.comentario_professor ?? null,
          classificacao: { disciplina: xs.disciplinas?.nome ?? null, assunto: xs.assuntos?.nome ?? null, prova: provaDe(xs) },
        }
      }

      const cls = classLote[selBancoId]
      const banco: BancoRow = {
        id: (b as any).id, nome: (b as any).nome, tipo: (b as any).tipo === 'discursiva' ? 'discursiva' : 'objetiva',
        questoes: vinc.length, atualizadoEm: null, disciplina: cls?.disciplina?.nome ?? null, banca: cls?.banca?.nome ?? null,
      }
      return (
        <BancosAcervo
          modo="banco" banco={banco} questoes={questoes} totalQuestoes={total} detalhe={detalhe}
          rows={[]} total={0}
          filtros={{ disc: fDisc, banca: fBanca, ano: fAno, dif: fDif, sit: fSit }}
          disciplinasFiltro={disciplinasFiltro} bancasFiltro={bancasFiltro} anosFiltro={anosFiltro}
        />
      )
    }
  }

  // ───────────── Nível 1: lista de bancos ─────────────
  const { pastas, total } = await listarBancosFiltrados(tid, { q, disc: fDisc, banca: fBanca }, classLote, { page, perPage: pp })
  const contagens = await contarQuestoesPorBanco(tid, pastas.map((p) => p.id))
  const rows: BancoRow[] = pastas.map((p) => ({
    id: p.id, nome: p.nome, tipo: p.tipo === 'discursiva' ? 'discursiva' : 'objetiva',
    questoes: contagens.get(p.id) ?? 0, atualizadoEm: p.atualizado_em ?? null,
    disciplina: classLote[p.id]?.disciplina?.nome ?? null, banca: classLote[p.id]?.banca?.nome ?? null,
  }))

  // Opções dos pílulas: só valores que existem de fato (classificação padrão dos bancos).
  const nomes = (k: 'disciplina' | 'banca') => [...new Set(Object.values(classLote).map((v) => v?.[k]?.nome).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'pt-BR'))

  return (
    <BancosAcervo
      modo="bancos" banco={null} questoes={[]} totalQuestoes={0} detalhe={null}
      rows={rows} total={total}
      filtros={{ disc: fDisc, banca: fBanca, ano: null, dif: null, sit: null }}
      disciplinasFiltro={nomes('disciplina')} bancasFiltro={nomes('banca')} anosFiltro={[]}
    />
  )
}
