import { describe, expect, it } from 'vitest'
import { SETORES, SUPER_ONLY_PREFIXOS, itensPlanos, resolverRota, rotaSuperOnly, setoresVisiveis, hrefInicialSetor, hrefInicialAba, itensDaBarra, chaveRotuloAba, iconeDaAba } from './setores'

// Snapshot dos hrefs do menu ANTIGO (`navGroups` + Dashboard da sidebar). Nenhum pode sumir nem duplicar.
const HREFS_MENU_ANTIGO = [
  '/admin',
  '/admin/simulados', '/admin/correcao', '/admin/questoes', '/admin/modelos-caderno', '/admin/biblioteca?tab=modelos',
  '/admin/cronogramas', '/admin/cronogramas/relatorios', '/admin/cronogramas/importar', '/admin/cronogramas/adaptativo', '/admin/cronogramas/lei-seca',
  '/admin/leitura', '/admin/leitura/analise', '/admin/jurisprudencia', '/admin/leitura/biblioteca',
  '/admin/estudantes', '/admin/grupos', '/admin/produtos', '/admin/impersonation',
  '/admin/integracoes', '/admin/conexoes/webhooks', '/admin/liberacao',
  '/admin/relatorios/graficos', '/admin/relatorios/simulados', '/admin/relatorios/disciplinas', '/admin/relatorios/estudantes',
  '/admin/relatorios/ranking', '/admin/relatorios/engajamento', '/admin/relatorios/nps', '/admin/relatorios/grupos',
  '/admin/auditoria?tipo=acessos', '/admin/auditoria?tipo=modificacoes', '/admin/auditoria?tipo=automacoes', '/admin/auditoria?tipo=visualizacoes',
  '/admin/auditoria/problemas', '/admin/acessos', '/admin/acessos-equipe', '/admin/seguranca',
  '/admin/gamificacao', '/admin/comentarios', '/admin/feedbacks',
  '/admin/atendimento?tab=duvidas', '/admin/atendimento?tab=requerimentos',
  '/admin/administradores', '/admin/transcricao', '/admin/sistema',
  '/admin/configuracoes/mensagens', '/admin/configuracoes/ajuda', '/admin/configuracoes/banners', '/admin/configuracoes/novidades',
  '/admin/lgpd', '/admin/lixeira', '/admin/ajuda',
  '/admin/conteudos/produtos', '/admin/biblioteca',
  '/admin/revisao/inicio', '/admin/revisao/biblioteca', '/admin/revisao/jurisclub', '/admin/revisao/cronograma', '/admin/revisao/videoteca',
  '/admin/revisao/duvidas', '/admin/revisao/atualizacoes', '/admin/revisao/membros', '/admin/revisao/grupos', '/admin/revisao/calendario',
  '/admin/revisao/campanhas', '/admin/revisao/avisos', '/admin/revisao/cursos', '/admin/revisao/simulados', '/admin/revisao/relatorios',
  '/admin/revisao/aparencia', '/admin/revisao/equipe',
  '/admin/teste',
]

const sem = { get: (_: string): string | null => null }
const com = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null })
const planos = itensPlanos()

