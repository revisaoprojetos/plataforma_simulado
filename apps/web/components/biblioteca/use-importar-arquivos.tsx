'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { kindPorArquivo, TIPOS_CONTEUDO } from '@/lib/biblioteca/tipos-conteudo'
import type { DriveUploadItem } from '@/components/admin/drive-novo'
import type { Categoria } from '@/app/admin/biblioteca/actions-tipos'
import { criarPasta, prepararUploadConteudo, importarDeStorage } from '@/app/admin/biblioteca/actions'

// Importação de arquivos do Drive da Biblioteca (mesma mecânica do biblioteca-client.tsx do legado): PUT DIRETO ao storage
// por URL assinada (nada de base64 no payload), um arquivo por vez, painel de progresso (DriveUploadPanel) e "tentar de novo".

function subirComProgresso(signedUrl: string, f: File, onProg: (frac: number) => void): Promise<{ ok: boolean; status: number; corpo: string }> {
  return new Promise((resolve) => {
    try {
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', signedUrl)
      if (f.type) xhr.setRequestHeader('content-type', f.type)
      xhr.setRequestHeader('x-upsert', 'true')
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProg(e.loaded / e.total) }
      xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, corpo: String(xhr.responseText || '').slice(0, 300) })
      xhr.onerror = () => resolve({ ok: false, status: 0, corpo: 'Falha de rede (conexão caiu, bloqueio de CORS ou URL inacessível).' })
      xhr.ontimeout = () => resolve({ ok: false, status: 0, corpo: 'Tempo esgotado no envio.' })
      xhr.send(f)
    } catch (e: any) { resolve({ ok: false, status: 0, corpo: e?.message ?? 'Erro ao iniciar o envio.' }) }
  })
}
const corTipo = (nome: string) => {
  const k = kindPorArquivo(nome)
  return k ? `var(--sel-${TIPOS_CONTEUDO[k].seloSlug})` : 'var(--brand-primary, var(--primary))'
}
function erroDoEnvio(status: number, corpo: string): string {
  if (status === 0) return 'Não foi possível enviar o arquivo (conexão interrompida ou bloqueada).'
  if (status === 413 || /too large|exceeded|maximum allowed size/i.test(corpo)) return 'Arquivo maior que o limite do armazenamento.'
  if (status === 400 && /mime|content.?type|not supported/i.test(corpo)) return 'O armazenamento recusou o tipo do arquivo.'
  if (status === 401 || status === 403 || /signature|expired|jwt/i.test(corpo)) return 'O link de envio expirou ou foi recusado. Tente de novo.'
  if (status === 404 || /bucket not found/i.test(corpo)) return 'Pasta de armazenamento não encontrada (bucket). Verifique a configuração do storage.'
  if (status >= 500) return 'O armazenamento está instável no momento. Tente de novo em instantes.'
  return `O armazenamento recusou o envio (HTTP ${status}).`
}
function erroDoProcessamento(msg: string): string {
  if (/formato não suportado/i.test(msg)) return msg
  if (/body exceeded|payload too large|413/i.test(msg)) return 'Arquivo grande demais para o servidor processar.'
  if (/convers|gotenberg|onlyoffice|ECONNREFUSED|fetch failed/i.test(msg)) return 'O serviço de conversão de documentos não respondeu.'
  if (/timeout|timed out|504/i.test(msg)) return 'O processamento demorou demais e foi interrompido.'
  if (/permiss|unauthor|forbidden|não autorizado/i.test(msg)) return 'Sem permissão para importar nesta biblioteca.'
  return msg || 'Falha ao processar o arquivo.'
}

