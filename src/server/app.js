import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import express from "express";
import { createRoutes } from "./routes.js";
import { registerWebsocket } from "./websocket.js";

export function createApp(options = {}) {
  const app = express();

  app.use(express.json());
  app.use("/api", createRoutes(options));

  app.get("/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  app.use((error, _request, response, _next) => {
    if (error instanceof SyntaxError && "body" in error) {
      response.status(400).json({ error: "Invalid JSON body." });
      return;
    }

    response.status(error.statusCode ?? 500).json({
      error: error.message || "Internal server error."
    });
  });

  return app;
}

export function startServer(options = {}) {
  const port = options.port ?? Number(process.env.PORT ?? 3001);
  const app = createApp(options);
  const server = createServer(app);
  const websocket = registerWebsocket(server, options);

  server.on("error", (error) => {
    console.error(`Server failed: ${error.message}`);
  });

  server.listen(port, () => {
    console.log(`SMMA API listening on port ${port}`);
  });

  return { port, app, server, websocket };
}

const entryFile = fileURLToPath(import.meta.url);

if (process.argv[1] === entryFile) {
  startServer();
}