describe('SETORES — cobertura e unicidade', () => {
  it('todo href do menu antigo aparece EXATAMENTE uma vez', () => {
    for (const h of HREFS_MENU_ANTIGO) {
      expect(planos.filter((p) => p.item.href === h).length, h).toBe(1)
    }
  })
  it('nenhum href repetido no conjunto todo (nem dentro das abas)', () => {
    const hrefs = planos.map((p) => p.item.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
    for (const s of SETORES) for (const a of s.abas) {
      const h = a.itens.map((i) => i.href)
      expect(new Set(h).size, `${s.id}/${a.id}`).toBe(h.length)
    }
  })
  it('ids de setor e de aba são únicos', () => {
    expect(new Set(SETORES.map((s) => s.id)).size).toBe(SETORES.length)
    for (const s of SETORES) expect(new Set(s.abas.map((a) => a.id)).size, s.id).toBe(s.abas.length)
  })
  it('só os 8 setores esperados, na ordem', () => {
    expect(SETORES.map((s) => s.id)).toEqual(['inicio', 'pedagogico', 'alunos', 'atendimento', 'analise', 'admin', 'super'])
  })
})

describe('SETORES — super admin', () => {
  it('nenhum item superOnly fora do setor Super Admin; e todo item do setor Super é superOnly', () => {
    for (const { setor, aba, item } of planos) {
      if (setor.id === 'super') {
        expect(setor.superOnly && aba.superOnly && item.superOnly, item.href).toBe(true)
      } else {
        expect(!!item.superOnly || !!aba.superOnly || !!setor.superOnly, `${setor.id}:${item.href}`).toBe(false)
      }
    }
  })
  it('toda rota super-only (path) está no setor Super e vice-versa (exceto /super e ?tab=modelos, gateados fora do layout)', () => {
    for (const { setor, item } of planos) {
      const path = item.href.split('?')[0]
      if (setor.id === 'super') {
        if (path === '/super' || item.href.includes('?')) continue
        expect(rotaSuperOnly(path), item.href).toBe(true)
      } else {
        expect(rotaSuperOnly(path), item.href).toBe(false)
      }
    }
    for (const p of SUPER_ONLY_PREFIXOS) expect(rotaSuperOnly(p + '/x')).toBe(true)
  })
  it("'/admin/acessos' não é confundido com '/admin/acessos-equipe'", () => {
    expect(rotaSuperOnly('/admin/acessos')).toBe(false)
    expect(rotaSuperOnly('/admin/acessos/x')).toBe(false)
    expect(rotaSuperOnly('/admin/acessos-equipe')).toBe(true)
    expect(rotaSuperOnly('/admin/acessos-equipe/abc')).toBe(true)
    expect(rotaSuperOnly('/admin/auditoria')).toBe(false)
    expect(rotaSuperOnly('/admin/auditoria/problemas')).toBe(true)
  })
  it('setoresVisiveis: não-super nunca vê o setor/itens super, mesmo com permissão total; super vê', () => {
    const tudo = { can: () => true, areasBloqueadas: [] as string[] }
    const nao = setoresVisiveis({ ...tudo, isSuperAdmin: false })
    expect(nao.find((s) => s.id === 'super')).toBeUndefined()
    const hrefsNao = nao.flatMap((s) => s.abas.flatMap((a) => a.itens.map((i) => i.href)))
    for (const h of ['/admin/sistema', '/admin/transcricao', '/admin/api-keys', '/admin/conexoes/webhooks', '/admin/liberacao', '/admin/seguranca', '/admin/auditoria/problemas', '/admin/acessos-equipe', '/admin/teste', '/admin/biblioteca?tab=modelos']) {
      expect(hrefsNao, h).not.toContain(h)
    }
    const sim = setoresVisiveis({ ...tudo, isSuperAdmin: true })
    expect(sim.find((s) => s.id === 'super')).toBeDefined()
  })
})

describe('resolverRota / visibilidade', () => {
  it('escolhe o href mais longo (Biblioteca ?tab=modelos vs Biblioteca)', () => {
    expect(resolverRota('/admin/biblioteca', com({ tab: 'modelos' }))?.item.href).toBe('/admin/biblioteca?tab=modelos')
    expect(resolverRota('/admin/biblioteca', sem)?.item.href).toBe('/admin/biblioteca')
    expect(resolverRota('/admin/biblioteca/editar/abc', sem)?.item.href).toBe('/admin/biblioteca')
  })
  it('sub-rotas acendem o item certo', () => {
    expect(resolverRota('/admin/cronogramas/pacotes', sem)?.item.href).toBe('/admin/cronogramas')
    expect(resolverRota('/admin/cronogramas/adaptativo/faixas', sem)?.item.href).toBe('/admin/cronogramas/adaptativo')
    expect(resolverRota('/admin/conteudos/materiais/aulas', sem)?.item.href).toBe('/admin/conteudos/produtos')
    expect(resolverRota('/admin/auditoria/problemas', sem)?.setor.id).toBe('super')
    expect(resolverRota('/admin/acessos', sem)?.setor.id).toBe('admin')
    expect(resolverRota('/admin/acessos-equipe', sem)?.setor.id).toBe('super')
    expect(resolverRota('/admin/leitura/analise', sem)?.item.href).toBe('/admin/leitura/analise')
  })
  it('query só vale com pathname exato; sem a query cai no 1º item da rota', () => {
    expect(resolverRota('/admin/auditoria', com({ tipo: 'automacoes' }))?.item.href).toBe('/admin/auditoria?tipo=automacoes')
    expect(resolverRota('/admin/auditoria', sem)?.item.href).toBe('/admin/auditoria?tipo=acessos')
    expect(resolverRota('/admin/atendimento', com({ tab: 'requerimentos' }))?.item.href).toBe('/admin/atendimento?tab=requerimentos')
  })
  it('/admin = Início exato; rotas desconhecidas = sem setor', () => {
    expect(resolverRota('/admin', sem)?.setor.id).toBe('inicio')
    expect(resolverRota('/admin/rota-que-nao-existe', sem)).toBeNull()
    expect(resolverRota('/aluno', sem)).toBeNull()
  })
  it('permissão, flag oculto e manutenção filtram; aba/setor sem item some', () => {
    const so = (p?: string) => p === 'estudantes:view'
    const v = setoresVisiveis({ can: (p) => !p || so(p), isSuperAdmin: false })
    expect(v.find((s) => s.id === 'alunos')?.abas.flatMap((a) => a.itens.map((i) => i.href))).toContain('/admin/estudantes')
    expect(v.find((s) => s.id === 'alunos')?.abas.map((a) => a.id)).not.toContain('engajamento')
    const m = setoresVisiveis({ can: () => true, isSuperAdmin: false, areasBloqueadas: ['/admin/estudantes'] })
    expect(m.flatMap((s) => s.abas.flatMap((a) => a.itens.map((i) => i.href)))).not.toContain('/admin/estudantes')
  })
  it('hrefInicialSetor aponta para o 1º item visível', () => {
    const v = setoresVisiveis({ can: () => true, isSuperAdmin: true })
    expect(hrefInicialSetor(v.find((s) => s.id === 'inicio')!)).toBe('/admin')
    expect(hrefInicialSetor(v.find((s) => s.id === 'super')!)).toBe('/admin/sistema')
  })
})

describe('clusters (aba = 1 entrada da sidebar) e barra de abas internas', () => {
  const tudo = { can: () => true, isSuperAdmin: true, areasBloqueadas: [] as string[] }
  const vis = setoresVisiveis(tudo)
  const barra = (path: string, q: Record<string, string> = {}) => itensDaBarra(resolverRota(path, com(q)), vis)?.map((i) => i.href) ?? null

  it('ids de aba únicos no menu todo (chave de rótulo estável)', () => {
    const ids = SETORES.flatMap((s) => s.abas.map((a) => a.id))
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('exemplo do dono: Cronogramas = só 2 entradas (Gerador e Adaptativo), cada uma com 1 destino e SEM barra', () => {
    const ped = SETORES.find((s) => s.id === 'pedagogico')!
    expect(ped.abas.map((a) => a.id)).toEqual(['cursos-produtos', 'simulados', 'lei-seca-juris', 'gerador-cronograma', 'adaptativo', 'biblioteca', 'questoes', 'videoteca', 'atualizacoes', 'duvidas'])
    const ger = ped.abas.find((a) => a.id === 'gerador-cronograma')!
    const ada = ped.abas.find((a) => a.id === 'adaptativo')!
    // 1º item = destino da entrada (tela nova); o resto são ALIAS (rotas antigas) que não aparecem no menu.
    expect(ger.itens.filter((i) => !i.alias).map((i) => i.href)).toEqual(['/admin/revisao/cronograma?aba=gerador'])
    expect(ada.itens.filter((i) => !i.alias).map((i) => i.href)).toEqual(['/admin/revisao/cronograma?aba=adaptativo'])
    expect(ger.itens.filter((i) => i.alias).map((i) => i.href)).toEqual(['/admin/cronogramas', '/admin/cronogramas/relatorios', '/admin/cronogramas/importar'])
    expect(ada.itens.filter((i) => i.alias).map((i) => i.href)).toEqual(['/admin/revisao/cronograma', '/admin/cronogramas/adaptativo', '/admin/cronogramas/lei-seca'])
    expect(ger.itens[0].alias || ada.itens[0].alias).toBeFalsy()
    // gate da sidebar = gate real da página (cronogramas:view)
    expect(ger.itens[0].perm).toBe('cronogramas:view')
    expect(ada.itens[0].perm).toBe('cronogramas:view')
    // aliases nunca aparecem na sidebar nem na barra
    const v = vis.find((s) => s.id === 'pedagogico')!
    expect(v.abas.find((a) => a.id === 'gerador-cronograma')!.itens.map((i) => i.href)).toEqual(['/admin/revisao/cronograma?aba=gerador'])
    expect(v.abas.find((a) => a.id === 'adaptativo')!.itens.map((i) => i.href)).toEqual(['/admin/revisao/cronograma?aba=adaptativo'])
    expect(barra('/admin/revisao/cronograma', { aba: 'gerador' })).toBeNull()
    expect(barra('/admin/revisao/cronograma', { aba: 'adaptativo' })).toBeNull()
    expect(barra('/admin/cronogramas/importar')).toBeNull()
    // sem perm de cronogramas: as 2 entradas somem
    const sem = setoresVisiveis({ can: (p) => !p || !p.startsWith('cronogramas:'), isSuperAdmin: false })
    expect(sem.find((s) => s.id === 'pedagogico')!.abas.map((a) => a.id)).not.toContain('gerador-cronograma')
    expect(sem.find((s) => s.id === 'pedagogico')!.abas.map((a) => a.id)).not.toContain('adaptativo')
  })
  it('rotas antigas e novas resolvem para a entrada certa (destaque da sidebar)', () => {
    const aba = (path: string, q: Record<string, string> = {}) => resolverRota(path, com(q))?.aba.id
    expect(aba('/admin/revisao/cronograma', { aba: 'gerador', sub: 'metas' })).toBe('gerador-cronograma')
    expect(aba('/admin/revisao/cronograma', { aba: 'adaptativo', sub: 'regras' })).toBe('adaptativo')
    expect(aba('/admin/revisao/cronograma')).toBe('adaptativo') // padrão da tela = adaptativo
    for (const r of ['/admin/cronogramas', '/admin/cronogramas/relatorios', '/admin/cronogramas/importar', '/admin/cronogramas/pacotes', '/admin/cronogramas/conteudos/abc', '/admin/cronogramas/metas', '/admin/cronogramas/tipos', '/admin/cronogramas/links', '/admin/cronogramas/criar', '/admin/cronogramas/xyz']) {
      expect(aba(r), r).toBe('gerador-cronograma')
    }
    for (const r of ['/admin/cronogramas/adaptativo', '/admin/cronogramas/adaptativo/faixas', '/admin/cronogramas/adaptativo/catalogo/paginas', '/admin/cronogramas/lei-seca']) {
      expect(aba(r), r).toBe('adaptativo')
    }
  })
  it('chave de rótulo das 2 entradas = href completo (1 item real); aliases não contam', () => {
    const ped = vis.find((s) => s.id === 'pedagogico')!
    expect(chaveRotuloAba(ped.abas.find((a) => a.id === 'gerador-cronograma')!)).toBe('/admin/revisao/cronograma?aba=gerador')
    expect(chaveRotuloAba(ped.abas.find((a) => a.id === 'adaptativo')!)).toBe('/admin/revisao/cronograma?aba=adaptativo')
  })
  it('manutenção por área bloqueia pelo path (inclui hrefs com ?aba=)', () => {
    const m = setoresVisiveis({ can: () => true, isSuperAdmin: true, areasBloqueadas: ['/admin/revisao/cronograma'] })
    const ids = m.find((s) => s.id === 'pedagogico')!.abas.map((a) => a.id)
    expect(ids).not.toContain('gerador-cronograma')
    expect(ids).not.toContain('adaptativo')
  })
  it('barra mostra SÓ os itens da aba ativa (1 nível)', () => {
    expect(barra('/admin/estudantes')).toEqual(['/admin/estudantes', '/admin/revisao/membros', '/admin/impersonation'])
    expect(barra('/admin/auditoria', { tipo: 'modificacoes' })).toContain('/admin/auditoria?tipo=automacoes')
    expect(barra('/admin/relatorios/ranking')).toContain('/admin/relatorios/nps')
  })
  it('barra some: aba de 1 item, rota sem setor e aba com abasProprias (Atendimento)', () => {
    expect(barra('/admin/gamificacao')).toBeNull()
    expect(barra('/admin/revisao/videoteca')).toBeNull()
    expect(barra('/admin/rota-que-nao-existe')).toBeNull()
    expect(barra('/admin/atendimento', { tab: 'duvidas' })).toBeNull()
    expect(SETORES.flatMap((s) => s.abas).filter((a) => a.abasProprias).map((a) => a.id)).toEqual(['atendimento'])
  })
  it('barra respeita permissão: com 1 só item visível no cluster, some', () => {
    const so = setoresVisiveis({ can: (p) => !p || p === 'configuracoes:view', isSuperAdmin: false })
    expect(itensDaBarra(resolverRota('/admin/revisao/avisos', sem), so)).toBeNull() // Comunicação: só "Avisos" visível
  })
  it('setor super: barra só p/ super, e clusters super continuam super-only', () => {
    expect(barra('/admin/transcricao')?.length).toBeGreaterThan(1)
    const nao = setoresVisiveis({ can: () => true, isSuperAdmin: false })
    expect(itensDaBarra(resolverRota('/admin/transcricao', sem), nao)).toBeNull()
  })
  it('entrada da sidebar: destino = 1º item visível; chave de rótulo = href (aba de 1 item) ou aba:<id>', () => {
    const ped = vis.find((s) => s.id === 'pedagogico')!
    expect(hrefInicialAba(ped.abas.find((a) => a.id === 'biblioteca')!)).toBe('/admin/biblioteca')
    expect(chaveRotuloAba(ped.abas.find((a) => a.id === 'videoteca')!)).toBe('/admin/revisao/videoteca')
    expect(chaveRotuloAba(ped.abas.find((a) => a.id === 'biblioteca')!)).toBe('aba:biblioteca')
    for (const s of vis) for (const a of s.abas) expect(iconeDaAba(a)).toBeTruthy()
  })
  it('sidebar enxuta: nenhum setor passa de 10 entradas', () => {
    for (const s of SETORES) expect(s.abas.length, s.id).toBeLessThanOrEqual(10)
  })
})
