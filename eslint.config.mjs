import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // Frontières de modules (docs/architecture.md § 4).
  {
    files: ["domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/*", "@/services/*", "@/repositories/*", "@/db/*", "@/app/*", "@/features/*", "@/components/*", "next", "next/*", "react", "drizzle-orm*", "postgres", "@supabase/*"],
              message: "domain/ contient des règles métier pures, sans I/O ni framework.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["repositories/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["@/services/*", "@/app/*", "@/features/*", "@supabase/*"], message: "Un repository n'accède qu'à la base." }] },
      ],
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["lib/auth/**", "proxy.ts", "scripts/**", "tests/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@supabase/*"], message: "Seul lib/auth/ dépend de Supabase (portabilité, D-01)." },
          ],
        },
      ],
    },
  },
  {
    files: ["app/**/*.{ts,tsx}", "features/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@supabase/*"], message: "Seul lib/auth/ dépend de Supabase (portabilité, D-01)." },
            { group: ["@/lib/db/client"], message: "Pas d'accès direct à la connexion propriétaire : passer par les services." },
          ],
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "playwright-report/**", "test-results/**"]),
]);

export default eslintConfig;
