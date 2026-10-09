// Fallback de carregamento NEUTRO (sem marca). No 1º load/refresh ainda não dá pra saber a marca do
// TOKEN, então NÃO resolvemos marca pelo host — em localhost/subdomínio (ex.: meq.localhost) o host
// caía no padrão e PISCAVA o visual do Revisão (R roxo) num simulado do MEQ. A entrada/runner branded
// corretos aparecem logo em seguida, já com a marca certa do token.
export default function Loading() {
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: 'linear-gradient(150deg,#12141c,#181b26,#1e2230)' }}
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid rgba(255,255,255,.16)', borderTopColor: 'rgba(255,255,255,.72)', animation: 'simloadspin .8s linear infinite' }} />
      <style>{`@keyframes simloadspin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
