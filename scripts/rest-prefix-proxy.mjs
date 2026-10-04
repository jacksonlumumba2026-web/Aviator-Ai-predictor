// Maps Supabase's /rest/v1/* URL prefix onto a bare PostgREST server (test-only).
import http from "node:http";
const TARGET = { host: "127.0.0.1", port: 54330 };
http
  .createServer((req, res) => {
    const path = req.url.startsWith("/rest/v1") ? req.url.slice("/rest/v1".length) || "/" : req.url;
    const headers = { ...req.headers, host: `${TARGET.host}:${TARGET.port}` };
    delete headers.apikey;
    const up = http.request({ ...TARGET, method: req.method, path, headers }, (r) => {
      res.writeHead(r.statusCode, r.headers);
      r.pipe(res);
    });
    up.on("error", (e) => {
      res.writeHead(502);
      res.end(String(e));
    });
    req.pipe(up);
  })
  .listen(54321, "127.0.0.1");
