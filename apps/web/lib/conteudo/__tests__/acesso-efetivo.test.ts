import { describe, it, expect } from 'vitest'
import { acessoEfetivo, type ItemAcesso, type Aluno } from '../acesso-efetivo'

// Testes de UNIDADE/CONTRATO da função pura `acessoEfetivo` (handoff §3). Sem I/O.
// Rodar: `cd apps/web && npx vitest run lib/conteudo/__tests__/acesso-efetivo.test.ts`
// (ou `pnpm test` / `npm test` — usa a mesma config vitest do repo).

const aluno = (estudanteId: string, grupos: string[] = []): Aluno => ({ estudanteId, grupos })
const AGORA = new Date('2026-06-15T12:00:00Z')
const ctx = { agora: AGORA }

describe('tolerância / degrade (preserva o comportamento atual)', () => {
  it('item sem configuração nenhuma → LIBERADO com permissões cheias', () => {
    const item: ItemAcesso = { id: 'd1' }
    const r = acessoEfetivo(item, aluno('a1'), ctx)
    expect(r.permitido).toBe(true)
    expect(r.permissoes).toEqual({ ler: true, baixar: true, grifar: true })
  })

  it('árvore inteira sem configuração → liberado', () => {
    const root: ItemAcesso = { id: 'p0', modo: 'principal' }
    const item: ItemAcesso = { id: 'd1', modo: 'herdar', ancestrais: [root] }
    expect(acessoEfetivo(item, aluno('a1'), ctx).permitido).toBe(true)
  })
})

describe('herança (modo herdar segue a pasta acima)', () => {
  const root: ItemAcesso = {
    id: 'p0', modo: 'principal', acessoGeral: 'restrito',
    atribuicoes: [{ tipo: 'grupo', grupoId: 'g1', origem: 'avulsa' }],
  }
  const doc: ItemAcesso = { id: 'd1', modo: 'herdar', ancestrais: [root] }

  it('aluno no grupo liberado pela pasta principal → permitido', () => {
    const r = acessoEfetivo(doc, aluno('a1', ['g1']), ctx)
    expect(r.permitido).toBe(true)
    expect(r.origens).toContain('avulsa')
  })

  it('aluno fora do grupo → negado (sem_origem)', () => {
    const r = acessoEfetivo(doc, aluno('a2', ['g2']), ctx)
    expect(r.permitido).toBe(false)
    expect(r.motivo).toBe('sem_origem')
  })
})

describe('regra própria sobrescreve o ancestral', () => {
  const root: ItemAcesso = {
    id: 'p0', modo: 'principal', acessoGeral: 'restrito',
    atribuicoes: [{ tipo: 'grupo', grupoId: 'g2' }], // só g2 pela pasta
  }
  const doc: ItemAcesso = {
    id: 'd1', modo: 'propria', ancestrais: [root], acessoGeral: 'restrito',
    atribuicoes: [{ tipo: 'aluno', estudanteId: 'a1', origem: 'individual' }],
  }

  it('aluno liberado só pela regra PRÓPRIA do doc → permitido, origem individual', () => {
    const r = acessoEfetivo(doc, aluno('a1', []), ctx)
    expect(r.permitido).toBe(true)
    expect(r.origens).toEqual(['individual'])
  })

  it('aluno que só o ancestral liberaria é IGNORADO pela regra própria restrita', () => {
    const r = acessoEfetivo(doc, aluno('a9', ['g2']), ctx)
    expect(r.permitido).toBe(false)
  })
})

