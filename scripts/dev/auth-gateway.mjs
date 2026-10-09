// Passerelle de TEST : reproduit le routage Supabase « /auth/v1/* → GoTrue »
// pour la pile docker/compose.test.yml. Jamais utilisée en production.
import http from "node:http";

const PORT = Number(process.env.GATEWAY_PORT ?? 54321);
const TARGET = new URL(process.env.GOTRUE_URL ?? "http://127.0.0.1:54329");

const server = http.createServer((req, res) => {
  if (!req.url?.startsWith("/auth/v1/")) {
    res.writeHead(404).end();
    return;
  }
  const upstream = http.request(
    {
      hostname: TARGET.hostname,
      port: TARGET.port,
      path: req.url.slice("/auth/v1".length),
      method: req.method,
      headers: { ...req.headers, host: TARGET.host },
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
  console.log(`auth-gateway: http://127.0.0.1:${PORT}/auth/v1 -> ${TARGET.origin}`);
});
