// JurisClub (nova) — clube de atualizações do aluno, ligado a DADO REAL reusando o backend
// de jurisprudência/leitura. Mapeamento:
//   - "edição mais recente"  = o desafio (pasta folder_area='jurisprudencia') mais recente do aluno
//   - "julgados do mês"       = as TESES dos dias do desafio (desafio_jogo.dias[].teses, via quiz do conteúdo)
//   - "23 de 78 lidos" / %    = teses dominadas (simulado_jurisprudencia_progresso.dom) ÷ total de teses
//   - "edições" (sidebar)     = demais desafios do aluno, com progresso por dias dominados
//   - "por disciplina"        = temas reais das teses (filtro próprio do clube — exceção à regra de busca)
// Loaders reusados: desafiosDoAluno, lerDesafioJogo, preencherTesesPorQuiz (@/lib/jurisprudencia/conteudo).
// SEM tabela/migração nova. O que não tem fonte (etapas Top3/Flashcards/Aprofundar) fica EXEMPLO + TODO(dados).
import { redirect } from 'next/navigation'
import { Crumbs, Card, Muted } from '@/components/nova/ui'
import { R } from '@/lib/nova/rotas'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { desafiosDoAluno, lerDesafioJogo, preencherTesesPorQuiz } from '@/lib/jurisprudencia/conteudo'
import { JurisClub, type EdicaoItem, type JulgadoView } from './_jurisclub'

export const dynamic = 'force-dynamic'

/** Detecta a corte (STF/STJ) a partir dos metadados da tese — best-effort (fica null se não achar). */
function detectarCorte(...campos: (string | null | undefined)[]): 'STF' | 'STJ' | null {
  const txt = campos.filter(Boolean).join(' ').toUpperCase()
  if (txt.includes('STF') || txt.includes('SUPREMO')) return 'STF'
  if (txt.includes('STJ') || txt.includes('SUPERIOR TRIBUNAL')) return 'STJ'
  return null
}

const primeiroNome = (nome: string) => (nome || '').trim().split(/\s+/)[0] || 'Aluno'

