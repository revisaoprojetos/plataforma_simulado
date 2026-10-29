// Flashcards (novo) — FlashcardsRevisao. Subtela do painel: revisão por flashcards da aula.
// DADO REAL ligado: cartões do material (simulado_flashcards, autoria admin) + progresso SRS do
// aluno (simulado_flashcard_revisoes) + título real do material (carregarLeitura). O que ainda não
// tem loader (disciplina/aula do material) permanece // TODO(dados). Layout fiel ao canvas; cores via tokens.
// Tolerante à migração pendente: em DEV as tabelas podem não existir → trata como "sem cartões".
import { Hero, Col, Eyebrow, Crumbs, Card, Aviso, Btn } from '@/components/nova/ui'
import { R } from '@/lib/nova/rotas'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { carregarLeitura } from '@/lib/conteudo/leitor'
import {
  listarFlashcardsDocumento,
  carregarRevisoesAluno,
  contarDevidos,
  estadoDaCaixa,
} from '@/lib/flashcards/flashcards'
import { redirect } from 'next/navigation'
import { FlashcardsRunner, type Card as RunnerCard } from './_flashcards'

export const dynamic = 'force-dynamic'

// Alternador de modos de revisão (sobre o hero escuro); dourado = ativo. Preserva ?m= nos links.
function HeaderToggle({ active, docId }: { active: 'pdflash' | 'flashcards' | 'grifos'; docId: string }) {
  const items: { k: typeof active; t: string; href: string }[] = [
    { k: 'pdflash', t: 'PDFlash', href: R.painelLeitor(docId) },
    { k: 'flashcards', t: 'Flashcards', href: `${R.painelFlashcards}?m=${docId}` },
    { k: 'grifos', t: 'Meus grifos', href: `${R.painelGrifos}?m=${docId}` },
  ]
  return (
    <div style={{ display: 'inline-flex', gap: 6, padding: 6, borderRadius: 14, background: 'rgba(255,255,255,.08)', width: 'fit-content' }}>
      {items.map((it) => {
        const on = it.k === active
        return <a key={it.k} href={it.href} style={{ height: 38, padding: '0 18px', borderRadius: 10, display: 'inline-flex', alignItems: 'center', fontSize: 13.5, fontWeight: 800, background: on ? 'var(--gold)' : 'transparent', color: on ? 'var(--goldInk)' : '#FFFFFF' }}>{it.t}</a>
      })}
    </div>
  )
}

function Vazio() {
  return (
    <>
      <Crumbs items={[['Meu painel', R.painel], ['Flashcards', R.painelFlashcards]]} />
      <Card>
        <Aviso icon="cards" action={<Btn kind="secondary" icon="back" href={R.painel}>Voltar ao painel</Btn>}>
          Ainda não há flashcards disponíveis para você. Assim que uma aula tiver cartões, eles aparecem aqui para revisão.
        </Aviso>
      </Card>
    </>
  )
}

export default async function FlashcardsPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')

  const svc = createAdminClient()

  // documentId: ?m=<id> OU o material mais recente (do tenant) que tenha flashcards ativos.
  // Tolerante à migração pendente (tabela pode não existir em DEV) → trata como "sem cartões".
  let docId = (m || '').trim()
  if (!docId) {
    try {
      const { data: recente } = await svc
        .from('simulado_flashcards')
        .select('documento_id')
        .eq('tenant_id', sessao.tenantId)
        .eq('ativo', true)
        .order('criado_em', { ascending: false })
        .limit(1)
        .maybeSingle()
      docId = (recente?.documento_id as string | undefined) ?? ''
    } catch {
      docId = ''
    }
  }
  if (!docId) return <Vazio />

  // Cartões reais do material (ativos, na ordem do admin) + revisões SRS do aluno.
  // try/catch: em DEV sem migração a query lança — degrada para "sem cartões" sem quebrar a página.
  let cards: RunnerCard[] = []
  let devidos = 0
  try {
    const flashcards = await listarFlashcardsDocumento(svc, sessao.tenantId, docId)
    if (flashcards.length > 0) {
      const ids = flashcards.map((c) => c.id)
      const revs = await carregarRevisoesAluno(svc, sessao.tenantId, sessao.estudanteId, ids)
      devidos = contarDevidos(flashcards, revs)
      cards = flashcards.map((c) => {
        const r = revs.get(c.id)
        return {
          id: c.id,
          frente: c.frente,
          verso: c.verso,
          estado: estadoDaCaixa(r?.caixa ?? 0, !!r),
        }
      })
    }
  } catch {
    cards = []
  }

  if (cards.length === 0) return <Vazio />

  // Título real do material (gate de acesso embutido em carregarLeitura). Fallback se indisponível.
  let titulo = 'Flashcards da aula'
  try {
    const leitura = await carregarLeitura(docId, sessao.estudanteId)
    if (leitura?.titulo) titulo = leitura.titulo
  } catch {
    // mantém fallback
  }

  const flashHref = `${R.painelFlashcards}?m=${docId}`
  const nCards = cards.length

  return (
    <>
      <Crumbs items={[['Meu painel', R.painel], [`Leitor · ${titulo}`, R.painelLeitor(docId)], ['Flashcards', flashHref]]} />

      <Hero>
        <Col gap={12}>
          <Eyebrow color="var(--gold)">Revisão por flashcards · Cronograma adaptativo</Eyebrow>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', color: '#FFFFFF' }}>{titulo}</h1>
          {/* TODO(dados): disciplina/aula do material (sem loader hoje) — mantido só o que é real. */}
          <span style={{ fontSize: 14, color: '#E6DEFF' }}>
            {nCards.toLocaleString('pt-BR')} {nCards === 1 ? 'cartão da aula' : 'cartões da aula'}
            {devidos > 0 ? ` · ${devidos.toLocaleString('pt-BR')} para revisar hoje` : ''}
          </span>
          <HeaderToggle active="flashcards" docId={docId} />
        </Col>
      </Hero>

      <FlashcardsRunner cards={cards} />
    </>
  )
}
