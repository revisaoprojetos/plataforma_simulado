// Sub-shell de "Materiais". As sub-abas (Aulas · Biblioteca · Banco · Arquivos) NÃO ficam aqui:
// cada sub-página renderiza <EstudioHeader ... subtabs={<MateriaisTabs/>} /> (título acima das abas).
export default function MateriaisLayout({ children }: { children: React.ReactNode }) {
  return <div className="w-full">{children}</div>
}
