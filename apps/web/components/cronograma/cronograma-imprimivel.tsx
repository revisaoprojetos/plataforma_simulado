import { dow, fmtIntervalo, offsetDesdeSegunda } from '@/lib/cronograma/datas'
import { acharPaleta } from '@/lib/cronograma/paletas'
import type { Grade, MetaDatada, SemanaGrade, TipoMetaDef } from '@/lib/cronograma/tipos'

/** As sete colunas, sempre — é assim no documento da equipe, mesmo quando o domingo é vazio. */
const DIAS = ['SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA', 'SÁBADO', 'DOMINGO']

/**
 * O cronograma em folha, no formato do documento que a equipe usa: **uma semana por página**,
 * em grade de horário escolar — linhas são os TIPOS de meta, colunas são os dias da semana.
 *
 * A primeira versão desta tela era uma lista corrida, e estava longe: o que o aluno pendura na
 * parede é a semana inteira de relance, não uma lista para rolar. O layout aqui foi lido do
 * `docs/cronograma/cronograma_teste_2h (2).docx`, tabela por tabela.
 *
 * Estrutura de cada página, igual à do documento:
 *   SEMANA N - dd/mm/aaaa a dd/mm/aaaa      (faixa)
 *   MARCA - 2H                              (faixa secundária)
 *   TIPO DE META | SEGUNDA | … | DOMINGO    (cabeçalho)
 *   PDFULL ou VIDEOAULA(1:30) | … metas …   (uma linha por tipo)
 *
 * Semanas de revisão têm página própria com o texto de orientação, também como no documento.
 *
 * Duas escolhas que separam a FOLHA da tela:
 * - Sem caixas de marcação. Quem imprime marca à caneta do jeito que preferir; caixa impressa é
 *   promessa de um estado que o papel não tem como guardar.
 * - Uma área de anotações por semana. É o que o aluno faz com a folha na parede.
 */