export function useImportarArquivos({ pastaId, categoria, onConcluido }: { pastaId: string | null; categoria: Categoria; onConcluido: () => void }) {
  const [uploads, setUploads] = useState<DriveUploadItem[] | null>(null)
  const filesRef = useRef(new Map<string, { file: File; destino: string | null }>())
  const patch = (id: string, p: Partial<DriveUploadItem>) => setUploads((prev) => (prev ? prev.map((x) => (x.id === id ? { ...x, ...p } : x)) : prev))

  async function processar(id: string, f: File, destino: string | null): Promise<boolean> {
    const falhar = (etapa: NonNullable<DriveUploadItem['etapa']>, erro: string, detalhe?: string) => { patch(id, { status: 'erro', pct: 100, etapa, erro, detalhe }); return false }
    patch(id, { status: 'enviando', pct: 0, etapa: undefined, erro: undefined, detalhe: undefined })
    if (f.size === 0) return falhar('validacao', 'O arquivo está vazio (0 bytes).')
    try {
      const prep = await prepararUploadConteudo(f.name)
      if (!prep.ok || !prep.path || !prep.uploadUrl) return falhar('preparo', prep.error || 'Não foi possível preparar o envio.', prep.error)
      const put = await subirComProgresso(prep.uploadUrl, f, (frac) => patch(id, { pct: Math.min(99, Math.round(frac * 100)) }))
      let subiu = put.ok
      let det = `HTTP ${put.status || 'sem resposta'}${put.corpo ? ` — ${put.corpo}` : ''}`
      if (!subiu && prep.kind === 'supabase' && prep.token && prep.bucket) {
        const up = await createClient().storage.from(prep.bucket).uploadToSignedUrl(prep.path, prep.token, f, { contentType: f.type || undefined })
        subiu = !up.error
        if (up.error) det += ` | fallback: ${up.error.message}`
      }
      if (!subiu) return falhar('envio', erroDoEnvio(put.status, put.corpo), det)
      patch(id, { status: 'processando', pct: 100 })
      const r = await importarDeStorage({ path: prep.path, titulo: f.name.replace(/\.[^.]+$/, ''), nomeArquivo: f.name, mime: f.type, pastaId: destino, categoria })
      if (!r.ok) return falhar('processamento', erroDoProcessamento(r.error ?? ''), r.error)
      patch(id, { status: 'ok' })
      return true
    } catch (e: any) {
      const msg = String(e?.message ?? e ?? '')
      return falhar('processamento', erroDoProcessamento(msg) || 'Erro inesperado.', msg || undefined)
    }
  }

  async function tentarDeNovo(ids: string[]) {
    let ok = 0
    for (const id of ids) { const it = filesRef.current.get(id); if (it && (await processar(id, it.file, it.destino))) ok++ }
    if (ok) { toast.success(ok === 1 ? 'Arquivo importado.' : `${ok} arquivos importados.`); onConcluido() }
  }

  async function importarArquivos(files: File[], comoPasta: boolean) {
    const visiveis = files.filter((f) => !/^(\.|~\$)/.test(f.name) && !/^(thumbs\.db|desktop\.ini)$/i.test(f.name))
    const base = Date.now()
    const itens: DriveUploadItem[] = visiveis.map((f, i) => {
      const suportado = kindPorArquivo(f.name, f.type) !== null
      const ext = (f.name.match(/\.[^./\\]+$/)?.[0] ?? '').toLowerCase()
      return {
        id: `${base}-${i}-${f.name}`, nome: f.name, cor: corTipo(f.name), pct: suportado ? 0 : 100, tamanho: f.size,
        status: suportado ? 'enviando' : 'erro',
        ...(suportado ? {} : {
          etapa: 'validacao' as const,
          erro: ext === '.doc' ? 'Formato .doc (Word antigo) não é aceito — abra no Word e "Salvar como" .docx.' : `Formato ${ext || 'sem extensão'} não é aceito.`,
          detalhe: 'Aceitos: .docx, .pdf, .html, .pptx/.ppt, .xlsx/.xls, vídeo (.mp4, .webm, .mov, .m4v) e áudio (.mp3, .m4a, .wav, .ogg).',
        }),
      }
    })
    if (!itens.length) { toast.error('Nenhum arquivo selecionado.'); return }
    setUploads(itens)
    filesRef.current = new Map()
    const cache = new Map<string, string | null>([['', pastaId]])
    const garantirPasta = async (segs: string[]): Promise<string | null> => {
      let acc = '', pai = pastaId
      for (const seg of segs) {
        const chave = acc ? `${acc}/${seg}` : seg
        if (cache.has(chave)) { pai = cache.get(chave)!; acc = chave; continue }
        const r = await criarPasta(seg, pai, categoria)
        if (!r.ok || !r.id) throw new Error(r.error || 'Falha ao criar a subpasta.')
        cache.set(chave, r.id); pai = r.id; acc = chave
      }
      return pai
    }
    let ok = 0, erros = itens.filter((x) => x.status === 'erro').length
    for (let i = 0; i < visiveis.length; i++) {
      const f = visiveis[i], it = itens[i]
      if (it.status === 'erro') continue
      let destino: string | null = pastaId
      if (comoPasta) {
        try { destino = await garantirPasta(String((f as any).webkitRelativePath || f.name).split('/').slice(0, -1)) } catch (e: any) {
          patch(it.id, { status: 'erro', pct: 100, etapa: 'preparo', erro: 'Não foi possível criar a subpasta de destino.', detalhe: e?.message }); erros++; continue
        }
      }
      filesRef.current.set(it.id, { file: f, destino })
      if (await processar(it.id, f, destino)) ok++; else erros++
    }
    if (ok) onConcluido()
    if (erros) toast.error(erros === 1 ? '1 arquivo não foi importado — veja o motivo no painel.' : `${erros} arquivos não foram importados — veja os motivos no painel.`)
  }

  return { uploads, fechar: () => setUploads(null), importarArquivos, tentarDeNovo, temArquivo: (id: string) => filesRef.current.has(id) }
}
