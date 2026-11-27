import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { fetchAllByIn } from '@/lib/supabase/fetch-all'
import { SemAcessoArea } from '@/app/admin/conteudos/_components/sem-acesso-area'
import { lerClassificacaoPadraoLote } from './actions'
import {
  contarQuestoesDoBanco, facetasBancoEstudio, listarQuestoesBanco, opcoesBancoEstudio, type LinhaBancoEstudio,
} from '@/lib/conteudo/questoes-estudio'
import { FILTROS_VAZIOS, contarAplicados, filtrosDeParams, ordemBanco } from '@/lib/conteudo/questoes-estudio-filtros'
import { listarBancosFiltrados, contarQuestoesPorBanco } from './bancos-lista'
import {
  BancosAcervo, type BancoRow, type QuestaoPreviewLinha, type QuestaoDetalhe,
} from './bancos-acervo'

export const dynamic = 'force-dynamic'
const SEM = '00000000-0000-0000-0000-000000000000'
const PP = [5, 10, 25, 50]
const LETRAS = 'ABCDEFGHIJ'
const selBancoIdDe = (sp: Record<string, string>) => (sp.sel ?? '').trim() || null

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

  // Nível 1 (lista de bancos): filtros por NOME da classificação padrão do banco. Nível 2 usa os filtros multi-seleção do card (ids).
  const fDisc = selBancoIdDe(sp) ? null : (sp.disc ?? '').trim() || null
  const fBanca = selBancoIdDe(sp) ? null : (sp.banca ?? '').trim() || null

  const classLote = await lerClassificacaoPadraoLote()
  const selBancoId = (sp.sel ?? '').trim() || null

  // ───────────── Nível 2: banco aberto → questões ─────────────
  if (selBancoId) {
    const { data: b } = await svc.from('simulado_pastas').select('id, nome, tipo').eq('tenant_id', tid).eq('folder_area', 'banco').eq('id', selBancoId).maybeSingle()
    if (b) {
      // Filtros do card (multi-seleção), busca, ordem e página: TUDO no banco (SQL), com facetas (contagem por opção) do núcleo compartilhado.
      const fe = filtrosDeParams((k) => sp[k])
      const sort = ordemBanco(sp.sort)
      const sdir = sp.sort ? dir : 'asc'
      const [lista, base] = await Promise.all([
        listarQuestoesBanco(svc, tid, selBancoId, fe, { sort, dir: sdir, page, pp }),
        facetasBancoEstudio(tid, selBancoId, FILTROS_VAZIOS),
      ])
      const opcoesEstudio = base ? await opcoesBancoEstudio(tid, base.contagens) : null
      // Total do banco (sem filtros).
      const totalBanco = base?.total ?? (lista.degradado ? lista.total : (await contarQuestoesDoBanco(tid, selBancoId)) ?? lista.total)
      const fatia = lista.rows
      const total = lista.total

      // Alternativas só da fatia + da questão selecionada.
      const qsel = (sp.qsel ?? '').trim() || null
      let xs: LinhaBancoEstudio | null = fatia.find((x) => x.id === qsel) ?? null
      if (qsel && !xs) xs = (await listarQuestoesBanco(svc, tid, selBancoId, FILTROS_VAZIOS, { somenteId: qsel, page: 1, pp: 1 })).rows[0] ?? null
      const idsAlt = [...new Set([...fatia.map((x) => x.id), ...(xs ? [xs.id] : [])])]
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
      const provaDe = (x: LinhaBancoEstudio) => [x.banca, x.ano].filter(Boolean).join(' · ') || null

      const questoes: QuestaoPreviewLinha[] = fatia.map((x) => ({
        id: x.id, numero: x.numero, enunciado: x.enunciado,
        tipo: x.tipo === 'discursiva' ? 'discursiva' : 'objetiva',
        altCount: altsPor.get(x.id)?.length ?? 0, gabarito: gabaritoDe(x.id), prova: provaDe(x),
        ano: x.ano, dificuldade: x.nivel_dificuldade, status: x.status,
        temExplicacao: !!(x.comentario_professor && x.comentario_professor.trim()),
      }))

      let detalhe: QuestaoDetalhe | null = null
      if (xs) {
        detalhe = {
          id: xs.id, numero: xs.numero, enunciado: xs.enunciado, tipo: xs.tipo === 'discursiva' ? 'discursiva' : 'objetiva',
          gabarito: gabaritoDe(xs.id),
          alternativas: (altsPor.get(xs.id) ?? []).map((a, i) => ({ letra: LETRAS[i] ?? '?', texto: a.texto ?? '', correta: !!a.correta })),
          explicacao: xs.comentario_professor ?? null,
          classificacao: { disciplina: xs.disciplina, assunto: xs.assunto, prova: provaDe(xs) },
        }
      }

      const cls = classLote[selBancoId]
      const banco: BancoRow = {
        id: (b as any).id, nome: (b as any).nome, tipo: (b as any).tipo === 'discursiva' ? 'discursiva' : 'objetiva',
        questoes: totalBanco, atualizadoEm: null, disciplina: cls?.disciplina?.nome ?? null, banca: cls?.banca?.nome ?? null,
      }
      return (
        <BancosAcervo
          modo="banco" banco={banco} questoes={questoes} totalQuestoes={total} detalhe={detalhe}
          rows={[]} total={0}
          filtros={{ disc: null, banca: null }}
          disciplinasFiltro={[]} bancasFiltro={[]}
          filtrosEstudio={fe} opcoesEstudio={opcoesEstudio} facInicial={contarAplicados(fe) === 0 && !fe.q ? base : null}
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
      filtros={{ disc: fDisc, banca: fBanca }}
      disciplinasFiltro={nomes('disciplina')} bancasFiltro={nomes('banca')}
      filtrosEstudio={FILTROS_VAZIOS} opcoesEstudio={null} facInicial={null}
    />
  )
}
