import './nova.css'

// As telas da NOVA área do aluno rodam DENTRO do shell real do portal (ShellRevisaoNova, do layout pai
// em app/aluno/(portal)/layout.tsx). Este layout NÃO desenha shell nenhum — só injeta os tokens da nova
// área (escopados em .novaplat; claro/escuro seguem o tema do portal) e o container do conteúdo:
// coluna com gap + gutter, em LARGURA CHEIA (sem max-width/centralização → sem faixas laterais).
export default function NovaLayout({ children }: { children: React.ReactNode }) {
  return <div className="novaplat np-conteudo">{children}</div>
}
