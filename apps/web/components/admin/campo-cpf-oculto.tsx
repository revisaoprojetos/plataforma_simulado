'use client'
import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { mascararCpf, ehCpfMascarado } from '@/lib/privacidade/cpf'
import { cn } from '@/lib/utils'

/** Campo de CPF com OLHO: o valor nasce OCULTO (mascarado) e só aparece/edita quando o super-admin clica no olho.
 *  Quem já recebe o CPF mascarado do servidor (perfis sem permissão) não vê o olho — não há o que revelar.
 *  A autorização real é do servidor (`exibidorCpf`); isto só evita expor o número na tela por padrão. */
export function CampoCpfOculto({ value, onChange, disabled, className, placeholder = '000.000.000-00' }: {
  value: string; onChange: (v: string) => void; disabled?: boolean; className?: string; placeholder?: string
}) {
  const [ver, setVer] = useState(false)
  const jaMascarado = ehCpfMascarado(value)
  const podeAlternar = !!value && !jaMascarado && !disabled
  const oculto = podeAlternar && !ver
  return (
    <div className="relative">
      <input
        className={cn(className, podeAlternar && 'pr-10')}
        value={oculto ? (mascararCpf(value) ?? '') : value}
        readOnly={oculto}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
      />
      {podeAlternar && (
        <button type="button" onClick={() => setVer((v) => !v)} aria-label={ver ? 'Ocultar CPF' : 'Mostrar CPF'} title={ver ? 'Ocultar CPF' : 'Mostrar CPF'}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          {ver ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      )}
    </div>
  )
}
