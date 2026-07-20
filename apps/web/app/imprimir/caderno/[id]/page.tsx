import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, type Access } from '@/lib/auth/permissions'
import { verificarRenderToken } from '@/lib/pdf/render-token'
import { CadernoPrintControls } from '@/components/admin/caderno-print-controls'
import { PaginadorCaderno } from '@/components/caderno/paginador-caderno'
import { BlockRender, dataComQuestao } from '@/lib/caderno-designer/blocks'
import { resolveTheme } from '@/lib/caderno-designer/theme'
import { carregarRegistros } from '@/lib/caderno-designer/merge'
import { hospedarImagensDoc } from '@/lib/caderno-designer/hospedar-imagens'
import { faixaNaPagina, RUNNING_PADRAO, PAD_V, PAD_H, docCadernoCompleto, docCadernoPerguntas, type CadernoData, type CadernoDoc } from '@/lib/caderno-designer/types'

// Modalidades-padrão que têm um doc-semente: se o caderno não salvou um documento próprio
// para elas, entregamos o modelo padrão (mantém as entregas do aluno sempre disponíveis).
const SEED_DOCS: Record<string, () => CadernoDoc> = { caderno_completo: docCadernoCompleto, caderno_perguntas: docCadernoPerguntas }

const LETRA = ['A', 'B', 'C', 'D', 'E', 'F']

