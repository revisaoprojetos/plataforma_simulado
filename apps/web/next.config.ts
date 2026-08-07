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
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000"],
      // Cadernos do designer podem chegar grandes no PRIMEIRO save (fundos em base64, antes de
      // hospedar). Margem folgada; depois de salvar as imagens viram URL e o doc fica leve.
      bodySizeLimit: "30mb",
    },
  },
};

export default nextConfig;
