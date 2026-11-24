import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SETORES } from './setores'

// GUARDA DE POSIÇÃO: a barra de abas do setor NÃO fica no topo do <main>; ela é um <BarraSetorSlot /> dentro do
// cabeçalho da página (abaixo do título/descrição, acima das abas próprias). Toda rota de cluster com 2+ itens
// (as únicas em que a barra aparece) precisa mapear aqui o arquivo que posiciona o slot — direto ou via cabeçalho
// compartilhado (RevisaoHead/RevisaoAbas/EstudioHeader, que já contêm o slot).
const RAIZ = resolve(__dirname, '../..')
const A = 'app/admin/'

const MAPA: Record<string, string[]> = {
  '/admin': [A + 'page.tsx'],
  '/admin/revisao/inicio': [A + 'revisao/inicio/page.tsx'],
  '/admin/biblioteca': [A + 'biblioteca/biblioteca-client.tsx'],
  '/admin/revisao/biblioteca': [A + 'revisao/biblioteca/biblioteca-app.tsx'],
  '/admin/leitura/biblioteca': [A + 'leitura/biblioteca/page.tsx'],
  '/admin/revisao/jurisclub': [A + 'revisao/jurisclub/page.tsx'],
  '/admin/leitura': [A + 'leitura/page.tsx'],
  '/admin/leitura/analise': [A + 'leitura/analise/page.tsx'],
  '/admin/jurisprudencia': [A + 'jurisprudencia/page.tsx'],
  '/admin/conteudos/produtos': [A + 'conteudos/produtos/produtos-estudio-client.tsx'],
  '/admin/produtos': [A + 'produtos/produtos-client.tsx'],
  '/admin/revisao/cursos': [A + 'revisao/cursos/page.tsx'],
  '/admin/cronogramas': [A + 'cronogramas/cronogramas-client.tsx'],
  '/admin/cronogramas/relatorios': [A + 'cronogramas/relatorios/page.tsx'],
  '/admin/cronogramas/importar': [A + 'cronogramas/importar/page.tsx'],
  '/admin/revisao/cronograma': [A + 'revisao/cronograma/page.tsx'],
  '/admin/cronogramas/adaptativo': [A + 'cronogramas/adaptativo/page.tsx'],
  '/admin/cronogramas/lei-seca': [A + 'cronogramas/lei-seca/page.tsx'],
  '/admin/questoes': [A + 'questoes/page.tsx'],
  '/admin/modelos-caderno': [A + 'modelos-caderno/page.tsx'],
  '/admin/simulados': [A + 'simulados/page.tsx'],
  '/admin/revisao/simulados': [A + 'revisao/simulados/page.tsx'],
  '/admin/correcao': [A + 'correcao/page.tsx'],
  '/admin/estudantes': [A + 'estudantes/page.tsx'],
  '/admin/revisao/membros': [A + 'revisao/membros/membros-topo.tsx'],
  '/admin/impersonation': ['components/admin/impersonation/impersonation-console.tsx'],
  '/admin/grupos': ['components/admin/grupos-client.tsx'],
  '/admin/revisao/grupos': [A + 'revisao/grupos/grupos-cliente.tsx'],
  '/admin/revisao/calendario': [A + 'revisao/calendario/page.tsx'],
  '/admin/revisao/campanhas': [A + 'revisao/campanhas/page.tsx'],
  '/admin/revisao/avisos': [A + 'revisao/avisos/avisos-cliente.tsx'],
  '/admin/comentarios': [A + 'comentarios/page.tsx'],
  '/admin/feedbacks': [A + 'feedbacks/page.tsx'],
  '/admin/relatorios': [A + 'relatorios/page.tsx'],
  '/admin/relatorios/graficos': [A + 'relatorios/graficos/page.tsx'],
  '/admin/relatorios/simulados': [A + 'relatorios/simulados/page.tsx'],
  '/admin/relatorios/disciplinas': [A + 'relatorios/disciplinas/page.tsx'],
  '/admin/revisao/relatorios': [A + 'revisao/relatorios/page.tsx'],
  '/admin/relatorios/estudantes': [A + 'relatorios/estudantes/page.tsx'],
  '/admin/relatorios/grupos': [A + 'relatorios/grupos/page.tsx'],
  '/admin/relatorios/ranking': [A + 'relatorios/ranking/page.tsx'],
  '/admin/relatorios/engajamento': [A + 'relatorios/engajamento/page.tsx'],
  '/admin/relatorios/nps': [A + 'relatorios/nps/page.tsx'],
  '/admin/administradores': [A + 'administradores/layout.tsx'],
  '/admin/revisao/equipe': [A + 'revisao/equipe/page.tsx'],
  '/admin/configuracoes/mensagens': [A + 'configuracoes/mensagens/page.tsx'],
  '/admin/configuracoes/ajuda': [A + 'configuracoes/ajuda/page.tsx'],
  '/admin/configuracoes/banners': [A + 'configuracoes/banners/page.tsx'],
  '/admin/configuracoes/novidades': [A + 'configuracoes/novidades/page.tsx'],
  '/admin/revisao/aparencia': [A + 'revisao/aparencia/page.tsx'],
  '/admin/ajuda': [A + 'ajuda/page.tsx'],
  '/admin/auditoria': [A + 'auditoria/page.tsx'],
  '/admin/acessos': [A + 'acessos/page.tsx'],
  '/admin/lgpd': [A + 'lgpd/page.tsx'],
  '/admin/lixeira': [A + 'lixeira/page.tsx'],
  '/admin/transcricao': [A + 'transcricao/page.tsx'],
  '/admin/api-keys': [A + 'api-keys/page.tsx'],
  '/admin/conexoes/webhooks': [A + 'conexoes/webhooks/page.tsx'],
  '/admin/liberacao': [A + 'liberacao/liberacao-client.tsx'],
  '/admin/seguranca': [A + 'seguranca/page.tsx'],
  '/admin/auditoria/problemas': [A + 'auditoria/problemas/page.tsx'],
  '/admin/acessos-equipe': [A + 'acessos-equipe/page.tsx'],
  '/admin/teste': [A + 'teste/page.tsx'],
}

