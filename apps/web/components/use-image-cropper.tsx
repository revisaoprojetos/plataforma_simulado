'use client'

import { useState } from 'react'
import { ImageCropper, type CropState } from '@/app/admin/simulados/criar/image-cropper'

type AbrirCfg = {
  file?: File
  src?: string
  aspect: number
  titulo?: string
  initialZoom?: number
  initialCenter?: { x: number; y: number }
  onConfirm: (base64: string, state: CropState) => void
}

/**
 * Hook único para o editor "Pan & Zoom" (ImageCropper) — usado em TODA função de adicionar/ajustar
 * imagem de capa/banner/fundo do sistema. `abrir({ file|src, aspect, titulo, onConfirm })` abre o
 * editor; `elemento` deve ser renderizado no componente. Mostra a imagem inteira + retângulo da área
 * (resto escurecido, sem cortar). Ver ImageCropper.
 */
export function useImageCropper() {
  const [cfg, setCfg] = useState<AbrirCfg | null>(null)
  const abrir = (c: AbrirCfg) => setCfg(c)
  const elemento = cfg ? (
    <ImageCropper
      file={cfg.file}
      src={cfg.src}
      aspect={cfg.aspect}
      titulo={cfg.titulo}
      initialZoom={cfg.initialZoom}
      initialCenter={cfg.initialCenter}
      onCancel={() => setCfg(null)}
      onConfirm={(b, s) => { setCfg(null); cfg.onConfirm(b, s) }}
    />
  ) : null
  return { abrir, elemento }
}
