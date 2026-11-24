// Shell do Estúdio de Conteúdo. As abas da área NÃO ficam aqui: cada tela de topo renderiza
// <EstudioHeader> (título + ações) com as abas ABAIXO do título, como no designer.
// O escopo visual (`.estudio-scope`: fonte + tokens + fundo do designer) agora vem do <main> de
// app/admin/layout.tsx para o admin inteiro (lib/admin/escopo-visual.ts); aqui só garantimos largura cheia.
export default function ConteudosLayout({ children }: { children: React.ReactNode }) {
  return <div className="w-full">{children}</div>
}
