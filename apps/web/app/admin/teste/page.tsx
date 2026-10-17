import { TesteEditoresClient } from './teste-client'

export const dynamic = 'force-dynamic'

// SPIKE (super-admin): área isolada pra testar os editores Office reais (Collabora / OnlyOffice) com .docx
// nativo — avaliar a migração do construtor de caderno. Não afeta o resto do sistema.
export default function TestePage() {
  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Teste · Editores Office</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Área de spike para avaliar um editor <b>Word/LibreOffice de verdade</b> dentro do sistema (docx nativo),
          no lugar do construtor de blocos HTML. Crie um documento e abra no editor — o cabeçalho/rodapé/paginação
          são nativos da engine. Requer os serviços locais rodando (ver instruções abaixo).
        </p>
      </div>
      <TesteEditoresClient />
    </div>
  )
}