describe('bloqueio vence subindo a árvore', () => {
  it('ancestral bloqueado nega mesmo com regra própria que liberaria', () => {
    const root: ItemAcesso = { id: 'p0', modo: 'bloquear' }
    const doc: ItemAcesso = {
      id: 'd1', modo: 'propria', ancestrais: [root],
      atribuicoes: [{ tipo: 'aluno', estudanteId: 'a1' }],
    }
    const r = acessoEfetivo(doc, aluno('a1'), ctx)
    expect(r.permitido).toBe(false)
    expect(r.motivo).toBe('bloqueado')
  })

  it('o próprio item bloqueado → negado', () => {
    const r = acessoEfetivo({ id: 'd1', modo: 'bloquear' }, aluno('a1'), ctx)
    expect(r.motivo).toBe('bloqueado')
  })
})

describe('visibilidade (oculto)', () => {
  it('item oculto → negado mesmo liberado por acesso', () => {
    const item: ItemAcesso = { id: 'd1', oculto: true, acessoGeral: 'todos' }
    const r = acessoEfetivo(item, aluno('a1'), ctx)
    expect(r.permitido).toBe(false)
    expect(r.motivo).toBe('oculto')
  })
})

describe('janela de datas', () => {
  const base = (de: string | null, ate: string | null): ItemAcesso => ({
    id: 'd1', modo: 'propria', acessoGeral: 'restrito',
    atribuicoes: [{ tipo: 'aluno', estudanteId: 'a1', origem: 'individual', liberadoDe: de, liberadoAte: ate }],
  })

  it('agora dentro da janela → permitido', () => {
    expect(acessoEfetivo(base('2026-06-01T00:00:00Z', '2026-07-01T00:00:00Z'), aluno('a1'), ctx).permitido).toBe(true)
  })
  it('agora depois de liberado_ate → negado', () => {
    expect(acessoEfetivo(base('2026-01-01T00:00:00Z', '2026-05-01T00:00:00Z'), aluno('a1'), ctx).permitido).toBe(false)
  })
  it('agora antes de liberado_de → negado', () => {
    expect(acessoEfetivo(base('2026-08-01T00:00:00Z', null), aluno('a1'), ctx).permitido).toBe(false)
  })
  it('janela aberta dos dois lados → permitido', () => {
    expect(acessoEfetivo(base(null, null), aluno('a1'), ctx).permitido).toBe(true)
  })
})

describe('união de permissões entre origens', () => {
  it('duas atribuições que casam → OR das permissões', () => {
    const item: ItemAcesso = {
      id: 'd1', modo: 'propria', acessoGeral: 'restrito',
      atribuicoes: [
        { tipo: 'grupo', grupoId: 'g1', origem: 'avulsa', podeBaixar: false, podeGrifar: true },
        { tipo: 'grupo', grupoId: 'g2', origem: 'avulsa', podeBaixar: true, podeGrifar: false },
      ],
    }
    const r = acessoEfetivo(item, aluno('a1', ['g1', 'g2']), ctx)
    expect(r.permitido).toBe(true)
    expect(r.permissoes).toEqual({ ler: true, baixar: true, grifar: true })
  })

  it('permissões restritas de uma única origem são respeitadas', () => {
    const item: ItemAcesso = {
      id: 'd1', modo: 'propria', acessoGeral: 'restrito',
      atribuicoes: [{ tipo: 'aluno', estudanteId: 'a1', origem: 'individual', podeBaixar: false, podeGrifar: false }],
    }
    const r = acessoEfetivo(item, aluno('a1'), ctx)
    expect(r.permissoes).toEqual({ ler: true, baixar: false, grifar: false })
  })
})

describe('gancho de pacotes (stub via contexto)', () => {
  it('origem via_pacote válida libera mesmo sem regra avulsa/individual', () => {
    const item: ItemAcesso = { id: 'd1', modo: 'propria', acessoGeral: 'restrito', atribuicoes: [] }
    const r = acessoEfetivo(item, aluno('a1'), {
      agora: AGORA,
      origensPacote: [{ origem: 'via_pacote', liberadoDe: '2026-06-01T00:00:00Z' }],
    })
    expect(r.permitido).toBe(true)
    expect(r.origens).toContain('via_pacote')
  })
})
