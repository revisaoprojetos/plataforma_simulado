// Re-montado a cada navegação no /admin → anima a entrada de cada tela.
export default function AdminTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-page">{children}</div>
}
