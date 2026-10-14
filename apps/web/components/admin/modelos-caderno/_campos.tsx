'use client'

// Shim de compatibilidade: os helpers de edição foram movidos para a pasta NEUTRA
// `components/admin/caderno-shared/campos.tsx`, compartilhada pelos DOIS editores
// (Modelos de Caderno e Editor de Cadernos). Este re-export mantém os imports antigos
// funcionando durante a migração — remover quando o modelo-editor apontar direto para lá.
export * from '@/components/admin/caderno-shared/campos'
