import { fmtBr, fmtIntervalo } from '@/lib/cronograma/datas'
import { fmtFaixa, somarDuracoes } from '@/lib/cronograma/duracao'
import { acharPaleta } from '@/lib/cronograma/paletas'
import type { Grade } from '@/lib/cronograma/tipos'

/**
 * O cronograma em folha A4, para o aluno salvar como PDF.
 *
 * É um componente de SERVIDOR e sem interatividade nenhuma — o que vai para o papel não tem
 * filtro, alternador nem botão. A tela e o PDF leem a MESMA grade, então não existe um segundo
 * cálculo que possa divergir do que o aluno viu.
 *
 * Decisões que só fazem sentido no papel:
 * - `break-inside: avoid` por semana: uma semana partida entre páginas é exatamente a unidade
 *   que o aluno usa para se organizar.
 * - `print-color-adjust: exact` nas faixas: sem isso o navegador imprime as tarjas da paleta em
 *   branco e a distinção entre conteúdo e revisão desaparece.
 * - Coluna de caixas vazias: quem imprime marca à caneta. As já concluídas na plataforma saem
 *   marcadas, para o papel refletir o progresso real em vez de recomeçar do zero.
 */
export function CronogramaImprimivel({
  grade,
  paletaSlug,
  titulo,
  cronogramaNome,
  alunoNome,
  geradoEm,
  checks,
}: {
  grade: Grade
  paletaSlug: string
  titulo: string | null
  cronogramaNome: string
  alunoNome: string | null
  geradoEm: string
  checks?: Record<string, string>
}) {
  const paleta = acharPaleta(paletaSlug)
  const r = grade.resumo
  const feitas = grade.semanas.reduce(
    (n, s) => n + (s.kind === 'conteudo' ? s.metas.filter((m) => checks?.[m.id]).length : 0),
    0,
  )

  return (
    <div className="folha">
      <style>{`
        /* A folha existe só aqui: o resto da plataforma não deve herdar regra de impressão. */
        .folha { max-width: 190mm; margin: 0 auto; padding: 8mm; color: #18181b; background: #fff; font-size: 10.5pt; }
        .folha table { width: 100%; border-collapse: collapse; }
        .folha th, .folha td { padding: 3px 6px; text-align: left; vertical-align: top; }
        .folha thead th { font-size: 8pt; text-transform: uppercase; letter-spacing: .04em; color: #52525b; border-bottom: 1px solid #d4d4d8; }
        .folha tbody tr { border-bottom: 1px solid #ececef; }
        .semana { break-inside: avoid; page-break-inside: avoid; margin-top: 10px; }
        .faixa { color: #fff; padding: 4px 8px; font-weight: 600; font-size: 10pt; border-radius: 3px;
                 -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .caixa { display: inline-block; width: 9px; height: 9px; border: 1px solid #71717a; border-radius: 2px; }
        .caixa.feita { background: #18181b; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        @media print {
          .folha { padding: 0; max-width: none; }
          @page { margin: 12mm 10mm; }
        }
      `}</style>

      {/* ── Cabeçalho */}
      <div style={{ borderBottom: `3px solid ${paleta.primaria}`, paddingBottom: 8, marginBottom: 10 }}>
        <h1 style={{ margin: 0, fontSize: '16pt', fontWeight: 700, color: paleta.primaria }}>
          {titulo || cronogramaNome}
        </h1>
        <p style={{ margin: '2px 0 0', fontSize: '9.5pt', color: '#52525b' }}>
          {titulo && `${cronogramaNome} · `}
          {alunoNome && `${alunoNome} · `}
          gerado em {new Date(geradoEm).toLocaleDateString('pt-BR')}
        </p>
        <p style={{ margin: '2px 0 0', fontSize: '9.5pt', color: '#52525b' }}>{r.subtitulo}</p>
      </div>

      {/* ── Números do topo */}
      <table style={{ marginBottom: 6 }}>
        <tbody>
          <tr style={{ border: 'none' }}>
            {(
              [
                ['Semanas', String(r.totalSemanas)],
                ['Dias por semana', String(r.diasPorSemana)],
                ['Atividades', r.atividades.toLocaleString('pt-BR')],
                ['Conclusão', r.conclusao ? fmtBr(r.conclusao) : '—'],
                ...(checks ? ([['Concluídas', `${feitas.toLocaleString('pt-BR')} de ${r.atividades.toLocaleString('pt-BR')}`]] as [string, string][]) : []),
              ] as [string, string][]
            ).map(([rotulo, valor]) => (
              <td key={rotulo} style={{ border: '1px solid #e4e4e7', borderRadius: 3, padding: '5px 8px' }}>
                <div style={{ fontSize: '12pt', fontWeight: 700 }}>{valor}</div>
                <div style={{ fontSize: '7.5pt', textTransform: 'uppercase', letterSpacing: '.06em', color: '#71717a' }}>
                  {rotulo}
                </div>
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      {/* ── Semana a semana */}
      {grade.semanas.map((s) => {
        const total = s.kind === 'conteudo' ? somarDuracoes(s.metas.map((m) => m.duracao)) : null
        return (
          <div key={s.numero} className="semana">
            <div
              className="faixa"
              style={{ background: s.kind === 'conteudo' ? paleta.primaria : paleta.revisao }}
            >
              Semana {s.numero} — {fmtIntervalo(s.inicio, s.fim)}
              {s.kind === 'revisao' && ' · Revisão'}
              {s.kind === 'recesso' && ' · Recesso'}
              {s.kind === 'conteudo' && (
                <span style={{ float: 'right', fontWeight: 400, opacity: 0.9 }}>
                  {s.metas.length} tarefa{s.metas.length > 1 ? 's' : ''}
                  {total && ` · ${fmtFaixa(total)}`}
                </span>
              )}
            </div>

            {s.kind === 'recesso' && (
              <p style={{ margin: '5px 2px', fontSize: '9.5pt', color: '#52525b' }}>
                Sem metas programadas. O cronograma é retomado na próxima segunda-feira.
              </p>
            )}

            {s.kind === 'revisao' &&
              s.blocos.map((b) => (
                <p key={b.titulo} style={{ margin: '5px 2px', fontSize: '9.5pt' }}>
                  <strong>{b.titulo}</strong> — <span style={{ color: '#52525b' }}>{b.texto}</span>
                </p>
              ))}

            {s.kind === 'conteudo' && (
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '5%' }} />
                    <th style={{ width: '14%' }}>Data</th>
                    <th style={{ width: '20%' }}>Tipo</th>
                    <th>Conteúdo</th>
                    <th style={{ width: '14%' }}>Duração</th>
                  </tr>
                </thead>
                <tbody>
                  {s.metas.map((m) => {
                    const feita = !!checks?.[m.id]
                    return (
                      <tr key={m.id} style={{ background: paleta.celula, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                        <td>
                          <span className={`caixa${feita ? ' feita' : ''}`} />
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {fmtBr(m.data)}
                          <div style={{ fontSize: '8pt', color: '#71717a' }}>{m.diaNome}</div>
                        </td>
                        <td style={{ fontSize: '9pt' }}>{m.tipoDef.nome}</td>
                        <td>
                          <div style={feita ? { textDecoration: 'line-through', color: '#71717a' } : undefined}>
                            {m.titulo}
                          </div>
                          {m.complemento && (
                            <div style={{ fontSize: '8.5pt', color: '#52525b' }}>{m.complemento}</div>
                          )}
                          {/* Links viram texto: num papel, uma URL clicável não serve para nada. */}
                          {m.links && m.links.urls.length > 0 && (
                            <div style={{ fontSize: '8pt', color: '#71717a' }}>
                              {m.links.urls.map((u) => u.plataforma.nome).join(' · ')}
                            </div>
                          )}
                        </td>
                        <td style={{ whiteSpace: 'nowrap', fontSize: '9pt' }}>{m.duracao ?? ''}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )
      })}

      <p style={{ marginTop: 14, fontSize: '8pt', color: '#a1a1aa', textAlign: 'center' }}>
        {cronogramaNome} · {r.subtitulo} · impresso em {new Date().toLocaleDateString('pt-BR')}
      </p>
    </div>
  )
}
