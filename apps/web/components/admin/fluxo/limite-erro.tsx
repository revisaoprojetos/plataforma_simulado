'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'

/** Error boundary: se o canvas (biblioteca de terceiros) falhar, mostra o `fallback` (visualização SVG) e o resto da aba segue funcionando. */
export class LimiteErro extends Component<{ children: ReactNode; fallback: ReactNode; resetKey?: string }, { erro: boolean }> {
  state = { erro: false }
  static getDerivedStateFromError() { return { erro: true } }
  componentDidCatch(e: Error, info: ErrorInfo) { console.error('[fluxo] canvas falhou, usando a visualização simples', e, info.componentStack) }
  componentDidUpdate(prev: { resetKey?: string }) { if (this.state.erro && prev.resetKey !== this.props.resetKey) this.setState({ erro: false }) }
  render() {
    if (!this.state.erro) return this.props.children
    return (
      <div className="space-y-2">
        <p className="rounded-md border border-dashed border-amber-500 bg-amber-500/10 px-3 py-1.5 text-xs text-muted-foreground">O canvas não pôde ser carregado; exibindo a visualização simples. A edição pelo painel continua disponível.</p>
        {this.props.fallback}
      </div>
    )
  }
}
