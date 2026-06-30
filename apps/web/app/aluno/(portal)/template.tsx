// Re-montado a cada navegação no portal do aluno → anima a entrada de cada tela.
export default function AlunoTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-page">{children}</div>
}
