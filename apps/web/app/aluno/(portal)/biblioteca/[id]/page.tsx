import { notFound, redirect } from 'next/navigation'
import { after } from 'next/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { carregarDocParaLeitura, registrarLeituraAluno, lerProgressoLeituraAluno, diagnosticarFalhaLeitura, type MotivoFalhaLeitura } from '@/lib/conteudo/leitor'
import { LeitorBiblioteca } from '@/components/aluno/leitor-biblioteca'
import { paginaInicialDoDocumento } from '@/lib/conteudo/capa-pagina-server'
import { MidiaPlayer } from '@/components/aluno/midia-player'
import { getCurrentTenantId } from '@/lib/tenant'
import { getTenantTheme } from '@/lib/tenant-theme'
import { resolverVideoLeitura } from '@/lib/conteudo/video-leitura'
import { createAdminClient } from '@/lib/supabase/server'
import { liberacaoDoc, type Liberacao } from '@/lib/cronograma/adaptativo/liberacao'
import Link from 'next/link'

const fmtData = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}` }

/** Tela do material ainda trancado pela liberação do Cronograma Adaptativo. */
function MaterialBloqueado({ lib, voltarHref }: { lib: Liberacao; voltarHref: string }) {
  const msg = lib.motivo === 'data' && lib.liberaEm
    ? <>Este material faz parte do seu cronograma e será liberado em <b>{fmtData(lib.liberaEm)}</b>, junto com a meta dele.</>
    : lib.motivo === 'sem-plano'
      ? <>Este material é liberado conforme o seu <b>cronograma de estudos</b>. Monte o seu cronograma para começar a liberar os conteúdos.</>
      : <>Este material não está no seu cronograma atual. Ele é liberado quando entrar no seu plano de estudos.</>
  return (
    <div className="flex min-h-[70vh] items-center justify-center p-5">
      <div className="w-full max-w-md rounded-2xl border bg-card p-7 text-center shadow-sm">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
        </div>
        <h1 className="mb-2 text-lg font-bold">Material ainda não liberado</h1>
        {lib.titulo ? <p className="mb-3 text-sm font-medium text-muted-foreground">{lib.titulo}</p> : null}
        <p className="mb-6 text-sm leading-relaxed text-muted-foreground">{msg}</p>
        <div className="flex flex-col gap-2">
          <Link href="/aluno/cronograma" className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">Ir para o meu cronograma</Link>
          <Link href={voltarHref} className="inline-flex h-11 items-center justify-center rounded-xl border px-4 text-sm font-medium">Voltar</Link>
        </div>
      </div>
    </div>
  )
}

/** Em vez do 404 mudo: diz POR QUE o material não abriu e oferece caminhos (voltar, tentar de novo, falar com o suporte). */
function MaterialIndisponivel({ motivo, titulo, voltarHref }: { motivo: MotivoFalhaLeitura; titulo: string | null; voltarHref: string }) {
  const [h, msg] = ({
    em_preparacao: ['Material em preparação', 'Este material ainda está sendo preparado pela equipe e será publicado em breve. Volte mais tarde.'],
    nao_publicado: ['Material ainda não publicado', 'Este material ainda não foi publicado. Assim que for, ele abre normalmente.'],
    ainda_nao_liberado: ['Material ainda não liberado', 'Este material será liberado em uma data programada para o seu plano de estudos. Volte quando ele estiver liberado.'],
    sem_acesso: ['Você não tem acesso a este material', 'Seu acesso a este conteúdo não está liberado. Se você acredita que deveria ter acesso, fale com o suporte informando o nome do material.'],
    inexistente: ['Material não encontrado', 'Este material não existe mais ou o link está incorreto.'],
    indisponivel: ['Não foi possível abrir agora', 'Houve um problema temporário ao carregar o material. Tente novamente em instantes; se continuar, fale com o suporte informando o nome do material.'],
  } as Record<MotivoFalhaLeitura, [string, string]>)[motivo]
  return (
    <div className="flex min-h-[70vh] items-center justify-center p-5">
      <div className="w-full max-w-md rounded-2xl border bg-card p-7 text-center shadow-sm">
        <h1 className="mb-2 text-lg font-bold">{h}</h1>
        {titulo ? <p className="mb-3 text-sm font-medium text-muted-foreground">{titulo}</p> : null}
        <p className="mb-6 text-sm leading-relaxed text-muted-foreground">{msg}</p>
        <div className="flex flex-col gap-2">
          {motivo === 'indisponivel' && <a href="" className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">Tentar novamente</a>}
          <Link href={voltarHref} className="inline-flex h-11 items-center justify-center rounded-xl border px-4 text-sm font-medium">Voltar</Link>
        </div>
      </div>
    </div>
  )
}

export const dynamic = 'force-dynamic'

export default async function LeituraConteudoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ produto?: string; pagina?: string; partes?: string; meta?: string; voltar?: string; tseg?: string; tdet?: string }> }) {
  const { id } = await params
  const sp = await searchParams
  // ?pagina=N — abre o leitor direto na página inicial da meta/parte do Cronograma Adaptativo.
  const paginaInicial = Math.max(1, Math.trunc(Number(sp?.pagina)) || 1)
  // ?partes=<base64 json> — divisórias de cada parte no leitor (começa a Parte N) + botão Concluir por parte.
  // ?meta=<id> — a meta aberta (destaque). Só do Cronograma; leitura normal da Biblioteca não passa isso.
  let partesCrono: { id: string; i: number; f: number; r: string }[] = []
  try {
    if (sp?.partes) {
      const j = JSON.parse(Buffer.from(String(sp.partes), 'base64').toString('utf8'))
      if (Array.isArray(j)) partesCrono = j.slice(0, 60).map((x: Record<string, unknown>) => ({ id: String(x.id ?? ''), i: Math.max(1, Math.trunc(Number(x.i)) || 1), f: Math.max(0, Math.trunc(Number(x.f)) || 0), r: String(x.r ?? '').slice(0, 60) })).filter((x) => x.id)
    }
  } catch { /* query malformada: ignora, abre o doc normalmente */ }
  const metaAtual = typeof sp?.meta === 'string' ? sp.meta.slice(0, 40) : ''
  // ?voltar=/aluno/... — para onde o "Voltar" do leitor retorna (do cronograma volta ao cronograma,
  // não à Biblioteca). Só aceita rota interna /aluno/ (segurança). Padrão: Biblioteca.
  const voltarHref = typeof sp?.voltar === 'string' && sp.voltar.startsWith('/aluno/') ? sp.voltar.slice(0, 200) : '/aluno/biblioteca'
  // ?tseg=N — tempo (segundos) já acumulado nesta meta; o cronômetro do leitor conta a partir dele.
  const tempoBase = Math.max(0, Math.min(999999, Math.trunc(Number(sp?.tseg)) || 0))
  // ?tdet=N — TEMPO DETERMINADO da meta (planejado, em segundos); o leitor mostra contagem regressiva.
  const tempoDeterminadoSeg = Math.max(0, Math.min(999999, Math.trunc(Number(sp?.tdet)) || 0))
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')

  // LOADER UNIFICADO: 1 fetch do doc + 1 decisão de acesso (cacheada 60s), ramifica mídia/PDF.
  // Antes eram DUAS passagens (carregarMidiaAluno + carregarLeituraPdf), cada uma re-buscando o doc +
  // re-rodando o gate. null = sem acesso / não encontrado → 404.
  // LIBERAÇÃO POR DATA (Cronograma Adaptativo): material ainda não liberado no plano do aluno → tela
  // explicando QUANDO libera (em vez do 404 genérico que o gate do leitor daria).
  const tenantId = await getCurrentTenantId()
  // Tudo o que NÃO depende de outra coisa roda em PARALELO (antes: liberação → tema → doc → progresso, em série):
  // liberação por data, tema da empresa, vídeo da leitura, o documento (gate + conteúdo) e o progresso salvo do aluno.
  const supa = createAdminClient()
  const paginaExplicitaP = sp?.pagina !== undefined && Number.isFinite(Number(sp.pagina))
  const doCronogramaP = !!sp?.meta || !!sp?.partes
  const [lib, tt, video0, doc, salvo] = await Promise.all([
    tenantId ? liberacaoDoc(supa, tenantId, sessao.estudanteId, id) : Promise.resolve(null),
    getTenantTheme().catch(() => null),
    tenantId ? resolverVideoLeitura(supa, tenantId, id, sessao.estudanteId).catch(() => null) : Promise.resolve(null),
    carregarDocParaLeitura(id, sessao.estudanteId, { produtoId: typeof sp?.produto === 'string' ? sp.produto : null }).catch(() => null),
    !paginaExplicitaP && !doCronogramaP && tenantId ? lerProgressoLeituraAluno(tenantId, sessao.estudanteId, id).catch(() => null) : Promise.resolve(null),
  ])
  if (lib?.bloqueado) return <MaterialBloqueado lib={lib} voltarHref={voltarHref} />
  // IDENTIDADE da empresa no leitor: logo (versão clara, p/ a barra roxa) + nome.
  const marca = { logo: (tt?.tema as any)?.logo_url ?? (tt?.tema as any)?.logo_dark_url ?? null, nome: tt?.tenantNome ?? '' }
  if (!doc) {
    // Sem 404 mudo: explica o motivo (em preparação / não publicado / sem acesso / não existe / falha temporária).
    const d = await diagnosticarFalhaLeitura(id, sessao.estudanteId)
    return <MaterialIndisponivel motivo={d.motivo} titulo={d.titulo} voltarHref={voltarHref} />
  }
  const video = doc.kind === 'midia' ? null : video0

  // PÁGINA INICIAL (Biblioteca): a do documento ou da pasta em lote. O leitor ABRE direto nela, mas NÃO corta o que vem
  // antes: as páginas anteriores continuam na leitura (é só rolar para cima). Só vale na abertura NORMAL do documento.
  const paginaDoc = doc.kind === 'pdf' ? await paginaInicialDoDocumento(id) : 1
  // Aberto pelo CRONOGRAMA (meta/partes) a página é a da PARTE (?pagina= ou a 1ª): a página inicial do documento NÃO se aplica.
  const doCronograma = !!sp?.meta || !!sp?.partes
  const paginaExplicita = sp?.pagina !== undefined && Number.isFinite(Number(sp.pagina))
  // RETOMAR de onde parou (abertura normal, leitura ainda não concluída): usa o progresso salvo do aluno.
  // (progresso salvo já carregado em paralelo acima: `salvo`)
  const retomar = !!salvo && !salvo.concluidoEm
  const paginaRetomar = retomar && salvo!.pagina && salvo!.pagina > 1 ? salvo!.pagina : null
  const posicaoPct = retomar && !paginaRetomar && salvo!.pct && salvo!.pct > 1 ? salvo!.pct : null
  const semProgresso = !!sessao.impersonation // admin visualizando a conta NÃO grava progresso do aluno
  const paginaAbrir = paginaExplicita || doCronograma ? paginaInicial : (paginaRetomar ?? paginaDoc)

  // Progresso de leitura (histórico + snapshot de cursos) NÃO precisa concluir para a página renderizar:
  // roda APÓS a resposta (`after`), tirando o upsert + o write-behind do caminho crítico da abertura.
  const estudanteId = sessao.estudanteId
  const versaoId = doc.kind === 'midia' ? doc.midia.versaoId : doc.kind === 'texto' ? doc.texto.versaoId : doc.pdf.versaoId
  after(() => registrarLeituraAluno(id, estudanteId, versaoId).catch(() => {}))

  // MÍDIA (vídeo/áudio): player nativo.
  if (doc.kind === 'midia') {
    return <MidiaPlayer titulo={doc.midia.titulo} url={doc.midia.url} kind={doc.midia.kind} voltarHref={voltarHref} />
  }

  // DOCUMENTO LEGPROC (marca no admin): leitor do Juris em modo TEXTO, com os entendimentos STF/STJ
  // recolhíveis (mesma lib da Lei Seca). Grifos por texto (âncora = trecho + offsets), mapeados aqui no servidor.
  if (doc.kind === 'texto') {
    const t = doc.texto
    const grifosTexto = t.anotacoes
      .filter((a) => a.estado !== 'orfa')
      .map((a) => ({
        id: a.id, pid: a.trecho_uid, s: a.inicio_offset, e: a.fim_offset,
        t: String(a.conteudo?.tool || (a.tipo === 'riscado' ? 'st' : 'hl')), c: String(a.conteudo?.cor || 'y'), note: String(a.conteudo?.nota || ''),
        sec: 't1', text: a.texto_ancora,
      }))
    return (
      <LeitorBiblioteca
      marca={marca}
      video={video}
        documentoId={t.documentoId}
        versaoId={t.versaoId}
        titulo={t.titulo}
        pdfUrl={null}
        texto={{ html: t.html, grifos: grifosTexto, ocultarLegendaTabela: t.ocultarLegendaTabela, modeloJuris: t.modeloJuris }}
        grifos={[]}
        voltarHref={voltarHref}
        metaCrono={metaAtual}
        tempoBase={tempoBase}
        tempoDeterminadoSeg={tempoDeterminadoSeg}
        mostrarLegenda={t.mostrarLegenda}
        semProgresso={semProgresso}
        posicaoInicialPct={posicaoPct ?? undefined}
      />
    )
  }

  // Leitor do Juris (real) + conteúdo = PDF fiel; grifos salvos no perfil do aluno.
  const leitura = doc.pdf
  return (
    <LeitorBiblioteca
      marca={marca}
      video={video}
      documentoId={leitura.documentoId}
      versaoId={leitura.versaoId}
      titulo={leitura.titulo}
      pdfUrl={leitura.pdfUrl}
      grifos={leitura.grifos}
      voltarHref={voltarHref}
      paginaInicial={paginaAbrir}
      partesCrono={partesCrono}
      metaCrono={metaAtual}
      tempoBase={tempoBase}
      tempoDeterminadoSeg={tempoDeterminadoSeg}
      mostrarLegenda={leitura.mostrarLegenda}
      semProgresso={semProgresso}
    />
  )
}
