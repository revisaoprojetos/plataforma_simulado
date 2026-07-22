import { defineConfig } from 'tsup'

// Bundla a API num único dist/main.js. `noExternal: ['data']` embute o pacote workspace
// compartilhado no bundle → a imagem de runtime não precisa do monorepo/workspace.
// As deps de runtime (NestJS, pg, express) ficam externas e são instaladas via npm no runner.
export default defineConfig({
  entry: ['src/main.ts'],
  format: ['cjs'],
  target: 'node20',
  platform: 'node',
  clean: true,
  noExternal: ['data'],
  skipNodeModulesBundle: true,
})
