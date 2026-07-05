import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, type Access } from '@/lib/auth/permissions'
import { verificarRenderToken } from '@/lib/pdf/render-token'
import { CadernoPrintControls } from '@/components/admin/caderno-print-controls'
import { BlockRender, dataComQuestao } from '@/lib/caderno-designer/blocks'
import { resolveTheme } from '@/lib/caderno-designer/theme'
import { carregarRegistros } from '@/lib/caderno-designer/merge'
import { hospedarImagensDoc } from '@/lib/caderno-designer/hospedar-imagens'
import { faixaNaPagina, RUNNING_PADRAO, type CadernoData, type CadernoDoc } from '@/lib/caderno-designer/types'

const LETRA = ['A', 'B', 'C', 'D', 'E', 'F']

export default async function CadernoImprimirPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ gabarito?: string; mod?: string; aluno?: string; todos?: string; sessao?: string; pdftoken?: string }>
}) {
  const { id } = await params
  const { gabarito: g, mod, aluno, todos, sessao, pdftoken } = await searchParams
  const gabarito = g === '1'

  // Acesso: cookie do admin OU token de render assinado (Gotenberg, sem cookie),
  // escopado a este caderno + tenant.
  let access: Access
  const tokenPayload = verificarRenderToken(pdftoken)
  if (tokenPayload && tokenPayload.r === 'caderno' && tokenPayload.id === id) {
    access = { userId: null, tenantId: tokenPayload.t, role: 'render', isAdmin: true, permissions: ['*'] }
  } else {
    access = await getCurrentAccess()
    if (!access.isAdmin && !access.permissions.includes('questoes:view')) notFound()
  }

  const svc = createAdminClient()
  const { data: caderno } = await svc
    .from('simulado_cadernos_designer')
    .select('id, nome, config')
    .eq('id', id)
    .eq('tenant_id', access.tenantId ?? '')
    .maybeSingle()
  if (!caderno) notFound()

  const config = (caderno.config ?? {}) as any
  const docsV2: Record<string, CadernoDoc> | undefined = config.docsV2
  const modalidadesV2: { id: string; nome: string }[] = config.modalidadesV2 ?? []
  const theme = resolveTheme(config.cores)
  const bancoId: string | null = config.bancoId ?? null

  // ---- Questões: do banco vinculado ou publicadas do tenant ----
  let questoes: any[] | null = null
  if (bancoId) {
    const { data: vinc } = await svc.from('simulado_questao_pasta').select('questao_id').eq('pasta_id', bancoId)
    const ids = (vinc ?? []).map((v: any) => v.questao_id)
    questoes = ids.length ? (await svc.from('simulado_questoes').select('id, enunciado, tipo').in('id', ids).limit(200)).data : []
  } else {
    questoes = (await svc
      .from('simulado_questoes')
      .select('id, enunciado, tipo')
      .eq('tenant_id', access.tenantId ?? '')
      .eq('status', 'publicada')
      .order('created_at', { ascending: false })
      .limit(120)).data
  }
  const qIds = (questoes ?? []).map((q: any) => q.id)
  const { data: alts } = qIds.length
    ? await svc.from('simulado_alternativas').select('questao_id, texto, ordem, correta').in('questao_id', qIds)
    : { data: [] as any[] }
  const altMap = new Map<string, any[]>()
  for (const a of alts ?? []) { const arr = altMap.get(a.questao_id) ?? []; arr.push(a); altMap.set(a.questao_id, arr) }

  const data: CadernoData = {
    numQuestoes: (questoes ?? []).length || 20,
    numAlternativas: 5,
    questoes: (questoes ?? []).map((q: any, i: number) => ({
      id: q.id, numero: i + 1, enunciado: q.enunciado ?? '', tipo: q.tipo,
      alternativas: (altMap.get(q.id) ?? []).sort((x, y) => x.ordem - y.ordem).map((a, j) => ({ letra: LETRA[j] ?? '?', texto: a.texto ?? '', correta: !!a.correta })),
    })),
    vars: { nome: '', simulado: caderno.nome, acertos: '', total_questoes: String((questoes ?? []).length || 20), nota: '', percentual: '' },
  }
  // Gating: o gabarito (correção) só aparece se algum simulado vinculado ao banco liberou.
  if (bancoId) {
    const { data: vincQ } = await svc.from('simulado_questao_pasta').select('questao_id').eq('pasta_id', bancoId)
    const qs = (vincQ ?? []).map((v: any) => v.questao_id)
    if (qs.length) {
      const { data: pqv } = await svc.from('simulado_prova_questoes').select('simulado_id').in('questao_id', qs)
      const simIds = [...new Set((pqv ?? []).map((r: any) => r.simulado_id))]
      if (simIds.length) {
        const { data: sims } = await svc.from('simulado_simulados').select('status, data_fim, regras').in('id', simIds)
        const agora = Date.now()
        data.gabaritoLiberado = (sims ?? []).some((s: any) => {
          const reg = (s.regras ?? {}) as any
          if (reg.gabarito_liberado) return true
          const modo = reg.liberar_gabarito ?? 'apos_janela'
          if (modo === 'imediato') return true
          if (modo === 'apos_janela') return s.status === 'encerrado' || (!!s.data_fim && new Date(s.data_fim).getTime() < agora)
          return false
        })
      }
    }
  }

  // Base: 1ª questão preenche as variáveis de questão fora do repetidor.
  if (data.questoes[0]) {
    const base = dataComQuestao(data, data.questoes[0])
    data.vars = base.vars
    data.questaoAtual = base.questaoAtual
  }

  // ---- Mala direta: cópias a renderizar (todos / um aluno / exemplo) ----
  let copias: { rotulo: string; data: CadernoData }[] = [{ rotulo: '', data }]
  if (bancoId && (todos === '1' || aluno)) {
    const { data: banco } = await svc.from('simulado_pastas').select('nome').eq('id', bancoId).maybeSingle()
    const registros = await carregarRegistros(svc, access.tenantId ?? '', bancoId, (banco as any)?.nome ?? caderno.nome, sessao)
    const escolhidos = todos === '1' ? registros : registros.filter((r) => r.id === aluno)
    if (escolhidos.length) copias = escolhidos.map((r) => ({ rotulo: r.nome, data: { ...data, vars: { ...data.vars, ...r.vars }, respostas: r.respostas } }))
  }

  const estilo = `
    .impressao-wrap { padding: 24px 0; }
    .folha { width: 210mm; min-height: 297mm; padding: 0; box-sizing: border-box; margin: 0 auto 8mm; background: #fff; }
    @media screen { .folha { box-shadow: 0 1px 10px rgba(0,0,0,.15); } }
    @media print {
      .no-print { display: none !important; }
      @page { size: A4; margin: 0; }
      html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
      .impressao-wrap { padding: 0 !important; background: #fff !important; }
      /* Sem margem entre folhas e quebra de página por folha (evita estouro p/ páginas extras). */
      .folha { margin: 0 !important; break-after: page; page-break-after: always; }
      .folha:last-child { break-after: auto; page-break-after: auto; }
    }
  `

  // ---- Render v2 (editor de blocos) ----
  if (docsV2) {
    // Default segue a ordem das modalidades (1ª = principal), não a ordem arbitrária das chaves.
    const primeira = modalidadesV2.find((m) => docsV2[m.id])?.id
    const modId = (mod && docsV2[mod] ? mod : primeira) ?? Object.keys(docsV2)[0]
    const doc = docsV2[modId]
    // Troca imagens base64 (fundo) por URLs hospedadas → HTML leve, geração muito mais rápida.
    await hospedarImagensDoc(doc, svc)
    const running = doc?.running ?? RUNNING_PADRAO
    const cabecalho = (doc?.cabecalho ?? []) as any[]
    const rodape = (doc?.rodape ?? []) as any[]
    const totalPag = doc?.pages.length ?? 0
    const vazio = !doc || doc.pages.every((p) => p.blocks.filter((b: any) => b.type !== 'plano-fundo').length === 0)
    const paginas = (d: CadernoData, prefix: string) => doc.pages.map((page, pi) => {
      const bg = page.blocks.find((b: any) => b.type === 'plano-fundo') as any
      const conteudo = page.blocks.filter((b: any) => b.type !== 'plano-fundo')
      // Cabeçalho/rodapé só ocupam espaço quando TÊM blocos (evita faixas vazias no PDF).
      const mostraCab = running.cabecalhoAtivo && cabecalho.length > 0 && faixaNaPagina(running.cabecalhoPaginas, pi, page.kind)
      const mostraRod = running.rodapeAtivo && rodape.length > 0 && faixaNaPagina(running.rodapePaginas, pi, page.kind)
      return (
        <div key={prefix + page.id} className="folha" style={{ position: 'relative', background: theme.cores.fundo }}>
          {bg?.attributes?.url && (
            <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${bg.attributes.url})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: (bg.attributes.opacidade ?? 100) / 100 }} />
          )}
          <div style={{ position: 'relative', display: 'flex', minHeight: '100%', flexDirection: 'column' }}>
            {mostraCab && (
              <div style={{ borderBottom: `1px solid ${theme.cores.secundaria}33`, paddingTop: '10mm', paddingBottom: 8, marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'flex-start', ...(running.cabecalhoAltura ? { minHeight: running.cabecalhoAltura } : {}) }}>
                {cabecalho.map((b) => <BlockRender key={b.id} block={b} theme={theme} data={d} />)}
              </div>
            )}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: '16mm', paddingRight: '16mm', paddingTop: mostraCab ? 0 : '14mm', paddingBottom: mostraRod ? 0 : '14mm' }}>
              {conteudo.map((block: any) => <BlockRender key={block.id} block={block} theme={theme} data={d} />)}
            </div>
            {mostraRod && (
              <div style={{ borderTop: `1px solid ${theme.cores.secundaria}33`, paddingTop: 8, paddingBottom: '10mm', marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'flex-end', ...(running.rodapeAltura ? { minHeight: running.rodapeAltura } : {}) }}>
                {rodape.map((b) => <BlockRender key={b.id} block={b} theme={theme} data={d} />)}
              </div>
            )}
          </div>
        </div>
      )
    })
    return (
      <div className="impressao-wrap min-h-screen bg-neutral-100 text-black">
        <style>{`${estilo} .aluno-quebra { break-before: page; }`}</style>
        <CadernoPrintControls />
        {copias.length > 1 && <div className="no-print mx-auto mb-3 max-w-[210mm] rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">Mala direta — {copias.length} aluno(s). Cada um começa em uma nova página.</div>}
        {vazio ? (
          <div className="folha flex items-center justify-center text-slate-400">Este caderno está vazio. Adicione blocos no editor.</div>
        ) : copias.map((c, ci) => (
          <div key={ci} className={ci > 0 ? 'aluno-quebra' : undefined}>{paginas(c.data, `a${ci}_`)}</div>
        ))}
      </div>
    )
  }

  // ---- Fallback: formato linear antigo ----
  const blocos = (config.blocos ?? []) as any[]
  const legacyIds = blocos.filter((b) => b.tipo === 'questao' && b.questao_id).map((b) => b.questao_id)
  const qMap = new Map((questoes ?? []).map((q: any) => [q.id, q]))
  let numero = 0
  return (
    <div className="impressao-wrap min-h-screen bg-neutral-100 text-black">
      <style>{estilo}</style>
      <CadernoPrintControls />
      <div className="folha" style={{ fontFamily: theme.tipografia.familia }}>
        <h1 className="mb-1 text-center text-xl font-bold">{config.cabecalho || caderno.nome}</h1>
        {gabarito && <p className="mb-3 text-center text-sm font-semibold text-red-600">— GABARITO —</p>}
        {config.instrucoes && <div className="mb-5 whitespace-pre-wrap rounded border border-black/20 p-3 text-sm">{config.instrucoes}</div>}
        <div className="space-y-5">
          {blocos.map((b: any, i: number) => {
            if (b.tipo === 'texto') return <p key={i} className="whitespace-pre-wrap text-[15px] leading-relaxed">{b.conteudo}</p>
            const q = qMap.get(b.questao_id); if (!q) return null
            numero += 1
            const qAlts = (altMap.get(q.id) ?? []).slice().sort((a, b2) => a.ordem - b2.ordem)
            return (
              <div key={i} className="text-[15px] leading-relaxed" style={{ breakInside: 'avoid' }}>
                <p className="mb-1"><strong>{numero}.</strong> {q.enunciado}</p>
                {q.tipo === 'discursiva'
                  ? <div className="mt-2 space-y-4">{[0, 1, 2, 3, 4, 5].map((n) => <div key={n} className="border-b border-black/30" style={{ height: '1.4em' }} />)}</div>
                  : <div className="ml-4 space-y-1">{qAlts.map((a, idx) => <p key={a.id} className={gabarito && a.correta ? 'font-semibold' : ''}>{gabarito && a.correta ? '☑' : '○'} {LETRA[idx] ?? idx + 1}) {a.texto}</p>)}</div>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
