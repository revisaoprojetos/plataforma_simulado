'use client'

import { useState } from 'react'
import type { DisciplinaClass, PastaConteudo } from './disciplinas-actions-tipos'
import type { InicialClassificacao } from '@/lib/admin-revisao/questoes-classificacao-tipos'
import { AbasSublinhado } from '../revisao/biblioteca/gestao-ui'
import { QuestoesClassificacao } from '../revisao/biblioteca/questoes-classificacao'
import { DisciplinasClassificacao } from '@/components/admin/disciplinas-classificacao'

type Secao = 'qualidade' | 'disciplinas'

/** Aba CLASSIFICAÇÃO de /admin/questoes: o MESMO `QuestoesClassificacao` da Biblioteca (qualidade, fila, cadastro da taxonomia)
 *  + a seção "Cor, ordem e pastas" que preserva o que só existia na tela antiga (classificação/cor/ordem da disciplina e vínculo pasta→disciplina). */
export function ClassificacaoUnificada({ podeEditar, podeTaxonomia, inicial, disciplinas, pastas }: {
  podeEditar: boolean; podeTaxonomia: boolean; inicial?: InicialClassificacao
  disciplinas: DisciplinaClass[]; pastas: PastaConteudo[]
}) {
  const [secao, setSecao] = useState<Secao>('qualidade')
  return (
    <div>
      <AbasSublinhado<Secao> rotulo="Classificação" valor={secao} onChange={setSecao}
        abas={[{ id: 'qualidade', nome: 'Qualidade e cadastro' }, { id: 'disciplinas', nome: 'Cor, ordem e pastas das disciplinas' }]} />
      <div className="mt-3">
        {secao === 'qualidade'
          ? <QuestoesClassificacao podeEditar={podeEditar} podeTaxonomia={podeTaxonomia} inicial={inicial} />
          : <DisciplinasClassificacao itens={disciplinas} pastas={pastas} />}
      </div>
    </div>
  )
}