export function CronogramaImprimivel({
  grade,
  paletaSlug,
  titulo,
  cronogramaNome,
  alunoNome,
  geradoEm,
  marca,
  cargaHoraria,
  checks,
}: {
  grade: Grade
  paletaSlug: string
  titulo: string | null
  cronogramaNome: string
  alunoNome: string | null
  geradoEm: string
  /** Nome curto do tenant, para a faixa secundária ("REVISÃO - 2H"). */
  marca?: string | null
  cargaHoraria?: number | null
  checks?: Record<string, string>
}) {
  const paleta = acharPaleta(paletaSlug)

  /**
   * Só entram os tipos que TÊM meta naquela semana.
   *
   * O `sempre_no_docx` do cadastro faria "Legproc" aparecer como linha vazia em toda semana que
   * não usa esse tipo — linha em branco ocupando a altura de uma linha cheia. Numa folha em que
   * o espaço é o recurso escasso, tipo sem meta é ruído, não informação.
   */
  function linhasDaSemana(s: Extract<SemanaGrade, { kind: 'conteudo' }>): TipoMetaDef[] {
    const presentes = new Map<string, TipoMetaDef>()
    for (const m of s.metas) presentes.set(m.tipo, m.tipoDef)
    return [...presentes.values()].sort((a, b) => a.ordem - b.ordem)
  }

  /** Metas de um tipo num dia (coluna 0 = segunda), na ordem do cadastro. */
  function celula(s: Extract<SemanaGrade, { kind: 'conteudo' }>, slug: string, coluna: number): MetaDatada[] {
    return s.metas.filter((m) => m.tipo === slug && offsetDesdeSegunda(dow(m.data)) === coluna)
  }

  /**
   * Duração no rótulo do tipo — "(1:30)" no documento. Sai da PRIMEIRA meta daquele tipo na
   * semana, que é a mesma regra do DOCX legado (por isso a tela de metas avisa quando há
   * durações divergentes: as outras não são impressas em lugar nenhum).
   */
  function duracaoDoTipo(s: Extract<SemanaGrade, { kind: 'conteudo' }>, slug: string): string | null {
    return s.metas.find((m) => m.tipo === slug && m.duracao)?.duracao ?? null
  }

  /**
   * O texto da célula, no formato do documento — que NÃO é o da tela.
   *
   * No papel: "Aula 01 - Direito Constitucional" e, embaixo, o conteúdo. Na tela:
   * "Direito Constitucional: Aula 01 - conteúdo". São públicos diferentes lendo de jeitos
   * diferentes, e o documento da equipe é o que o aluno já conhece.
   *
   * Metas de "Atividade" (R13) não ganham prefixo de aula — o conteúdo já se explica
   * ("CONTINUAÇÃO AULA 01 DIREITO CONSTITUCIONAL").
   */
  function textoCelula(m: MetaDatada): { chapeu: string | null; corpo: string | null } {
    const ehAtividade = m.disciplina.trim().toLowerCase() === 'atividade'
    if (ehAtividade || !m.aula) return { chapeu: null, corpo: m.conteudo || m.titulo }
    if (m.tipoDef.aula_no_titulo) return { chapeu: `${m.disciplina}: Aula ${m.aula}`, corpo: m.complemento }
    return { chapeu: `Aula ${m.aula} - ${m.disciplina}`, corpo: m.conteudo }
  }

  const faixaSec = [marca?.trim() || null, cargaHoraria ? `${cargaHoraria}H` : null].filter(Boolean).join(' - ')

  return (
    <div className="doc">
      <style>{`
        .doc { color: #18181b; background: #fff; font-size: 9pt; }
        .pagina { max-width: 277mm; margin: 0 auto 14mm; padding: 8mm; }
        /* Uma semana por página; break-inside nas linhas impede a última meta cair sozinha. */
        .pagina + .pagina { border-top: 1px dashed #d4d4d8; }
        .grade { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .grade td, .grade th { border: 1px solid #b9b9c0; padding: 4px 5px; vertical-align: top; }
        .faixa1, .faixa2 { color: #fff; text-align: center; font-weight: 700; letter-spacing: .02em;
                           -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .faixa1 { font-size: 11pt; padding: 6px; }
        .faixa2 { font-size: 9.5pt; padding: 4px; }
        .cabDia { font-size: 8pt; font-weight: 700; text-align: center; text-transform: uppercase;
                  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .tipo { font-size: 8pt; font-weight: 700; text-transform: uppercase; width: 15%;
                -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .chapeu { font-weight: 700; display: block; }
        .corpo { display: block; color: #3f3f46; }
        .meta + .meta { margin-top: 5px; padding-top: 5px; border-top: 1px dotted #d4d4d8; }
        .feito { color: #a1a1aa; text-decoration: line-through; }
        /* Área de anotação: a folha é para escrever em cima. Pauta leve, que imprime bem. */
        .notas { margin-top: 4px; border: 1px solid #b9b9c0; }
        .notasTit { font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
                    color: #52525b; padding: 3px 6px; border-bottom: 1px solid #d4d4d8; }
        .pauta { height: 24mm; background-image: repeating-linear-gradient(
                   to bottom, transparent 0, transparent 7.6mm, #dcdce1 7.6mm, #dcdce1 7.7mm);
                 -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .aviso { padding: 10px; font-size: 9.5pt; line-height: 1.5; }
        .rodape { margin-top: 6px; font-size: 7.5pt; color: #a1a1aa; text-align: right; }
        @media print {
          /* Paisagem: sete colunas de conteúdo não cabem em retrato sem espremer o texto. */
          @page { size: A4 landscape; margin: 0; }
          .doc { font-size: 8.5pt; }
          .pagina { max-width: none; padding: 10mm; page-break-after: always; break-after: page; }
          .pagina:last-child { page-break-after: auto; break-after: auto; }
          .pagina + .pagina { border-top: none; }
          .grade tr { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      {grade.semanas.map((s) => (
        <section className="pagina" key={s.numero}>
          <table className="grade">
            <tbody>
              <tr>
                <td className="faixa1" colSpan={8} style={{ background: paleta.primaria }}>
                  SEMANA {s.numero} - {fmtIntervalo(s.inicio, s.fim)}
                </td>
              </tr>
              {faixaSec && (
                <tr>
                  <td className="faixa2" colSpan={8} style={{ background: paleta.cabecalho }}>
                    {faixaSec.toUpperCase()}
                  </td>
                </tr>
              )}

              {s.kind === 'revisao' && (
                <>
                  <tr>
                    <td className="faixa2" colSpan={8} style={{ background: paleta.revisao }}>
                      SEMANA DE REVISÃO
                    </td>
                  </tr>
                  <tr>
                    <td className="aviso" colSpan={8}>
                      {s.blocos.map((b) => (
                        <p key={b.titulo} style={{ margin: '0 0 6px' }}>
                          {b.titulo && <strong>{b.titulo} </strong>}
                          {b.texto}
                        </p>
                      ))}
                    </td>
                  </tr>
                </>
              )}

              {s.kind === 'recesso' && (
                <>
                  <tr>
                    <td className="faixa2" colSpan={8} style={{ background: '#71717a' }}>
                      SEMANA DE RECESSO
                    </td>
                  </tr>
                  <tr>
                    <td className="aviso" colSpan={8}>
                      Sem metas programadas nesta semana. O cronograma é retomado na próxima segunda-feira.
                    </td>
                  </tr>
                </>
              )}

              {s.kind === 'conteudo' && (
                <>
                  <tr>
                    <th className="cabDia tipo" style={{ background: paleta.celula }}>
                      Tipo de meta
                    </th>
                    {DIAS.map((d) => (
                      <th key={d} className="cabDia" style={{ background: paleta.celula }}>
                        {d}
                      </th>
                    ))}
                  </tr>

                  {linhasDaSemana(s).map((t) => {
                    const dur = duracaoDoTipo(s, t.slug)
                    return (
                      <tr key={t.slug}>
                        <th className="tipo" style={{ background: paleta.celula }}>
                          {t.rotulo_docx}
                          {dur && <span style={{ fontWeight: 400 }}> ({dur})</span>}
                        </th>
                        {DIAS.map((_, i) => {
                          const metas = celula(s, t.slug, i)
                          return (
                            <td key={i} style={t.destaque_docx ? { height: '22mm' } : undefined}>
                              {metas.map((m) => {
                                const { chapeu, corpo } = textoCelula(m)
                                const feita = !!checks?.[m.id]
                                return (
                                  <div key={m.id} className={`meta${feita ? ' feito' : ''}`}>
                                    {chapeu && <span className="chapeu">{chapeu}</span>}
                                    {corpo && <span className="corpo">{corpo}</span>}
                                    {/* No papel a URL não serve; o nome da plataforma sim. */}
                                    {m.links && m.links.urls.length > 0 && (
                                      <span className="corpo" style={{ fontSize: '7.5pt' }}>
                                        {m.links.urls.map((u) => u.plataforma.nome).join(' · ')}
                                      </span>
                                    )}
                                  </div>
                                )
                              })}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </>
              )}
            </tbody>
          </table>

          {s.kind === 'conteudo' && (
            <div className="notas">
              <div className="notasTit">Anotações da semana</div>
              <div className="pauta" />
            </div>
          )}

          <p className="rodape">
            {titulo || cronogramaNome}
            {titulo && ` · ${cronogramaNome}`}
            {alunoNome && ` · ${alunoNome}`}
            {` · gerado em ${new Date(geradoEm).toLocaleDateString('pt-BR')}`}
            {` · semana ${s.numero} de ${grade.resumo.totalSemanas}`}
          </p>
        </section>
      ))}
    </div>
  )
}
