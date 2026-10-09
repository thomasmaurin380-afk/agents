// Passerelle de TEST : reproduit le routage Supabase « /auth/v1/* → GoTrue » et
// « /storage/v1/* → Storage API » pour la pile docker/compose.test.yml. Jamais utilisée en production.
import http from "node:http";

const PORT = Number(process.env.GATEWAY_PORT ?? 54321);
const ROUTES = [
  { prefix: "/auth/v1", target: new URL(process.env.GOTRUE_URL ?? "http://127.0.0.1:54329") },
  { prefix: "/storage/v1", target: new URL(process.env.STORAGE_URL ?? "http://127.0.0.1:54328") },
];

const server = http.createServer((req, res) => {
  const route = ROUTES.find((r) => req.url?.startsWith(r.prefix + "/"));
  if (!route) {
    res.writeHead(404).end();
    return;
  }
  const upstream = http.request(
    {
      hostname: route.target.hostname,
      port: route.target.port,
      path: req.url.slice(route.prefix.length),
      method: req.method,
      headers: { ...req.headers, host: route.target.host },
    },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on("error", () => res.writeHead(502).end());
  req.pipe(upstream);
});

server.listen(PORT, "127.0.0.1", () => {
  for (const r of ROUTES) console.log(`gateway: http://127.0.0.1:${PORT}${r.prefix} -> ${r.target.origin}`);
});
