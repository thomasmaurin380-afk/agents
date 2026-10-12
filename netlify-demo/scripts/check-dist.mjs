// Contrôle du dossier de déploiement : page d'accueil, ressources locales, aucune trace de backend.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const dist = path.resolve(import.meta.dirname, "..", "dist");
const files = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = path.join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
};
walk(dist);

const fail = (msg) => { console.error(`✘ ${msg}`); process.exitCode = 1; };
if (!files.includes(path.join(dist, "index.html"))) fail("index.html absent à la racine de dist/");
const html = readFileSync(path.join(dist, "index.html"), "utf8");
if (/(src|href)="(https?:)?\/\//.test(html)) fail("index.html référence une ressource externe");
if (!files.some((f) => f.endsWith(".woff2"))) fail("aucune police intégrée (.woff2)");

const FORBIDDEN = [/supabase/i, /SUPABASE_/, /postgres(ql)?:\/\//i, /process\.env\.[A-Z_]*(KEY|SECRET|URL)/, /eyJhbGciOi/];
for (const f of files.filter((x) => /\.(js|css|html)$/.test(x))) {
  const src = readFileSync(f, "utf8");
  for (const re of FORBIDDEN) if (re.test(src)) fail(`${path.relative(dist, f)} contient ${re}`);
  for (const m of src.matchAll(/(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/g)) fail(`${path.relative(dist, f)} : appel réseau « ${m[0]} »`);
}
if (!process.exitCode) console.log(`✔ dist/ : ${files.length} fichiers, index.html à la racine, polices locales, aucune référence à un backend`);
