import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

/**
 * Les composants V4 sont importés tels quels depuis le dépôt (« @/… » = racine du dépôt).
 * Les paquets npm sont toujours résolus dans netlify-demo/node_modules : le projet se construit
 * sans installer l'application principale. Seuls trois modules sont remplacés :
 *  - next/link, next/navigation : équivalents statiques minimes (aucun serveur Next.js) ;
 *  - le fournisseur du mode d'interface : préférence mémorisée dans localStorage ;
 *  - l'action de déconnexion : neutralisée (aucune authentification dans la démonstration).
 */
const REAL_MODE_MODULE = path.resolve(repoRoot, "components/layout/interface-mode.tsx");
const DEMO_MODE_MODULE = path.resolve(here, "src/interface-mode-demo.tsx");

/** Redirige les imports relatifs du fournisseur (ex. AppShell → "./interface-mode") vers la version démo. */
function demoInterfaceMode(): Plugin {
  return {
    name: "demo-interface-mode",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (!importer || importer === DEMO_MODE_MODULE || !source.endsWith("interface-mode")) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      return resolved?.id === REAL_MODE_MODULE ? DEMO_MODE_MODULE : null;
    },
  };
}

const PACKAGES = ["react", "react-dom", "lucide-react", "clsx", "tailwind-merge", "class-variance-authority", "next-themes", "tailwindcss"];

export default defineConfig({
  base: "./",
  plugins: [demoInterfaceMode(), react(), tailwindcss()],
  resolve: {
    alias: [
      { find: "next/link", replacement: path.resolve(here, "src/shims/next-link.tsx") },
      { find: "next/navigation", replacement: path.resolve(here, "src/shims/next-navigation.ts") },
      { find: "@/components/layout/interface-mode", replacement: path.resolve(here, "src/interface-mode-demo.tsx") },
      { find: "@/app/(auth)/actions", replacement: path.resolve(here, "src/shims/auth-actions.ts") },
      { find: /^@\/(.*)$/, replacement: `${repoRoot}/$1` },
    ],
    // Paquets résolus depuis netlify-demo/node_modules, même pour les fichiers du dépôt.
    dedupe: PACKAGES,
  },
  server: { fs: { allow: [repoRoot] } },
  build: { outDir: "dist", emptyOutDir: true, assetsDir: "assets", sourcemap: false, modulePreload: { polyfill: false } },
});
