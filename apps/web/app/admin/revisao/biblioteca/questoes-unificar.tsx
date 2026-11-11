'use client'

import { useEffect, useRef, useState } from 'react'
import type { EstadoQ } from '@/lib/admin-revisao/biblioteca-questoes-tipos'
import type { TipoTaxG } from '@/lib/admin-revisao/biblioteca-questoes-gestao-tipos'
import { AbasSublinhado } from './gestao-ui'
import { UnificarDuplicadas } from './unificar-duplicadas'
import type { InicialUnificar } from '@/lib/admin-revisao/questoes-unificar-tipos'
import type { InicialTermos } from '@/lib/admin-revisao/questoes-termos-tipos'
import { UnificarTermos } from './unificar-termos'

type Secao = 'duplicadas' | 'termos'

/** Sub-aba UNIFICAR da Biblioteca › Questões. Raiz com as duas frentes em abas de sublinhado:
 *  (1) Questões duplicadas — `UnificarDuplicadas` (detecção no servidor, revisão lado a lado, prévia de impacto, desfazer);
 *  (2) Termos da taxonomia — `UnificarTermos`. Props além de `podeEditar` são opcionais (compatibilidade com o shell). */
/** `inicial` = dados do SSR (carregarInicialUnificar / carregarInicialTermos): a seção ativa renderiza na hora, sem chamada no load. */
export interface InicialQuestoesUnificar { duplicadas?: InicialUnificar | null; termos?: InicialTermos | null }
export function QuestoesUnificar({ podeEditar, idsManuais, termoInicial, secaoInicial, onAbrirBanco, inicial }: {
  inicial?: InicialQuestoesUnificar | null; podeEditar: boolean; idsManuais?: string[] | null; termoInicial?: { tipo: TipoTaxG; q: string } | null; secaoInicial?: Secao; onAbrirBanco?: (e: Partial<EstadoQ>) => void
}) {
  const [secao, setSecao] = useState<Secao>(secaoInicial ?? (termoInicial ? 'termos' : 'duplicadas'))
  const virgem = useRef(true) // o SSR só vale para a 1ª montagem (depois de trocar de seção/mutar, o dado seria velho)
  const [nDup, setNDup] = useState<number | undefined>(inicial?.duplicadas?.grupos.resumo.grupos)
  useEffect(() => { if (secaoInicial) setSecao(secaoInicial) }, [secaoInicial])
  useEffect(() => { if (termoInicial) setSecao('termos') }, [termoInicial])
  return (
    <div>
      <AbasSublinhado<Secao> rotulo="Tipo de unificação" valor={secao} onChange={(v) => { virgem.current = false; setSecao(v) }}
        abas={[{ id: 'duplicadas', nome: 'Questões duplicadas', n: nDup }, { id: 'termos', nome: 'Termos da taxonomia' }]} />
      <div className="mt-3">
        {secao === 'duplicadas'
          ? <UnificarDuplicadas podeEditar={podeEditar} idsManuais={idsManuais} onAbrirBanco={onAbrirBanco} onTotal={setNDup} inicial={virgem.current ? inicial?.duplicadas : null} />
          : <UnificarTermos podeEditar={podeEditar} inicial={virgem.current ? inicial?.termos : null} />}
      </div>
    </div>
  )
}
