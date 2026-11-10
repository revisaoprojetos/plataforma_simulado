import { defineConfig } from 'vite';

// 5173 é a origem liberada no CORS da API e em allowedDomains das empresas do seed.
export default defineConfig({
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
});
