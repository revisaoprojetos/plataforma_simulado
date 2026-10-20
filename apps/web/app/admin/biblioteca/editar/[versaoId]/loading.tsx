import { Loader2 } from 'lucide-react'

// Fallback instantâneo enquanto o servidor resolve a página do editor (assina a URL do storage, etc.) —
// evita a tela em branco/"piscando" no 1º acesso (sobretudo no dev, onde a rota ainda compila).
export default function LoadingEditor() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      <p className="text-sm">Abrindo o editor…</p>
    </div>
  )
}
