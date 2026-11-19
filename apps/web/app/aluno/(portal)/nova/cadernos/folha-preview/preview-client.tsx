'use client'
import { useState } from 'react'
import { FolhaLivre } from '@/components/aluno/notebook/folha-livre/folha-livre'
import { criarFolhaVazia, serializarFolha, tamanhoBytes, type Folha } from '@/lib/aluno/notebook-folha'

export function PreviewClient() {
  const [folha, setFolha] = useState<Folha>(() => criarFolhaVazia())
  const bytes = tamanhoBytes(serializarFolha(folha))
  return (
    <>
      <div style={{ height: '78vh' }}>
        <FolhaLivre valor={folha} onChange={setFolha} />
      </div>
      <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: '6px 0 0' }}>
        {folha.tracos.length} traços · {folha.caixas.length} caixas · {(bytes / 1024).toFixed(1)} KB de 1024 KB
      </p>
    </>
  )
}
