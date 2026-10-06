'use client'

// SIMULADO — MEQ (spec 06, coluna MEQ). Fase 5 do redesign: telas PRESENTACIONAIS
// sobre dados MOCK, prévia em /simulado/preview. Produção/motor de prova intactos.
//
// Entrada  → caderno de prova oficial (tabela + estados es + modais ini/ret)
// Prova    → Certo/Errado (Cebraspe), timer regressivo 3h30, folha, navegador, modais
// Resultado→ boletim técnico/dashboard (gauge + ritmo + NPS + tabela + gráfico + correção)
//
// 3 temas (claro | azul | escuro). Fonte Sora injetada localmente. bgfx MEQ (orbs +
// circuitos) renderizado uma vez por tela.

import type { SimScreenProps, Tela } from './types'
import { Entrada } from './meq/entrada'
import { Prova } from './meq/prova'
import { Resultado } from './meq/resultado'

export function SimuladoMEQ({ tela, theme, data, preview, es, mo, real }: SimScreenProps & { tela: Tela }) {
  // `preview`: mock-only, transições locais, sem rede/navegação (já é o padrão das telas).
  void preview
  switch (tela) {
    case 'entrada':
      return <Entrada theme={theme} data={data} es={es} mo={mo} real={real} />
    case 'prova':
      return <Prova theme={theme} data={data} mo={mo} />
    case 'resultado':
      return <Resultado theme={theme} data={data} />
    default:
      return <Entrada theme={theme} data={data} es={es} mo={mo} real={real} />
  }
}
