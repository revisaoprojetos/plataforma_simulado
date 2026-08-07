// Prévia A4 ao vivo do construtor de teste. Componente puro (sem estado): recebe o builder e as
// questões e desenha a folha conforme modalidade + modelo + ajustes. Renderizado no painel direito.

import type { ItemCaderno, PreviewQuestao } from './tipos'
import { DIAG_PADRAO } from './diagnostico'

const A4_W = 794 // 210mm @96dpi
const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F']

const QUESTOES_EXEMPLO: PreviewQuestao[] = [
  { id: 'ex1', numero: 1, tipo: 'objetiva', enunciado: 'Exemplo: assinale a alternativa correta sobre o princípio da legalidade na Administração Pública.', alternativas: [
    { letra: 'A', texto: 'O administrador pode fazer tudo que a lei não proíbe.', correta: false, comentario: '' },
    { letra: 'B', texto: 'O administrador só pode fazer o que a lei autoriza.', correta: true, comentario: 'A legalidade estrita rege a Administração (art. 37, CF).' },
    { letra: 'C', texto: 'A legalidade não se aplica aos atos discricionários.', correta: false, comentario: '' },
    { letra: 'D', texto: 'A moralidade substitui a legalidade.', correta: false, comentario: '' },
    { letra: 'E', texto: 'Nenhuma das anteriores.', correta: false, comentario: '' },
  ] },
  { id: 'ex2', numero: 2, tipo: 'objetiva', enunciado: 'Exemplo: sobre controle de constitucionalidade, é correto afirmar que…', alternativas: [
    { letra: 'A', texto: 'O controle difuso é exercido apenas pelo STF.', correta: false, comentario: '' },
    { letra: 'B', texto: 'O controle concentrado pode ser feito por qualquer juiz.', correta: false, comentario: '' },
    { letra: 'C', texto: 'A ADI é instrumento do controle concentrado.', correta: true, comentario: 'A ADI é julgada originariamente pelo STF.' },
    { letra: 'D', texto: 'Não existe controle preventivo no Brasil.', correta: false, comentario: '' },
    { letra: 'E', texto: 'O efeito é sempre inter partes.', correta: false, comentario: '' },
  ] },
]

