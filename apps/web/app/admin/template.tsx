// Re-montado a cada navegação no /admin → dispara a entrada em cascata (riseIn) das SEÇÕES
// de topo da página. page-stagger ancora o escalonamento em `.page-stagger > * > *` (as seções,
// netas deste wrapper: template → raiz da página → seções).
export default function AdminTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-stagger">{children}</div>
}
