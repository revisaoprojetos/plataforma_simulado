import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

// Domínios custom extras p/ liberar server actions (CSV), sem precisar editar+rebuildar a cada novo tenant
// com domínio próprio: defina SERVER_ACTION_ORIGINS="simulado.novocliente.com.br,..." no stack.
const SERVER_ACTION_HOSTS = (process.env.SERVER_ACTION_ORIGINS || "")
  .split(",").map((s) => s.trim()).filter(Boolean);

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
      // Server actions atrás do Traefik em DOMÍNIO CUSTOM: o Next valida a origem contra o host; se o
      // x-forwarded-host (domínio público do tenant) não for confiável, a action é REJEITADA no servidor
      // ("An error occurred in the Server Components render") — foi o que deixava o Lab do MEQ sem selecionar
      // simulado / gerar prévia. Liberamos os domínios conhecidos (+ *.revisaopge.com.br p/ os subdomínios)
      // e os extras de SERVER_ACTION_ORIGINS (env) para novos domínios custom sem rebuild. localhost p/ dev.
      allowedOrigins: ["localhost:3000", "*.revisaopge.com.br", "simulado.meqconcursos.com.br", "simulado.vocenadefensoria.com.br", ...SERVER_ACTION_HOSTS],
      // allowedForwardedHosts: atrás do Traefik o `x-forwarded-host` (domínio público do tenant) difere do
      // Host interno; o Next rejeita a server action se esse forwarded host não for confiável. O tipo do
      // Next 16 não lista essa chave, mas o RUNTIME usa — por isso entra via spread (bypassa o excess-check).
      ...{ allowedForwardedHosts: ["*.revisaopge.com.br", "simulado.meqconcursos.com.br", "simulado.vocenadefensoria.com.br", ...SERVER_ACTION_HOSTS] },
      // Cadernos do designer podem chegar grandes no PRIMEIRO save (fundos em base64, antes de
      // hospedar). Importação da Biblioteca envia o arquivo em base64 (1 por chamada) — a base64
      // infla ~37%, então 120mb cobre arquivos de até ~85MB (PDFs/.docx grandes de material).
      bodySizeLimit: "120mb",
    },
  },
};

export default nextConfig;
