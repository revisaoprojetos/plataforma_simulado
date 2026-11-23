import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  decidirDownloadAluno, modoDownloadsDoTema, patchTemaDownloads,
  MOTIVO_DOWNLOADS_DESATIVADOS, MENSAGEM_DOWNLOAD_INDISPONIVEL,
} from '../downloads-aluno-pura'

describe('modoDownloadsDoTema (ausente = bloqueado)', () => {
  it('tenant sem config → bloqueado', () => {
    for (const t of [undefined, null, {}, 'x', 42, { biblioteca_politica: {} }, { downloads_aluno: 'qualquer' }]) {
      expect(modoDownloadsDoTema(t)).toBe('bloqueado')
    }
  })
  it("só 'permitido' explícito libera", () => {
    expect(modoDownloadsDoTema({ downloads_aluno: 'permitido' })).toBe('permitido')
    expect(modoDownloadsDoTema({ downloads_aluno: 'bloqueado' })).toBe('bloqueado')
    expect(modoDownloadsDoTema({ downloads_aluno: true })).toBe('bloqueado')
  })
  it('chave antiga só libera com true explícito; downloads_aluno vence', () => {
    expect(modoDownloadsDoTema({ biblioteca_politica: { aluno_pode_baixar: true } })).toBe('permitido')
    expect(modoDownloadsDoTema({ biblioteca_politica: { aluno_pode_baixar: false } })).toBe('bloqueado')
    expect(modoDownloadsDoTema({ downloads_aluno: 'bloqueado', biblioteca_politica: { aluno_pode_baixar: true } })).toBe('bloqueado')
    expect(modoDownloadsDoTema({ downloads_aluno: 'permitido', biblioteca_politica: { aluno_pode_baixar: false } })).toBe('permitido')
  })
  it('patchTemaDownloads grava o valor lido de volta', () => {
    expect(modoDownloadsDoTema(patchTemaDownloads(true))).toBe('permitido')
    expect(modoDownloadsDoTema(patchTemaDownloads(false))).toBe('bloqueado')
  })
})

describe('decidirDownloadAluno', () => {
  it('aluno: bloqueado por padrão, com motivo para o log', () => {
    expect(decidirDownloadAluno(modoDownloadsDoTema({}))).toEqual({ permitido: false, motivo: MOTIVO_DOWNLOADS_DESATIVADOS })
    expect(decidirDownloadAluno(null)).toEqual({ permitido: false, motivo: 'downloads_desativados' })
  })
  it("aluno: liberado com 'permitido'", () => {
    expect(decidirDownloadAluno('permitido', 'aluno')).toEqual({ permitido: true, motivo: null })
  })
  it('admin e testador global baixam mesmo bloqueado', () => {
    expect(decidirDownloadAluno('bloqueado', 'admin').permitido).toBe(true)
    expect(decidirDownloadAluno('bloqueado', 'testador').permitido).toBe(true)
    expect(decidirDownloadAluno(null, 'testador').permitido).toBe(true)
  })
  it('mensagem amigável', () => {
    expect(MENSAGEM_DOWNLOAD_INDISPONIVEL).toBe('Download indisponível no momento')
  })
})

describe('cobertura estrutural das rotas (a guarda existe; rota de leitura não é afetada)', () => {
  const ler = (p: string) => readFileSync(join(__dirname, '..', '..', '..', p), 'utf8')
  it.each([
    'app/api/aluno/biblioteca/baixar/route.ts',
    'app/api/conteudo/baixar/route.ts',
  ])('%s chama a guarda central', (p) => {
    expect(ler(p)).toContain('bloqueioDownloadsAluno')
  })
  it('/api/arquivo/pdf (material do simulado) NÃO usa o interruptor: a liberação é a configurada no admin', () => {
    const src = ler('app/api/arquivo/pdf/[...path]/route.ts')
    expect(src).not.toContain('bloqueioDownloadsAluno')
    expect(src).not.toContain('downloadMaterialBloqueado')
  })
  it('rotas FORA do escopo (diagnóstico, cadernos, simulado, cronograma, caderno beta) não usam a guarda', () => {
    for (const p of [
      'app/api/aluno/cronograma-pdf/route.ts',
      'app/api/aluno/simulado-downloads/route.ts',
      'app/api/aluno/caderno-teste-questoes/route.ts',
      'app/api/aluno/caderno-teste-pdf/route.ts',
      'app/api/aluno/cronograma/adaptativo/docx/route.ts',
      'app/api/aluno/notebook/paginas/[id]/exportar/route.ts',
      'app/imprimir/cronograma/[emissaoId]/page.tsx',
    ]) expect(ler(p)).not.toContain('bloqueioDownloadsAluno')
  })
  it('rotas de leitura/admin não usam a guarda', () => {
    for (const p of ['app/api/conteudo/fonte/route.ts', 'app/api/admin/biblioteca/download-lote/route.ts']) {
      expect(ler(p)).not.toContain('bloqueioDownloadsAluno')
    }
  })
})