export default async function CadernoImprimirPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ gabarito?: string; mod?: string; aluno?: string; todos?: string; sessao?: string; pdftoken?: string; semgab?: string; rawimg?: string; embed?: string }>
}) {
  const { id } = await params
  const { gabarito: g, mod, aluno, todos, sessao, pdftoken, semgab, rawimg, embed: embedParam } = await searchParams
  const gabarito = g === '1'
  const embed = embedParam === '1' // preview embutido (iframe): oculta a barra de controles de impressão
  const forcarSemGabarito = semgab === '1' // "como você fez": mostra marcações, oculta a correção
  const rawImg = rawimg === '1' // mantém fundos em base64 (não depende do Storage)

  // Acesso: cookie do admin OU token de render assinado (Gotenberg, sem cookie) OU
  // o id da sessão do aluno (mesma credencial de /imprimir/resultado). Sempre escopado
  // ao tenant correspondente.
  let access: Access
  const tokenPayload = verificarRenderToken(pdftoken)
  if (tokenPayload && tokenPayload.r === 'caderno' && tokenPayload.id === id) {
    access = { userId: null, tenantId: tokenPayload.t, role: 'render', isAdmin: true, permissions: ['*'] }
  } else if (sessao) {
    // Aluno abrindo o próprio caderno: valida a sessão e escopa ao tenant dela.
    const svcSess = createAdminClient()
    const { data: sess } = await svcSess.from('simulado_sessoes_prova').select('tenant_id').eq('id', sessao).maybeSingle()
    if (!sess) notFound()
    access = { userId: null, tenantId: (sess as any).tenant_id, role: 'render', isAdmin: true, permissions: ['*'] }
  } else {
    access = await getCurrentAccess()
    if (!access.isAdmin && !access.permissions.includes('questoes:view')) notFound()
  }

  const svc = createAdminClient()
  const { data: caderno } = await svc
    .from('simulado_cadernos_designer')
    .select('id, nome, config')
    .eq('id', id)
    .eq('tenant_id', access.tenantId ?? '00000000-0000-0000-0000-000000000000')
    .maybeSingle()
  if (!caderno) notFound()

  const config = (caderno.config ?? {}) as any
  const docsV2: Record<string, CadernoDoc> | undefined = config.docsV2
  const modalidadesV2: { id: string; nome: string }[] = config.modalidadesV2 ?? []
  const theme = resolveTheme(config.cores)
  let bancoId: string | null = config.bancoId ?? null
  // Diagnóstico individual: o banco vem do SIMULADO da sessão (não o fixo do caderno) — assim
  // o MESMO caderno serve a vários simulados/disciplinas e cada aluno vê os dados do SEU simulado.
  if (sessao) {
    const { data: sessB } = await svc.from('simulado_sessoes_prova').select('simulado_id').eq('id', sessao).maybeSingle()
    const simIdB = (sessB as any)?.simulado_id
    if (simIdB) {
      const { data: simB } = await svc.from('simulado_simulados').select('regras').eq('id', simIdB).maybeSingle()
      const bb = ((simB as any)?.regras as any)?.banco_base_id as string | undefined
      if (bb) bancoId = bb
    }
  }

  // ---- Questões: do banco vinculado ou publicadas do tenant ----
  let questoes: any[] | null = null
  if (bancoId) {
    const { data: vinc } = await svc.from('simulado_questao_pasta').select('questao_id').eq('pasta_id', bancoId)
    const ids = (vinc ?? []).map((v: any) => v.questao_id)
    questoes = ids.length ? (await svc.from('simulado_questoes').select('id, enunciado, tipo, comentario_professor, numero').in('id', ids).limit(200)).data : []
  } else {
    questoes = (await svc
      .from('simulado_questoes')
      .select('id, enunciado, tipo, comentario_professor, numero')
      .eq('tenant_id', access.tenantId ?? '00000000-0000-0000-0000-000000000000')
      .eq('status', 'publicada')
      .order('created_at', { ascending: false })
      .limit(120)).data
  }

  // Ordena as questões na MESMA ordem em que o ALUNO as viu na prova — senão as marcações
  // (mapeadas por questao_id) caem em posições trocadas no caderno. Prioridade:
  // ordem embaralhada da sessão → ordem da prova (prova_questoes) → nº da questão (fallback).
  {
    let ordemMap: Map<string, number> | null = null
    if (sessao) {
      const { data: sess2 } = await svc.from('simulado_sessoes_prova').select('simulado_id').eq('id', sessao).maybeSingle()
      const simId = (sess2 as any)?.simulado_id
      if (simId) {
        const { data: sqo } = await svc.from('simulado_sessao_questao_ordem').select('questao_id, ordem_exibida').eq('sessao_id', sessao)
        if (sqo?.length) ordemMap = new Map((sqo as any[]).map((r) => [r.questao_id, Number(r.ordem_exibida)]))
        else {
          const { data: pq2 } = await svc.from('simulado_prova_questoes').select('questao_id, ordem').eq('simulado_id', simId)
          if (pq2?.length) ordemMap = new Map((pq2 as any[]).map((r) => [r.questao_id, Number(r.ordem)]))
        }
      }
    }
    const numDe = (q: any) => { const n = Number(q?.numero); return Number.isFinite(n) ? n : 1e9 }
    questoes = [...(questoes ?? [])].sort((a: any, b: any) => {
      const oa = ordemMap?.get(a.id), ob = ordemMap?.get(b.id)
      if (oa != null || ob != null) return (oa ?? 1e9) - (ob ?? 1e9)
      return numDe(a) - numDe(b)
    })
  }

  const qIds = (questoes ?? []).map((q: any) => q.id)
  const { data: alts } = qIds.length
    ? await svc.from('simulado_alternativas').select('questao_id, texto, ordem, correta, comentario, lei').in('questao_id', qIds)
    : { data: [] as any[] }
  const altMap = new Map<string, any[]>()
  for (const a of alts ?? []) { const arr = altMap.get(a.questao_id) ?? []; arr.push(a); altMap.set(a.questao_id, arr) }

  const data: CadernoData = {
    numQuestoes: (questoes ?? []).length || 20,
    numAlternativas: 5,
    questoes: (questoes ?? []).map((q: any, i: number) => ({
      id: q.id, numero: i + 1, enunciado: q.enunciado ?? '', tipo: q.tipo, comentario: q.comentario_professor ?? '',
      alternativas: (altMap.get(q.id) ?? []).sort((x, y) => x.ordem - y.ordem).map((a, j) => ({ letra: LETRA[j] ?? '?', texto: a.texto ?? '', correta: !!a.correta, comentario: a.comentario ?? '', lei: a.lei ?? '' })),
    })),
    vars: { nome: '', simulado: caderno.nome, acertos: '', erros: '', total_questoes: String((questoes ?? []).length || 20), nota: '', percentual: '' },
  }
  // Gating: o gabarito (correção) só aparece se algum simulado vinculado ao banco liberou.
  if (bancoId && !forcarSemGabarito) {
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
    // Diagnóstico individual (aluno definido): escopa a mala direta a ESSE aluno — rápido e
    // sem o teto de 1000 que fazia sair em branco para quem estava além do 1000 no banco.
    const registros = await carregarRegistros(svc, access.tenantId ?? '00000000-0000-0000-0000-000000000000', bancoId, (banco as any)?.nome ?? caderno.nome, sessao, todos === '1' ? undefined : (aluno || undefined))
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
    // Modalidade pedida sem doc próprio, mas com semente (ex.: Caderno de Perguntas em
    // cadernos antigos) → renderiza o modelo-semente em vez de cair na 1ª modalidade.
    const usarSeed = !!mod && !docsV2[mod] && !!SEED_DOCS[mod]
    const modId = usarSeed ? mod! : ((mod && docsV2[mod] ? mod : primeira) ?? Object.keys(docsV2)[0])
    const doc = usarSeed ? SEED_DOCS[mod!]() : docsV2[modId]
    // Troca imagens base64 (fundo) por URLs hospedadas → HTML leve (bom p/ Gotenberg).
    // Com `?rawimg=1` mantém o base64 embutido: o Edge/navegador renderiza o fundo direto,
    // sem depender do bucket de Storage (cujas URLs podem estar indisponíveis).
    if (!rawImg) await hospedarImagensDoc(doc, svc)
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
            // Fundo dimensionado a UMA página A4 (sem esticar pela folha nem vazar): o letterhead
            // fica na 1ª página do conteúdo; o excesso flui para a página seguinte, limpa.
            <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${bg.attributes.url})`, backgroundSize: '210mm 297mm', backgroundRepeat: 'no-repeat', backgroundPosition: 'top center', opacity: (bg.attributes.opacidade ?? 100) / 100 }} />
          )}
          <div style={{ position: 'relative', display: 'flex', minHeight: '100%', flexDirection: 'column' }}>
            {mostraCab && (
              <div style={{ borderBottom: `1px solid ${theme.cores.secundaria}33`, paddingTop: '10mm', paddingBottom: 8, marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'flex-start', ...(running.cabecalhoAltura ? { minHeight: running.cabecalhoAltura } : {}) }}>
                {cabecalho.map((b) => <BlockRender key={b.id} block={b} theme={theme} data={d} />)}
              </div>
            )}
            <div style={{ flex: 1, display: 'block', paddingLeft: '16mm', paddingRight: '16mm', paddingTop: mostraCab ? 0 : '14mm', paddingBottom: mostraRod ? 0 : '14mm' }}>
              {conteudo.map((block: any) => <div key={block.id} style={{ marginBottom: 6 }}><BlockRender block={block} theme={theme} data={d} /></div>)}
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
    // ---- Layout do download do aluno (rawImg): PAGINADOR determinístico ----
    // Cada folha A4 mostra o letterhead INTEIRO (cabeçalho com logos + rodapé, sem fatiar em
    // barra preta) e as questões na área segura. O PaginadorCaderno (cliente) mede as questões
    // e distribui por página — não depende de @page (que o Chrome ignora em continuações).
    if (rawImg && doc && !vazio) {
      const capaPages = doc.pages.filter((p: any) => p.kind === 'capa')
      const contPages = doc.pages.filter((p: any) => p.kind !== 'capa')
      const bgCont = contPages.map((p: any) => p.blocks.find((b: any) => b.type === 'plano-fundo')).find(Boolean) as any
      const letterhead = (bgCont?.attributes?.url as string | undefined) ?? null
      const opac = bgCont ? (bgCont.attributes?.opacidade ?? 100) / 100 : 1
      // Área segura reservada em cada folha (px) — IGUAL ao editor: quando a faixa de
      // cabeçalho/rodapé tem blocos, reserva a altura configurada; senão usa PAD_V. Assim
      // o PDF fica alinhado com o preview do hub de criação.
      // Reserva de área segura = altura do cabeçalho/rodapé configurada (quando a faixa está
      // ATIVA, mesmo sem blocos — a arte já tem cabeçalho/rodapé). Senão, PAD_V. MESMO valor em
      // TODAS as páginas → idêntico ao hub de criação.
      const cabH = running.cabecalhoAtivo ? (running.cabecalhoAltura || PAD_V) : PAD_V
      const rodH = running.rodapeAtivo ? (running.rodapeAltura || PAD_V) : PAD_V
      const cabHCont = cabH
      const estiloAluno = `
        .impressao-wrap { padding: 24px 0; }
        /* SEM overflow:hidden — o paginador já distribui os blocos por página; cortar aqui
           faria um bloco que passa do limite "sumir". Sem corte, no pior caso (bloco maior
           que a página) ele transborda de forma visível em vez de desaparecer. */
        .folha { width: 210mm; min-height: 297mm; box-sizing: border-box; margin: 0 auto 8mm; background: #fff; }
        @media screen { .folha { box-shadow: 0 1px 10px rgba(0,0,0,.15); } }
        @media print {
          .no-print { display: none !important; }
          @page { size: A4; margin: 0; }
          html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
          .impressao-wrap { padding: 0 !important; background: #fff !important; }
          .folha { margin: 0 !important; break-after: page; page-break-after: always; }
          .folha:last-child { break-after: auto; page-break-after: auto; }
          .aluno-quebra { break-before: page; }
        }
      `
      return (
        <div className="impressao-wrap min-h-screen bg-neutral-100 text-black">
          <style>{estiloAluno}</style>
          {!embed && <CadernoPrintControls />}
          {copias.map((c, ci) => {
            // Itens de UMA página de conteúdo. Cada questão é um item próprio (a repetição é
            // expandida) para o paginador distribuir por página; os demais blocos são itens únicos.
            const itensDaPagina = (page: any) =>
              page.blocks.filter((b: any) => b.type !== 'plano-fundo').flatMap((block: any) => {
                // Quebra de página manual → o paginador fecha a folha aqui (marcador não renderiza).
                if (block.type === 'quebra-pagina') return [{ key: `${ci}-${page.id}-${block.id}`, gapTop: 0, quebra: true, node: null }]
                if (block.type === 'repeticao') {
                  const qtd = block.attributes?.quantidade as number | null | undefined
                  const gapQ = (block.attributes?.gap as number | undefined) ?? 16 // espaço ENTRE questões (igual ao editor)
                  const qs = qtd ? c.data.questoes.slice(0, qtd) : c.data.questoes
                  const inner = (block.innerBlocks ?? []) as any[]
                  // "Cabeça" da questão = do início até o 1º texto (número + enunciado juntos, nunca
                  // órfãos). Os demais blocos (alternativas, resposta, correção, comentário) viram
                  // itens SOLTOS → o paginador continua a questão na próxima folha e ENCHE as folhas.
                  let corte = inner.findIndex((ib) => ib.type === 'texto-livre')
                  if (corte < 0) corte = 0
                  const head = inner.slice(0, corte + 1)
                  const resto = inner.slice(corte + 1)
                  return qs.flatMap((q: any) => {
                    const dq = dataComQuestao(c.data, q)
                    const itens: { key: string; gapTop: number; node: any }[] = [{
                      key: `${ci}-${page.id}-${q.id}-head`,
                      gapTop: gapQ,
                      node: (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, breakInside: 'avoid' }}>
                          {head.map((ib: any) => <BlockRender key={ib.id} block={ib} theme={theme} data={dq} />)}
                        </div>
                      ),
                    }]
                    for (const ib of resto) itens.push({
                      key: `${ci}-${page.id}-${q.id}-${ib.id}`,
                      gapTop: 6,
                      node: <div style={{ breakInside: 'avoid' }}><BlockRender block={ib} theme={theme} data={dq} /></div>,
                    })
                    return itens
                  })
                }
                return [{ key: `${ci}-${page.id}-${block.id}`, gapTop: 0, node: <BlockRender block={block} theme={theme} data={c.data} /> }]
              })
            return (
              <div key={ci} className={ci > 0 ? 'aluno-quebra' : undefined}>
                {capaPages.map((page: any) => {
                  const bg = page.blocks.find((b: any) => b.type === 'plano-fundo') as any
                  const conteudo = page.blocks.filter((b: any) => b.type !== 'plano-fundo')
                  return (
                    <div key={page.id} className="folha" style={{ position: 'relative', background: theme.cores.fundo }}>
                      {bg?.attributes?.url && <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${bg.attributes.url})`, backgroundSize: '210mm 297mm', backgroundRepeat: 'no-repeat', backgroundPosition: 'top center', opacity: (bg.attributes.opacidade ?? 100) / 100 }} />}
                      <div style={{ position: 'relative', display: 'flex', minHeight: '100%', flexDirection: 'column', paddingTop: PAD_V, paddingBottom: PAD_V, paddingLeft: PAD_H, paddingRight: PAD_H }}>
                        {conteudo.map((block: any) => <BlockRender key={block.id} block={block} theme={theme} data={c.data} />)}
                      </div>
                    </div>
                  )
                })}
                {/* Uma PÁGINA do editor = uma página no PDF (paginada individualmente). Respeita
                    as quebras que o usuário montou; o overflow interno flui como rede de segurança.
                    Antes, TODAS as páginas eram achatadas num só fluxo e reflluíam — o que quebrava
                    o posicionamento/espaçamento em relação ao editor. */}
                {contPages.map((page: any) => (
                  <PaginadorCaderno key={`${ci}-${page.id}`} itens={itensDaPagina(page)} letterhead={letterhead} opac={opac} cabH={cabH} cabHCont={cabHCont} rodH={rodH} fundo={theme.cores.fundo} />
                ))}
              </div>
            )
          })}
        </div>
      )
    }

    return (
      <div className="impressao-wrap min-h-screen bg-neutral-100 text-black">
        <style>{`${estilo} .aluno-quebra { break-before: page; }`}</style>
        {!embed && <CadernoPrintControls />}
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
      {!embed && <CadernoPrintControls />}
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
