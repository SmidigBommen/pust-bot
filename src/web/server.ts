import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { ReportRepository } from "../storage/report-repository.js";
import { archivePage, emptyPage, favicon, notFoundPage, reportPage } from "./pages.js";
import { styles } from "./styles.js";

export type ReportAccess = (request: IncomingMessage, response: ServerResponse) => boolean | Promise<boolean>;

interface WebOptions {
  port: number;
  host?: string;
  reports: Pick<ReportRepository, "list" | "find">;
  /** All report routes pass through this gate, ready for a later login slice. */
  authorize?: ReportAccess;
  onError?: (error: unknown) => void;
}

export function startArchiveServer(options: WebOptions): Promise<Server> {
  const server = createServer((request, response) => {
    response.setHeader("X-Robots-Tag", "noindex, nofollow");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    response.setHeader("Cache-Control", "no-store");
    const send = (status: number, type: string, body: string): void => {
      response.writeHead(status, { "Content-Type": `${type}; charset=utf-8` });
      response.end(request.method === "HEAD" ? undefined : body);
    };
    void (async () => {
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.setHeader("Allow", "GET, HEAD");
        send(405, "text/plain", "Metoden er ikke tillatt.");
        return;
      }
      const path = new URL(request.url ?? "/", "http://localhost").pathname;
      if (path === "/health") { send(200, "application/json", '{"status":"ok"}'); return; }
      if (path === "/robots.txt") { send(200, "text/plain", "User-agent: *\nDisallow: /\n"); return; }
      if (path === "/assets/pust.css") { send(200, "text/css", styles); return; }
      if (path === "/favicon.svg") { send(200, "image/svg+xml", favicon); return; }

      if (options.authorize && !await options.authorize(request, response)) {
        if (!response.writableEnded) send(403, "text/plain", "Du har ikke tilgang til arkivet.");
        return;
      }
      if (path === "/" || path === "/arkiv") {
        const reports = options.reports.list();
        send(200, "text/html", path === "/arkiv" ? archivePage(reports) : reports[0] ? reportPage(reports[0], reports) : emptyPage());
        return;
      }
      const match = /^\/uker\/(\d{4}-\d{2}-\d{2})$/.exec(path);
      const report = match ? options.reports.find(match[1]!) : null;
      if (report) { send(200, "text/html", reportPage(report, options.reports.list())); return; }
      send(404, "text/html", notFoundPage());
    })().catch(error => {
      options.onError?.(error);
      if (!response.headersSent) send(500, "text/plain", "Arkivet er midlertidig utilgjengelig.");
      else response.end();
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host ?? "0.0.0.0", () => {
      server.off("error", reject);
      resolve(server);
    });
  });
}
