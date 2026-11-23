'use client'
// Singleton (módulo do cliente) da fila de criação otimista de páginas: a casca registra, o editor lê (página 'criando' abre em branco, sem
// GET) e o autosave espera a criação antes do 1º PATCH. Lógica pura em lib/aluno/notebook-criacao.ts.
import { criarFilaCriacao } from '@/lib/aluno/notebook-criacao'

export const filaCriacao = criarFilaCriacao()
