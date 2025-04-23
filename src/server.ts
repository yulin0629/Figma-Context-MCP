import { randomUUID } from "node:crypto";
import express, { Request, Response } from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { Server } from "http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Logger } from "./index.js";

let httpServer: Server | null = null;
const transports = {
  streamable: {} as Record<string, StreamableHTTPServerTransport>,
  sse: {} as Record<string, SSEServerTransport>,
};

export async function startHttpServer(port: number, server: McpServer): Promise<void> {
  const app = express();
  app.use(express.json());

  // Modern Streamable HTTP endpoint
  app.post("/mcp", async (req, res) => {
    Logger.log("Received StreamableHTTP request");
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    Logger.log("Session ID:", sessionId);
    Logger.log("Headers:", req.headers);
    Logger.log("Body:", req.body);
    Logger.log("Is Initialize Request:", isInitializeRequest(req.body));
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports.streamable[sessionId]) {
      // Reuse existing transport
      Logger.log("Reusing existing StreamableHTTP transport for sessionId", sessionId);
      transport = transports.streamable[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      Logger.log("New initialization request for StreamableHTTP sessionId", sessionId);
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId) => {
          // Store the transport by session ID
          transports.streamable[sessionId] = transport;
        },
      });
      transport.onclose = () => {
        if (transport.sessionId) {
          delete transports.streamable[transport.sessionId];
        }
      };
      await server.connect(transport);
    } else {
      // Invalid request
      Logger.log("Invalid request:", req.body);
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: No valid session ID provided",
        },
        id: null,
      });
      return;
    }

    let progressInterval: NodeJS.Timeout | null = null;
    const progressToken = req.body.params?._meta?.progressToken;
    let progress = 0;
    if (progressToken) {
      Logger.log(
        `Setting up progress notifications for token ${progressToken} on session ${sessionId}`,
      );
      progressInterval = setInterval(async () => {
        await server.server.notification({
          method: "notifications/progress",
          params: {
            progress,
            progressToken,
          },
        });
        progress++;
      }, 1000);
    }

    Logger.log("Handling StreamableHTTP request");
    await transport.handleRequest(req, res, req.body);

    if (progressInterval) {
      clearInterval(progressInterval);
    }
    Logger.log("StreamableHTTP request handled");
  });

  // Handle GET requests for SSE streams (using built-in support from StreamableHTTP)
  app.get("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports.streamable[sessionId]) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }

    // Check for Last-Event-ID header for resumability
    const lastEventId = req.headers["last-event-id"] as string | undefined;
    if (lastEventId) {
      console.log(`Client reconnecting with Last-Event-ID: ${lastEventId}`);
    } else {
      console.log(`Establishing new SSE stream for session ${sessionId}`);
    }

    const transport = transports.streamable[sessionId];
    await transport.handleRequest(req, res);
  });

  // Handle DELETE requests for streamable session termination (according to MCP spec)
  app.delete("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports.streamable[sessionId]) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }

    console.log(`Received session termination request for session ${sessionId}`);

    try {
      const transport = transports.streamable[sessionId];
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error("Error handling session termination:", error);
      if (!res.headersSent) {
        res.status(500).send("Error processing session termination");
      }
    }
  });

  app.get("/sse", async (req: Request, res: Response) => {
    Logger.log("Establishing new SSE connection");
    const transport = new SSEServerTransport("/messages", res);
    Logger.log(`New SSE connection established for sessionId ${transport.sessionId}`);

    transports.sse[transport.sessionId] = transport;
    res.on("close", () => {
      delete transports.sse[transport.sessionId];
    });

    await server.connect(transport);
  });

  app.post("/messages", async (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string;
    const transport = transports.sse[sessionId];
    if (transport) {
      Logger.log(`Received message for sessionId ${sessionId}`);
      await transport.handlePostMessage(req, res);
    } else {
      res.status(400).send(`No transport found for sessionId ${sessionId}`);
      return;
    }
  });

  httpServer = app.listen(port, () => {
    Logger.log(`HTTP server listening on port ${port}`);
    Logger.log(`SSE endpoint available at http://localhost:${port}/sse`);
    Logger.log(`Message endpoint available at http://localhost:${port}/messages`);
    Logger.log(`StreamableHTTP endpoint available at http://localhost:${port}/mcp`);
  });

  process.on("SIGINT", async () => {
    Logger.log("Shutting down server...");

    // Close all active transports to properly clean up resources
    await closeTransports(transports.sse);
    await closeTransports(transports.streamable);

    Logger.log("Server shutdown complete");
    process.exit(0);
  });
}

async function closeTransports(
  transports: Record<string, SSEServerTransport | StreamableHTTPServerTransport>,
) {
  for (const sessionId in transports) {
    try {
      await transports[sessionId].close();
      delete transports[sessionId];
    } catch (error) {
      console.error(`Error closing transport for session ${sessionId}:`, error);
    }
  }
}

export async function stopHttpServer(): Promise<void> {
  if (!httpServer) {
    throw new Error("HTTP server is not running");
  }

  return new Promise((resolve, reject) => {
    httpServer!.close((err: Error | undefined) => {
      if (err) {
        reject(err);
        return;
      }
      httpServer = null;
      const closing = Object.values(transports.sse).map((transport) => {
        return transport.close();
      });
      Promise.all(closing).then(() => {
        resolve();
      });
    });
  });
}
