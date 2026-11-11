// Elemento CRONOGRAMA (Plano de estudo): card | faixa | lista | semana — reusa EXATAMENTE BlocoCronogramaView.
import { BlocoCronogramaView } from '@/components/produtos/bloco-cronograma'
import { normConfigCronograma, type ConfigCronograma } from '@/lib/produtos/blocos-pagina'
import type { ResumoCronograma } from '@/lib/produtos/resumo-cronograma'
import { Moldura, Txt, dadosDoBloco, type PropsRenderer } from './base'

export function RendererCronograma(props: PropsRenderer<'cronograma'>) {
  const { bloco, modo, dispositivo, resolvido } = props
  const dados = dadosDoBloco(bloco, props.dados)
  const edicao = modo === 'edicao'
  let cfg: ConfigCronograma, resumo: ResumoCronograma | null
  if (resolvido?.kind === 'cronograma') { cfg = resolvido.cfg; resumo = resolvido.resumo }
  else if (edicao) {
    const n = normConfigCronograma({ ...bloco.conteudo, variacao: bloco.variacao })
    cfg = { ...n, titulo: n.titulo.trim() || bloco.nome?.trim() || '' }; resumo = dados.resumosCronograma[bloco.id] ?? null
  } else return null
  const c = bloco.conteudo
  return (
    <Moldura bloco={bloco} modo={modo} dispositivo={dispositivo} dados={dados}>
      <BlocoCronogramaView cfg={cfg} resumo={resumo} cor={dados.cor} preview={edicao}
        slotTitulo={edicao ? (t) => <Txt modo={modo} blocoId={bloco.id} campo="conteudo.titulo" valor={c.titulo} fallback={t} /> : undefined}
        slotSubtitulo={edicao ? (t) => <Txt modo={modo} blocoId={bloco.id} campo="conteudo.subtitulo" valor={c.subtitulo} fallback={t} placeholder="Subtítulo" /> : undefined} />
    </Moldura>
  )
}
