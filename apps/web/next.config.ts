import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: "standalone",
  // Monorepo pnpm: inclui os pacotes do workspace (ex.: `shared`) no build standalone.
  outputFileTracingRoot: path.join(dir, "../../"),
  // mammoth (parser .docx) usa deps de node / requires dinâmicos — não bundlear.
  serverExternalPackages: ["mammoth"],
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
      // Cadernos do designer podem ficar grandes (imagens, muitos blocos) — sobe o limite do body.
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
