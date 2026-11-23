'use client'
// ONDA 2b — comandos `desenho.*` do ribbon (aba Desenhar) + desfazer/refazer de tinta.
// Montar UMA vez dentro da casca: `useComandosDesenho()`. O estado vive em estado-desenho.ts (a folha livre lê de lá).
//   desenho.selecionar | desenho.laco | desenho.texto
//   desenho.borracha            payload: 'pequena' | 'media' | 'grande' (borracha por área) | 'traco' (apaga o traço inteiro)
//   desenho.caneta.1/2/3 e desenho.marca_texto   sem payload = seleciona; payload '#rrggbb'|'tinta' = muda a cor
//   desenho.caneta.N.largura / desenho.marca_texto.largura   payload: número (espessura)
//   desenho.toque               alterna "Desenhar com toque" (dedo desenha; desligado = dedo rola)
// Sem handler (de propósito): desenho.formas.
// Estados publicados via definirEstado: <id> (boolean ativo), <id>.cor e <id>.largura nas canetas.
import { useEffect } from 'react'
import {
  corCanetaValida, idDoSlot, limitarLarguraCaneta, SLOTS_CANETA, type SlotCaneta, type TamanhoBorracha,
} from '@/lib/aluno/notebook-desenho'
import { useOneNoteCmd, useRegistrarComandos } from './contexto-cmd'
import { atualizarDesenho, carregarPrefsDesenho, lerEstadoDesenho, useEstadoDesenho } from './estado-desenho'

export function useComandosDesenho() {
  const cmd = useOneNoteCmd()
  const est = useEstadoDesenho()

  useEffect(() => { carregarPrefsDesenho() }, [])
  useEffect(() => {
    atualizarDesenho({ pedirZoom: (dir) => cmd.executar(dir > 0 ? 'exibir.ampliar' : 'exibir.reduzir') })
    return () => atualizarDesenho({ pedirZoom: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cmd.executar])

  const selecionarSlot = (slot: SlotCaneta, cor?: unknown) => {
    const atual = lerEstadoDesenho()
    const canetas = corCanetaValida(cor) ? { ...atual.canetas, [slot]: { ...atual.canetas[slot], cor } } : atual.canetas
    atualizarDesenho({ canetas, slot, ferramenta: slot === 'mt' ? 'marca-texto' : 'caneta' }, true)
  }
  const largura = (slot: SlotCaneta, n: unknown) => {
    const atual = lerEstadoDesenho()
    atualizarDesenho({ canetas: { ...atual.canetas, [slot]: { ...atual.canetas[slot], largura: limitarLarguraCaneta(slot, Number(n)) } } }, true)
  }

  const mapa: Record<string, (p?: unknown) => void> = {
    'desenho.selecionar': () => atualizarDesenho({ ferramenta: 'selecionar', slot: null }),
    'desenho.laco': () => atualizarDesenho({ ferramenta: 'laco', slot: null }),
    'desenho.texto': () => atualizarDesenho({ ferramenta: 'texto', slot: null }),
    'desenho.borracha': (p) => {
      const b = lerEstadoDesenho().borracha
      const borracha = p === 'traco' ? { ...b, modo: 'traco' as const }
        : p === 'pequena' || p === 'media' || p === 'grande' ? { tamanho: p as TamanhoBorracha, modo: 'area' as const } : b
      atualizarDesenho({ ferramenta: 'borracha', slot: null, borracha }, true)
    },
    'desenho.toque': () => atualizarDesenho({ toque: !lerEstadoDesenho().toque }, true),
  }
  for (const s of SLOTS_CANETA) {
    mapa[idDoSlot(s)] = (p) => selecionarSlot(s, p)
    mapa[`${idDoSlot(s)}.largura`] = (p) => largura(s, p)
  }
  // Desfazer/refazer só assumem quando há folha livre aberta (nas páginas de texto quem registra é o editor, na casca).
  if (est.folhaAtiva) {
    mapa['edicao.desfazer'] = () => lerEstadoDesenho().acoes.desfazer?.()
    mapa['edicao.refazer'] = () => lerEstadoDesenho().acoes.refazer?.()
  }
  useRegistrarComandos(mapa)

  // Estado dos botões (alternância ativa + cor/largura das canetas)
  useEffect(() => {
    const f = est.ferramenta
    cmd.definirEstado('desenho.selecionar', f === 'selecionar')
    cmd.definirEstado('desenho.laco', f === 'laco')
    cmd.definirEstado('desenho.borracha', f === 'borracha')
    cmd.definirEstado('desenho.texto', f === 'texto')
    cmd.definirEstado('desenho.toque', est.toque)
    for (const s of SLOTS_CANETA) {
      const id = idDoSlot(s)
      cmd.definirEstado(id, est.slot === s && (f === 'caneta' || f === 'marca-texto'))
      cmd.definirEstado(`${id}.cor`, est.canetas[s].cor)
      cmd.definirEstado(`${id}.largura`, est.canetas[s].largura)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [est.ferramenta, est.slot, est.toque, est.canetas])
}
