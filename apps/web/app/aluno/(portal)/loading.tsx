/** Fallback de Suspense do portal do aluno: uma LINHA DE CARREGAMENTO deslizante (aparece na hora ao
 *  navegar) + esqueleto leve. Evita a sensação de tela presa/branca nas áreas mais pesadas (ex.: Meu
 *  Desempenho, Painel), que demoram a renderizar no servidor. Puro CSS — funciona em tema claro e escuro. */
export default function Loading() {
  const bloco = { background: 'color-mix(in oklab, currentColor 12%, transparent)', borderRadius: 12 } as const
  return (
    <div aria-hidden style={{ width: '100%', color: 'var(--muted, var(--pn-8a86a0,#8a86a0))' }}>
      <style>{`@keyframes alpmove{0%{transform:translateX(-120%)}100%{transform:translateX(280%)}}@keyframes alppulse{0%,100%{opacity:.55}50%{opacity:.9}}`}</style>
      {/* Linha de carregamento (indeterminada) deslizando pro lado, tipo nprogress. */}
      <div style={{ position: 'relative', height: 3, width: '100%', overflow: 'hidden', background: 'color-mix(in oklab, var(--brand, var(--pn-8f75ff,#8F75FF)) 14%, transparent)' }}>
        <span style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: '45%', borderRadius: 4, background: 'linear-gradient(90deg,transparent,var(--gold,var(--pn-f1c232,#F1C232)),var(--brand,var(--pn-8f75ff,#8F75FF)),transparent)', boxShadow: '0 0 12px 2px color-mix(in oklab, var(--gold,var(--pn-f1c232,#F1C232)) 55%, transparent)', animation: 'alpmove 1.1s cubic-bezier(.45,0,.35,1) infinite' }} />
      </div>
      {/* Esqueleto leve (cor via currentColor → adapta ao tema). */}
      <div style={{ padding: '24px 20px', maxWidth: 1040, margin: '0 auto', animation: 'alppulse 1.4s ease-in-out infinite' }}>
        <div style={{ ...bloco, height: 30, width: 220, marginBottom: 14 }} />
        <div style={{ ...bloco, height: 14, width: 340, maxWidth: '90%', marginBottom: 24 }} />
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ ...bloco, height: 150 }} />
          ))}
        </div>
      </div>
    </div>
  )
}
