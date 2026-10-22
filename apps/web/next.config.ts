import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: "standalone",
  // Monorepo pnpm: inclui os pacotes do workspace (ex.: `shared`) no build standalone.
  outputFileTracingRoot: path.join(dir, "../../"),
  // mammoth (.docx) e pdfjs-dist (.pdf) usam deps de node / requires dinâmicos — não bundlear.
  serverExternalPackages: ["mammoth", "pdfjs-dist"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "tlaxvhcqswiotzibulyo.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  async headers() {
    // SPIKE Office: o editor OnlyOffice (origem :8082) busca o config.json do nosso plugin
    // (origem :3000) por XHR — precisa de CORS liberado nesses arquivos estáticos.
    return [
      {
        source: "/oo-plugin/:path*",
        headers: [{ key: "Access-Control-Allow-Origin", value: "*" }],
      },
    ];
  },
  experimental: {
    // Turbopack no Windows: a escrita/compactação do cache PERSISTENTE de disco em dev estoura a RAM
    // (chega a ~20GB e trava o PC). Com TURBOPACK_FS_CACHE=off o dev roda SEM esse cache — cold start
    // fica um pouco mais lento, mas sem o pico de memória. Inerte para CI/build (usa outra flag) e p/
    // quem não define a env. Ligado pelo script de subir o localhost nesta máquina.
    ...(process.env.TURBOPACK_FS_CACHE === "off" ? { turbopackFileSystemCacheForDev: false } : {}),
    serverActions: {
      allowedOrigins: ["localhost:3000"],
      // Cadernos do designer podem chegar grandes no PRIMEIRO save (fundos em base64, antes de
      // hospedar). Importação da Biblioteca envia o arquivo em base64 (1 por chamada) — a base64
      // infla ~37%, então 120mb cobre arquivos de até ~85MB (PDFs/.docx grandes de material).
      bodySizeLimit: "120mb",
    },
  },
};

export default nextConfig;
