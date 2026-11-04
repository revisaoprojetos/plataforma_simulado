'use client'

// Botão FLUTUANTE de suporte por WhatsApp (canto inferior direito do portal do aluno, todas as marcas).
// Abre o wa.me com a mensagem pronta e ALTERNA entre os números a cada clique (rodízio): o 1º número de
// cada aluno é sorteado (divide a demanda entre os atendentes) e o índice fica no localStorage.
// No celular sobe acima da down bar; some nos LEITORES (grifos/ferramentas ocupam o rodapé).
import { usePathname } from 'next/navigation'

const NUMEROS = ['556596486736', '556596269997'] // +55 65 9648-6736 · +55 65 9626-9997
const MENSAGEM = 'Quero falar com suporte'
const CHAVE = 'suporte-wa-idx'

// Rotas de leitura em tela cheia: o botão atrapalharia a barra de ferramentas/grifo.
const ESCONDER = [
  /^\/aluno\/biblioteca\/[^/]+/, // leitor da Biblioteca
  /^\/aluno\/nova\/painel\/leitor/, // leitor do painel
  /^\/aluno\/leitura\/[^/]+/, // leitor da Lei Seca
  /^\/aluno\/leitura-rapida/,
]

function proximoNumero(): string {
  let i: number
  try {
    const salvo = localStorage.getItem(CHAVE)
    i = salvo === null ? Math.floor(Math.random() * NUMEROS.length) : (Number(salvo) || 0) % NUMEROS.length
    localStorage.setItem(CHAVE, String((i + 1) % NUMEROS.length))
  } catch {
    i = Math.floor(Math.random() * NUMEROS.length) // sem storage (aba anônima/bloqueado): sorteia
  }
  return NUMEROS[i]
}

export function SuporteWhatsApp() {
  const pathname = usePathname() || ''
  if (ESCONDER.some((r) => r.test(pathname))) return null

  function abrir() {
    const url = `https://wa.me/${proximoNumero()}?text=${encodeURIComponent(MENSAGEM)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <>
      <style>{`
        .sup-wa{position:fixed;right:20px;bottom:calc(env(safe-area-inset-bottom) + 20px);z-index:50;display:inline-flex;align-items:center;gap:10px;height:56px;padding:0 18px 0 14px;border:0;border-radius:999px;background:var(--pn-25d366,#25D366);color:#fff;font:inherit;font-size:14px;font-weight:700;box-shadow:0 10px 28px -8px rgba(0,0,0,.35),0 0 0 1px rgba(0,0,0,.04);cursor:pointer;transition:transform .2s,box-shadow .2s}
        .sup-wa:hover{transform:translateY(-2px);box-shadow:0 14px 32px -8px rgba(0,0,0,.4)}
        .sup-wa:active{transform:scale(.96)}
        .sup-wa:focus-visible{outline:3px solid var(--pn-128c7e,#128C7E);outline-offset:3px}
        .sup-wa .sup-txt{white-space:nowrap}
        @media (max-width:767px){
          .sup-wa{right:16px;bottom:calc(env(safe-area-inset-bottom) + 92px);width:54px;height:54px;padding:0;justify-content:center}
          .sup-wa .sup-txt{display:none}
        }
        @media print{.sup-wa{display:none}}
      `}</style>
      <button type="button" className="sup-wa" onClick={abrir} aria-label="Falar com o suporte no WhatsApp" title="Falar com o suporte no WhatsApp">
        <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true" fill="currentColor">
          <path d="M16.04 3C9.4 3 4 8.36 4 14.97c0 2.11.56 4.17 1.62 5.99L4 29l8.27-2.15a12.1 12.1 0 0 0 3.77.6h.01c6.63 0 12.03-5.36 12.03-11.97C28.08 8.36 22.68 3 16.04 3Zm0 21.9h-.01a10 10 0 0 1-5.08-1.38l-.36-.21-4.91 1.28 1.31-4.77-.24-.38a9.86 9.86 0 0 1-1.52-5.27c0-5.5 4.5-9.97 10.04-9.97 2.68 0 5.2 1.04 7.1 2.93a9.86 9.86 0 0 1 2.94 7.05c0 5.5-4.5 9.97-10.03 9.97Zm5.5-7.46c-.3-.15-1.78-.87-2.06-.97-.28-.1-.48-.15-.68.15-.2.3-.78.97-.96 1.17-.18.2-.35.22-.65.07-.3-.15-1.27-.46-2.42-1.48a9.02 9.02 0 0 1-1.67-2.07c-.18-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.68-1.63-.93-2.23-.25-.58-.5-.5-.68-.51h-.58c-.2 0-.52.07-.8.37-.27.3-1.05 1.02-1.05 2.5 0 1.47 1.07 2.9 1.22 3.1.15.2 2.11 3.2 5.12 4.49.71.31 1.27.5 1.7.63.72.23 1.37.2 1.89.12.58-.09 1.78-.72 2.03-1.42.25-.7.25-1.3.18-1.42-.08-.13-.28-.2-.58-.35Z" />
        </svg>
        <span className="sup-txt">Suporte</span>
      </button>
    </>
  )
}
