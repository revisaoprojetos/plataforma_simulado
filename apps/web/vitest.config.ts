// Harness de testes de UNIDADE/CONTRATO (E6). Foca a lógica pura e crítica de segurança da
// impersonation (guard read_only + blocklist). O E2E (seção 7.3) fica para Playwright numa
// fase seguinte (precisa do app + banco de teste no ar).
// Config como objeto simples (sem importar 'vitest/config') p/ rodar também via `npx vitest`.
export default {
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'app/**/*.test.ts'],
  },
}
