// Re-montado a cada navegação no portal do aluno → dispara a entrada em cascata (riseIn) das
// seções de topo da página (page-stagger ancora `.page-stagger > * > *`).
export default function AlunoTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-stagger">{children}</div>
}