export default async function JurisClubPage() {
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  const { estudanteId, tenantId, nome } = sessao
  const svc = createAdminClient()

  // Edições (desafios) a que o aluno tem acesso — REAL. desafiosDoAluno já ordena por id asc.
  const desafios = await desafiosDoAluno(estudanteId, tenantId).catch(() => [])

  if (!desafios.length) {
    return (
      <>
        <Crumbs items={[['Cursos', R.cursos], ['Central de Estudos', R.central], ['JurisClub', '#']]} />
        <Card style={{ alignItems: 'center', textAlign: 'center', padding: '48px 24px' }}>
          <Muted size={13}>Nenhuma edição do JurisClub disponível para você no momento.</Muted>
        </Card>
      </>
    )
  }

  // Edição mais recente = último da lista (ordenada por id asc).
  const edicaoDesafio = desafios[desafios.length - 1]

  // Progresso (dom) de TODAS as edições em um lote + desafio_jogo de todas (p/ totais da sidebar).
  const ids = desafios.map((d) => d.id)
  const [pastasRes, progRes] = await Promise.all([
    svc.from('simulado_pastas').select('id, desafio_jogo').in('id', ids),
    svc.from('simulado_jurisprudencia_progresso').select('desafio_id, dom').eq('estudante_id', estudanteId).in('desafio_id', ids),
  ])
  const jogoPorId = new Map((pastasRes.data ?? []).map((p: any) => [p.id, p.desafio_jogo ?? {}]))
  const domPorId = new Map((progRes.data ?? []).map((p: any) => [p.desafio_id, p.dom ?? {}]))

  // ——— Edição em destaque: julgados REAIS (teses dos dias) + progresso por teses ———
  const jogo = await lerDesafioJogo(svc, edicaoDesafio.id).catch(() => null)
  const diasBrutos = jogo?.dias && typeof jogo.dias === 'object' ? { ...(jogo.dias as Record<string, any>) } : {}
  const diasComTeses = await preencherTesesPorQuiz(svc, diasBrutos).catch(() => diasBrutos)
  const domEdicao = (domPorId.get(edicaoDesafio.id) ?? {}) as Record<string, any>

  const diasOrdenados = Object.entries(diasComTeses).sort(
    (a, b) => ((a[1] as any)?.ordem ?? Number(a[0])) - ((b[1] as any)?.ordem ?? Number(b[0])),
  )

  let totalJulgados = 0
  let lidos = 0
  const julgados: JulgadoView[] = []
  for (const [chave, dRaw] of diasOrdenados) {
    const d = dRaw as any
    const teses = Array.isArray(d?.teses) ? d.teses : []
    totalJulgados += teses.length
    const domArr = (Array.isArray(domEdicao[chave]) ? domEdicao[chave] : []).map((x: any) => Number(x))
    const href = d?.documento_id
      ? `/aluno/jurisprudencia/leitura-rapida/${d.documento_id}?desafio=${edicaoDesafio.id}`
      : `/aluno/jurisprudencia?desafio=${edicaoDesafio.id}`
    teses.forEach((t: any, i: number) => {
      const lido = domArr.includes(i)
      if (lido) lidos++
      const tema = String(t?.tema || t?.disciplina || t?.materia || '').trim()
      const ref = String(t?.ref || '').trim()
      julgados.push({
        id: `${chave}:${i}`,
        tema: tema || 'Geral',
        texto: String(t?.tese || t?.q || t?.texto || t?.enunciado || '').trim(),
        ref,
        corte: detectarCorte(ref, tema, t?.tese, t?.q),
        lido,
        href,
      })
    })
  }
  const pct = totalJulgados > 0 ? Math.round((lidos / totalJulgados) * 100) : 0

  // Disciplinas REAIS (temas distintos das teses) — alimentam o filtro próprio do clube.
  const disciplinas = [...new Set(julgados.map((j) => j.tema).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'))

  // ——— Sidebar "Edições": todos os desafios, progresso por DIAS dominados (barato, mesmo cálculo da /nova desafios) ———
  const edicoes: EdicaoItem[] = desafios
    .slice()
    .reverse()
    .map((d) => {
      const dj: any = jogoPorId.get(d.id) ?? {}
      const dias = dj?.dias && typeof dj.dias === 'object' ? dj.dias : {}
      const totalDias = Object.keys(dias).length
      const dom: any = domPorId.get(d.id) ?? {}
      const feitos = Object.keys(dias).filter((k) => {
        const teses = dias[k]?.teses
        const n = Array.isArray(teses) ? teses.length : 0
        const arr = dom[k]
        return n > 0 && Array.isArray(arr) && arr.length >= n
      }).length
      const pctD = totalDias > 0 ? Math.round((feitos / totalDias) * 100) : 0
      const badge = pctD >= 100 && totalDias > 0 ? 'Concluído' : pctD > 0 ? `${pctD}%` : 'Novo'
      const badgeKind: EdicaoItem['badgeKind'] = pctD >= 100 && totalDias > 0 ? 'green' : pctD > 0 ? 'brand' : 'gray'
      return {
        id: d.id,
        nome: d.nome,
        sub: totalDias > 0 ? `${totalDias} dias` : 'Edição',
        badge,
        badgeKind,
        href: `/aluno/jurisprudencia?desafio=${d.id}`,
      }
    })

  return (
    <>
      <Crumbs items={[['Cursos', R.cursos], ['Central de Estudos', R.central], ['JurisClub', '#']]} />
      <JurisClub
        alunoNome={primeiroNome(nome)}
        edicao={{
          id: edicaoDesafio.id,
          nome: edicaoDesafio.nome,
          total: totalJulgados,
          lidos,
          pct,
          href: `/aluno/jurisprudencia?desafio=${edicaoDesafio.id}`,
        }}
        julgados={julgados}
        disciplinas={disciplinas}
        edicoes={edicoes}
      />
    </>
  )
}
