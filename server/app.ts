import express from "express";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import { Server } from "socket.io";
import { ZodError } from "zod";
import { createDatabase, type Database } from "./db/database.ts";
import { ApiError } from "./middleware/auth.ts";
import { authRoutes } from "./routes/auth.ts";
import { queueRoutes } from "./routes/queue.ts";
import type { ErrorRequestHandler } from "express";
export function createLocalApp(options: {
  dbPath?: string;
  database?: Database;
  appUrl?: string;
  log?: (message: string) => void;
}) {
  const db = options.database ?? createDatabase(options.dbPath ?? ":memory:", options.log),
    app = express(),
    http = createServer(app);
  const origins = new Set([options.appUrl ?? "http://localhost:5174"]);
  const appOrigin = new URL(options.appUrl ?? "http://localhost:5174");
  if (appOrigin.hostname === "localhost") {
    appOrigin.hostname = "127.0.0.1";
    origins.add(appOrigin.origin);
  }
  function allowedOrigin(origin: string | undefined) {
    if (!origin || origins.has(origin)) return true;
    const address = http.address();
    return address &&
      typeof address !== "string" &&
      [`http://localhost:${address.port}`, `http://127.0.0.1:${address.port}`].includes(origin)
      ? true
      : false;
  }
  const io = new Server(http, {
    serveClient: false,
    allowRequest: (req, callback) => callback(null, allowedOrigin(req.headers.origin)),
  });
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });
  app.use("/api", (req, _res, next) => {
    if (!allowedOrigin(req.headers.origin))
      return next(new ApiError(403, "INVALID_ORIGIN", "This request origin is not allowed."));
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.get("X-QueueCare-Request") !== "1")
      return next(new ApiError(403, "INVALID_REQUEST", "The request could not be verified."));
    next();
  });
  app.use(express.json({ limit: "16kb" }));
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  const notify = (event: string) => {
    io.emit(event);
    io.emit("queue:updated");
  }; // Invalidation only: no patient identifiers or private payloads.
  app.use("/api/auth", authRoutes(db));
  app.use("/api", queueRoutes(db, notify));
  app.use("/api", (_req, _res, next) =>
    next(new ApiError(404, "NOT_FOUND", "This API endpoint does not exist.")),
  );
  const client = path.resolve("dist/client");
  if (existsSync(path.join(client, "index.html"))) {
    app.use(express.static(client));
    app.use((req, res, next) =>
      req.method === "GET" ? res.sendFile(path.join(client, "index.html")) : next(),
    );
  }
  const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_INPUT",
          message: error.issues[0]?.message ?? "Please check the form fields.",
        },
      });
      return;
    }
    if (error instanceof ApiError) {
      res
        .status(error.status)
        .json({ success: false, error: { code: error.code, message: error.message } });
      return;
    }
    if (error instanceof SyntaxError) {
      res.status(400).json({
        success: false,
        error: { code: "INVALID_JSON", message: "The request body is invalid." },
      });
      return;
    }
    console.error("Local API error:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Unable to complete this request. Please try again.",
      },
    });
  };
  app.use(errors);
  return {
    app,
    http,
    io,
    db,
    close: () =>
      new Promise<void>((resolve) => {
        io.close(async () => {
          if (http.listening)
            http.close(async () => {
              await db.close();
              resolve();
            });
          else {
            await db.close();
            resolve();
          }
        });
      }),
  };
}
