import './estudio.css'

// Shell do Estúdio de Conteúdo. As abas da área NÃO ficam aqui: cada tela de topo renderiza
// <EstudioHeader> (título + ações) com as abas ABAIXO do título, como no designer.
// `.estudio-scope` aplica o design-system do designer (fonte Plus Jakarta Sans + tokens) só aqui;
// o `-m-6 p-6` neutraliza o padding do <main> do admin pra o fundo do designer preencher a área.
export default function ConteudosLayout({ children }: { children: React.ReactNode }) {
  return <div className="estudio-scope -m-6 min-h-screen w-auto p-4 sm:p-6">{children}</div>
}