// Cabeçalhos compartilhados que já embutem o slot (components/admin/revisao/ui.tsx e estudio-header.tsx).
const TEM_SLOT = /<BarraSetorSlot\b|<RevisaoHead\b|<RevisaoAbas\b|<EstudioHeader\b|<CabecalhoArea\b|<TituloTela\b/

/** Rotas (sem query) de clusters com 2+ itens e sem `abasProprias` — as que exibem a barra. */
function rotasComBarra(): string[] {
  const set = new Set<string>()
  for (const s of SETORES) for (const a of s.abas) {
    // Aliases (rotas antigas) não entram na barra: só os itens que a sidebar/barra realmente mostram.
    const reais = a.itens.filter((i) => !i.alias)
    if (a.abasProprias || reais.length < 2) continue
    for (const i of reais) if (i.href.startsWith('/admin')) set.add(i.href.split('?')[0])
  }
  return [...set]
}

describe('barra do setor: posição por slot (nunca no topo do <main>)', () => {
  it('o layout do /admin não renderiza a barra no topo (só o provider)', () => {
    const layout = readFileSync(resolve(RAIZ, 'app/admin/layout.tsx'), 'utf8')
    expect(layout).toContain('BarraSetorProvider')
    expect(layout).not.toMatch(/<BarraSetor[\s/]/)
  })

  it('toda rota de cluster com 2+ itens está mapeada para um arquivo com o slot', () => {
    const faltam = rotasComBarra().filter((r) => !MAPA[r])
    expect(faltam).toEqual([])
  })

  it.each(Object.entries(MAPA))('%s posiciona o slot (direto ou por cabeçalho compartilhado)', (_rota, arquivos) => {
    expect(arquivos.some((f) => TEM_SLOT.test(readFileSync(resolve(RAIZ, f), 'utf8')))).toBe(true)
  })

  it('os cabeçalhos compartilhados embutem o slot', () => {
    for (const f of ['components/admin/revisao/ui.tsx', 'components/admin/cabecalho-area.tsx']) {
      expect(readFileSync(resolve(RAIZ, f), 'utf8')).toContain('<BarraSetorSlot')
    }
  })
})
