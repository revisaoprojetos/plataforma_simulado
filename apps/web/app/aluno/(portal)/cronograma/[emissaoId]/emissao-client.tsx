'use client'

import { useState, useTransition } from 'react'
import { Archive, ArchiveRestore, Check, Pencil, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AlertBox } from '@/components/ui/alert-box'
import { ResumoGrade } from '@/components/cronograma/grade-cronograma'
import { VisaoCronograma } from '@/components/cronograma/visao-cronograma'
import type { ChecksDaEmissao } from '../checks-actions'
import { fmtBr } from '@/lib/cronograma/datas'
import type { Grade } from '@/lib/cronograma/tipos'
import { arquivarEmissao, renomearEmissao, type EmissaoResumo } from '../emissoes-actions'

export function EmissaoClient({
  emissao,
  grade,
  indisponivel,
  checks,
}: {
  emissao: EmissaoResumo
  grade: Grade
  indisponivel: boolean
  checks: ChecksDaEmissao
}) {
  const [titulo, setTitulo] = useState(emissao.titulo ?? '')
  const [editando, setEditando] = useState(false)
  const [arquivada, setArquivada] = useState(emissao.arquivada)
  const [pendente, iniciar] = useTransition()

  const paleta = (emissao.formulario?.paleta as string) ?? 'revisao'
  const inicio = emissao.formulario?.inicio as string | undefined

  function salvarTitulo() {
    iniciar(async () => {
      const r = await renomearEmissao(emissao.id, titulo)
      if (!r.ok) { toast.error(r.error ?? 'Não foi possível renomear.'); return }
      toast.success('Nome atualizado')
      setEditando(false)
    })
  }

  function alternarArquivo() {
    iniciar(async () => {
      const alvo = !arquivada
      const r = await arquivarEmissao(emissao.id, alvo)
      if (!r.ok) { toast.error(r.error ?? 'Não foi possível alterar.'); return }
      setArquivada(alvo)
      toast.success(alvo ? 'Cronograma arquivado' : 'Cronograma restaurado')
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {editando ? (
            <div className="flex items-center gap-2">
              <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Dê um nome a este cronograma" className="w-72" />
              <Button size="sm" onClick={salvarTitulo} disabled={pendente}>
                <Check className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditando(false)} disabled={pendente}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              {titulo || emissao.cronograma_nome}
              <Button size="sm" variant="ghost" onClick={() => setEditando(true)}>
                <Pencil className="h-4 w-4" />
              </Button>
            </h1>
          )}
          <p className="text-muted-foreground">
            {emissao.cronograma_nome}
            {inicio && ` · começa em ${fmtBr(inicio)}`}
            {` · gerado em ${new Date(emissao.criado_em).toLocaleDateString('pt-BR')} às ${new Date(
              emissao.criado_em,
            ).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {arquivada && <Badge variant="secondary">Arquivado</Badge>}
          <Button size="sm" variant="outline" onClick={alternarArquivo} disabled={pendente}>
            {arquivada ? <ArchiveRestore className="mr-1 h-4 w-4" /> : <Archive className="mr-1 h-4 w-4" />}
            {arquivada ? 'Restaurar' : 'Arquivar'}
          </Button>
        </div>
      </div>

      {indisponivel ? (
        <AlertBox variante="aviso" titulo="Este cronograma não está mais disponível">
          <p className="text-sm">
            Ele saiu do catálogo ou seu acesso mudou, então não dá para remontar a grade. O registro do que
            você gerou continua aqui — se precisar dele, fale com o suporte.
          </p>
          {emissao.resumo?.subtitulo && <p className="mt-2 text-sm">Na época: {emissao.resumo.subtitulo}</p>}
        </AlertBox>
      ) : (
        <>
          <ResumoGrade grade={grade} />
          <p className="text-sm text-muted-foreground">{grade.resumo.subtitulo}</p>
          <VisaoCronograma grade={grade} paletaSlug={paleta} emissaoId={emissao.id} checksIniciais={checks} />
        </>
      )}
    </div>
  )
}
