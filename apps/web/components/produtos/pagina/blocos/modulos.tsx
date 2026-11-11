// Elemento MÓDULOS: prateleira de módulos (herdar|grade|carrossel|lista|trilha|trilha_imagem|poster) — reusa o
// SecaoModulos/Poster/Fileira do currículo do aluno (curriculo-ui.tsx), agora também com a variação 'poster'.
import { SecaoModulos } from './curriculo-ui'
import { Moldura, Txt, Vazio, dadosDoBloco, type PropsRenderer } from './base'

export function RendererModulos(props: PropsRenderer<'modulos'>) {
  const { bloco, modo, dispositivo, resolvido } = props
  const dados = dadosDoBloco(bloco, props.dados)
  const r = resolvido?.kind === 'modulos' ? resolvido : undefined
  if (!r) {
    if (modo === 'aluno') return null
    return <Moldura bloco={bloco} modo={modo} dispositivo={dispositivo} dados={dados}><Vazio>Nenhum módulo nesta seção — escolha os módulos no painel.</Vazio></Moldura>
  }
  // 'poster' é decidido pela variação do bloco; as demais vêm resolvidas do servidor (herdar → layout do produto).
  const layout = bloco.variacao === 'poster' ? 'poster' : r.layout
  return (
    <Moldura bloco={bloco} modo={modo} dispositivo={dispositivo} dados={dados}>
      <SecaoModulos modulos={r.modulos} slug={dados.slug} cor={dados.cor} layout={layout} titulo={r.titulo} agruparPrefixo={r.agruparPrefixo} recolhivel={r.recolhivel} recolhida={r.recolhida}
        tituloNode={modo === 'edicao' ? <Txt modo={modo} blocoId={bloco.id} campo="nome" valor={bloco.nome ?? ''} fallback={r.titulo} /> : undefined} />
    </Moldura>
  )
}
