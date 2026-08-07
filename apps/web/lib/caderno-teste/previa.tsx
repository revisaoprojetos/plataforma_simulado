// Prévia A4 ao vivo do construtor de teste. Componente puro (sem estado): recebe o builder e as
// questões e desenha a folha conforme modalidade + modelo + ajustes. Renderizado no painel direito.

import type { ItemCaderno, PreviewQuestao } from './tipos'

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

  return (
    <div style={{ width: A4_W, minHeight: 1123, background: '#fff', color: '#1a202c', boxShadow: '0 2px 20px rgba(0,0,0,.14)', padding: a.compacto ? 40 : 56, fontFamily: 'Inter, system-ui, sans-serif', boxSizing: 'border-box' }}>
      {a.mostrarCabecalho && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: a.compacto ? 20 : 26, fontWeight: 800, color: a.corPrimaria, letterSpacing: 0.3 }}>{a.titulo || 'Simulado'}</div>
          <div style={{ height: 3, background: a.corSecundaria, borderRadius: 2, marginTop: 6, width: 120 }} />
        </div>
      )}

      {a.mostrarDadosAluno && (
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
        const total = qs.length || 20
        const acertos = Math.round(total * 0.7)
        const pct = Math.round((acertos / total) * 100)
        const materias = [
          { nome: 'Direito Administrativo', ac: 6, tt: 8 },
          { nome: 'Direito Constitucional', ac: 5, tt: 7 },
          { nome: 'Português', ac: 3, tt: 5 },
        ]
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'stretch', border: `1px solid ${a.corPrimaria}33`, borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ background: a.corPrimaria, color: '#fff', padding: '14px 22px', display: 'flex', alignItems: 'baseline', gap: 2 }}>
                <span style={{ fontSize: 34, fontWeight: 800, lineHeight: 1 }}>{acertos}</span>
                <span style={{ fontSize: 18, fontWeight: 700 }}>/{total}</span>
              </div>
              <div style={{ background: a.corSecundaria, color: '#3b2f00', padding: '14px 18px', flex: 1, display: 'flex', alignItems: 'center', fontSize: 13, fontWeight: 600 }}>
                {acertos} acertos de {total} questões — {pct}% de aproveitamento
              </div>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: a.corPrimaria, marginBottom: 8 }}>Desempenho por matéria</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {materias.map((m) => { const p = Math.round((m.ac / m.tt) * 100); return (
                  <div key={m.nome}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}><span>{m.nome}</span><span style={{ fontWeight: 700 }}>{m.ac}/{m.tt} · {p}%</span></div>
                    <div style={{ height: 8, background: '#eef1f5', borderRadius: 4, overflow: 'hidden' }}><div style={{ width: `${p}%`, height: '100%', background: a.corSecundaria }} /></div>
                  </div>
                ) })}
              </div>
            </div>
            {usandoExemplo && <div style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>Prévia com dados de exemplo — vincule um banco para ver os números reais.</div>}
          </div>
        )
      })()}

      {usandoExemplo && item.modalidade === 'caderno_questoes' && (
        <div style={{ marginTop: 20, fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>Prévia com questões de exemplo — selecione um banco à esquerda para usar as questões reais.</div>
      )}
    </div>
  )
}