export function Previa({ item, questoes }: { item: ItemCaderno; questoes: PreviewQuestao[] }) {
  const a = item.ajustes
  const qs = questoes.length ? questoes : QUESTOES_EXEMPLO
  const usandoExemplo = questoes.length === 0
  const base = a.compacto ? 10 : 12
  const gap = a.compacto ? 10 : 16
  const pad = a.compacto ? 40 : 56

  return (
    <div style={{ width: A4_W, minHeight: 1123, background: '#fff', color: '#1a202c', boxShadow: '0 2px 20px rgba(0,0,0,.14)', fontFamily: 'Inter, system-ui, sans-serif', boxSizing: 'border-box', position: 'relative', overflow: 'hidden' }}>
      {a.folhaUrl && <img src={a.folhaUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
      <div style={{ position: 'relative', zIndex: 1 }}>
        {a.capaUrl && <img src={a.capaUrl} alt="" style={{ display: 'block', width: '100%' }} />}
        <div style={{ padding: pad }}>
      {a.mostrarCabecalho && item.modalidade !== 'diagnostico' && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: a.compacto ? 20 : 26, fontWeight: 800, color: a.corPrimaria, letterSpacing: 0.3 }}>{a.titulo || 'Simulado'}</div>
          <div style={{ height: 3, background: a.corSecundaria, borderRadius: 2, marginTop: 6, width: 120 }} />
        </div>
      )}

      {a.mostrarDadosAluno && item.modalidade !== 'diagnostico' && (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 0, border: `1px solid ${a.corPrimaria}33`, borderRadius: 8, overflow: 'hidden', marginBottom: 18 }}>
          {[['Nome', 'João da Silva'], ['CPF', '000.000.000-00'], ['Data', '__/__/____']].map(([r, v], i) => (
            <div key={r} style={{ padding: '8px 12px', borderLeft: i ? `1px solid ${a.corPrimaria}22` : 'none' }}>
              <div style={{ fontSize: 8.5, textTransform: 'uppercase', letterSpacing: 0.5, color: '#94a3b8' }}>{r}</div>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{v}</div>
            </div>
          ))}
        </div>
      )}

      {item.modalidade === 'caderno_questoes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap }}>
          {qs.map((q) => (
            <div key={q.id} style={{ breakInside: 'avoid' }}>
              <div style={{ fontSize: base + 1, lineHeight: 1.5, marginBottom: 6 }}><strong>{q.numero}.</strong> {q.enunciado}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: a.compacto ? 2 : 4, marginLeft: 14 }}>
                {q.alternativas.slice(0, a.numAlternativas).map((alt) => {
                  const marcaGab = a.mostrarGabarito && alt.correta
                  return (
                    <div key={alt.letra} style={{ fontSize: base, lineHeight: 1.45, fontWeight: marcaGab ? 700 : 400, color: marcaGab ? a.corPrimaria : '#1a202c' }}>
                      {marcaGab ? '☑' : '○'} {alt.letra}) {alt.texto}
                    </div>
                  )
                })}
              </div>
              {a.mostrarComentarios && (q.alternativas.find((x) => x.correta)?.comentario) && (
                <div style={{ marginTop: 6, marginLeft: 14, padding: '6px 10px', background: `${a.corPrimaria}0d`, border: `1px solid ${a.corPrimaria}33`, borderRadius: 6, fontSize: base - 1, color: '#334155' }}>
                  <strong style={{ color: a.corPrimaria }}>Comentário:</strong> {q.alternativas.find((x) => x.correta)?.comentario}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {item.modalidade === 'folha_respostas' && (() => {
        const total = qs.length || 20
        const cols = Math.max(1, Math.min(6, a.colunas))
        const porCol = Math.ceil(total / cols)
        const colunas: number[][] = Array.from({ length: cols }, (_, c) => Array.from({ length: porCol }, (_, r) => c * porCol + r + 1).filter((n) => n <= total))
        return (
          <div style={{ display: 'flex', gap: 18 }}>
            {colunas.map((nums, ci) => (
              <div key={ci} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: a.compacto ? 4 : 7 }}>
                {nums.map((n) => (
                  <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 22, fontSize: base - 1, fontWeight: 700, color: '#64748b', textAlign: 'right' }}>{String(n).padStart(2, '0')}</span>
                    {LETRAS.slice(0, a.numAlternativas).map((l) => (
                      <span key={l} style={{ width: 18, height: 18, borderRadius: '50%', border: `1.5px solid ${a.corPrimaria}88`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: `${a.corPrimaria}cc`, fontWeight: 600 }}>{l}</span>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )
      })()}

      {item.modalidade === 'diagnostico' && (() => {
        const c = item.conteudo ?? DIAG_PADRAO
        const prim = a.corPrimaria
        const amar = a.corSecundaria
        const SecHeader = ({ t }: { t: string }) => <div style={{ background: prim, color: '#fff', fontWeight: 700, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', padding: '6px 12px', borderRadius: 2, margin: '16px 0 10px' }}>{t}</div>
        return (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {a.mostrarCabecalho && (
              <div style={{ background: prim, color: '#fff', padding: '12px 16px', borderRadius: 6, marginBottom: 12 }}>
                <div style={{ fontSize: 20, fontWeight: 800 }}>{a.titulo || 'Diagnóstico de Desempenho'}</div>
                {c.subtitulo && <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>{c.subtitulo}</div>}
              </div>
            )}
            {a.mostrarDadosAluno && (
              <div style={{ display: 'flex', border: `1px solid ${prim}`, borderRadius: 6, overflow: 'hidden', marginBottom: 12 }}>
                <div style={{ background: prim, color: '#fff', fontWeight: 800, fontSize: 14, padding: '8px 14px' }}>NOME:</div>
                <div style={{ background: amar, color: '#3b2f00', flex: 1, padding: '8px 14px', fontSize: 12, fontWeight: 600 }}>[NOME COMPLETO ALUNO]</div>
              </div>
            )}
            <div style={{ display: 'flex', border: `1px solid ${prim}33`, borderRadius: 6, overflow: 'hidden', marginBottom: 12 }}>
              <div style={{ background: '#9b6800', color: '#fff', padding: '10px 20px', display: 'flex', alignItems: 'baseline' }}>
                <span style={{ fontSize: 32, fontWeight: 800 }}>X</span><span style={{ fontSize: 16, fontWeight: 700 }}>/{c.notaTotal}</span>
              </div>
              <div style={{ background: amar, color: '#3b2f00', flex: 1, display: 'flex', alignItems: 'center', padding: '10px 16px', fontSize: 12, fontWeight: 600 }}>{c.notaTexto}</div>
            </div>
            {c.intro.map((p, i) => <p key={i} style={{ fontSize: base, lineHeight: 1.5, textAlign: 'justify', margin: '0 0 8px' }}>{p}</p>)}

            {c.pilares.length > 0 && <><SecHeader t="Desempenho por pilar" />
              <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
                {c.pilares.map((pl, i) => (
                  <div key={i} style={{ flex: 1, minWidth: 0, background: '#fff2cc', border: `1px solid ${prim}22`, borderRadius: 4, padding: 10 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: prim, letterSpacing: 0.5 }}>{pl.nome}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: prim, lineHeight: 1.1 }}>X%</div>
                    <div style={{ fontSize: 9, color: '#5a5570', marginBottom: 6 }}>{pl.totalTxt}</div>
                    {pl.bandas.map((b, j) => (
                      <div key={j} style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: prim }}>{b.faixa}</div>
                        {b.texto && <div style={{ fontSize: 8.5, color: '#243b53', lineHeight: 1.4, textAlign: 'justify' }}>{b.texto}</div>}
                      </div>
                    ))}
                  </div>
                ))}
              </div></>}

            {c.disciplinas.length > 0 && <><SecHeader t="Desempenho por disciplina" />
              {c.disciplinasIntro && <p style={{ fontSize: base - 1, color: '#5a5570', margin: '0 0 8px', lineHeight: 1.4 }}>{c.disciplinasIntro}</p>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {c.disciplinas.map((d, i) => (
                  <div key={i} style={{ background: '#f5f3ff', borderTop: `2px solid ${amar}`, padding: '6px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                    <div style={{ minWidth: 0 }}><div style={{ fontSize: 11, fontWeight: 700, color: prim }}>{d.nome}</div><div style={{ fontSize: 9, color: '#5a5570', fontStyle: 'italic' }}>- Categoria: {d.categoria}</div></div>
                    <div style={{ fontSize: 11, whiteSpace: 'nowrap' }}><span style={{ color: '#9590b0' }}>{d.total}</span> <span style={{ fontWeight: 800, color: '#9a6e00' }}>x%</span></div>
                  </div>
                ))}
              </div></>}

            {c.sugestoes.length > 0 && <><SecHeader t="Sugestões de estudo" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {c.sugestoes.map((s, i) => (
                  <div key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fdf3d0', padding: '5px 12px' }}>
                      <span style={{ fontWeight: 800, fontSize: 11, color: '#9a6e00' }}>{s.titulo}</span>
                      {s.prioridade && <span style={{ fontWeight: 700, fontSize: 9, color: '#9a6e00' }}>[!] {s.prioridade}</span>}
                    </div>
                    <div style={{ background: '#f0eeff', padding: '8px 12px' }}>
                      {s.intro && <p style={{ fontSize: base - 1, margin: '0 0 6px', lineHeight: 1.4, textAlign: 'justify' }}>{s.intro}</p>}
                      {s.itens.map((it, j) => (
                        <div key={j} style={{ fontSize: base - 1, lineHeight: 1.4, marginBottom: 2, display: 'flex', gap: 5 }}>
                          <span style={{ fontWeight: 700, color: it.forte ? '#e8850c' : '#3b5bdb' }}>{it.forte ? '>>' : '>'}</span><span>{it.texto}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div></>}

            {(c.gabaritoObs.length > 0 || c.gabaritoIntro.length > 0) && <><SecHeader t={c.gabaritoTitulo || 'Gabarito oficial desatualizado'} />
              {c.gabaritoIntro.map((p, i) => <p key={i} style={{ fontSize: base - 1, margin: '0 0 6px', lineHeight: 1.4, textAlign: 'justify' }}>{p}</p>)}
              {c.gabaritoObs.length > 0 && <div style={{ background: '#f5f3ff', borderTop: '2px solid #a32d2d', padding: '8px 12px' }}>{c.gabaritoObs.map((o, i) => <div key={i} style={{ fontSize: 9, color: '#5a5570' }}>{o}</div>)}</div>}</>}
          </div>
        )
      })()}

      {usandoExemplo && item.modalidade === 'caderno_questoes' && (
        <div style={{ marginTop: 20, fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>Prévia com questões de exemplo — selecione um banco à esquerda para usar as questões reais.</div>
      )}
        </div>
      </div>
    </div>
  )
}
