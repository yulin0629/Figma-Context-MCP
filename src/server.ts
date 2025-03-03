import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { FigmaService } from "./services/figma";
import express, { Request, Response } from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { IncomingMessage, ServerResponse } from "http";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { SimplifiedDesign } from "./services/simplify-node-response";

export class FigmaMcpServer {
  private readonly server: McpServer;
  private readonly figmaService: FigmaService;
  private sseTransport: SSEServerTransport | null = null;

  constructor(figmaApiKey: string) {
    this.figmaService = new FigmaService(figmaApiKey);
    this.server = new McpServer({
      name: "Figma MCP Server",
      version: "0.1.5",
    });

    this.registerTools();
  }

  private registerTools(): void {
    // Tool to get file information
    this.server.tool(
      "get_figma_data",
      "When the nodeId cannot be obtained, obtain the layout information about the entire Figma file",
      {
        fileKey: z
          .string()
          .describe(
            "The key of the Figma file to fetch, often found in a provided URL like figma.com/(file|design)/<fileKey>/...",
          ),
        nodeId: z
          .string()
          .optional()
          .describe(
            "The ID of the node to fetch, often found as URL parameter node-id=<nodeId>, always use if provided",
          ),
        depth: z
          .number()
          .optional()
          .describe(
            "How many levels deep to traverse the node tree, only use if explicitly requested by the user",
          ),
      },
      async ({ fileKey, nodeId, depth }) => {
        try {
          console.log(
            `Fetching ${
              depth ? `${depth} layers deep` : "all layers"
            } of ${nodeId ? `node ${nodeId} from file` : `full file`} ${fileKey} at depth: ${
              depth ?? "all layers"
            }`,
          );

          let file: SimplifiedDesign;
          if (nodeId) {
            file = await this.figmaService.getNode(fileKey, nodeId, depth);
          } else {
            file = await this.figmaService.getFile(fileKey, depth);
          }

          console.log(`Successfully fetched file: ${file.name}`);
          const { nodes, globalVars, ...metadata } = file;

          // Stringify each node individually to try to avoid max string length error with big files
          const nodesJson = `[${nodes.map((node) => JSON.stringify(node, null, 2)).join(",")}]`;
          const metadataJson = JSON.stringify(metadata, null, 2);
          const globalVarsJson = JSON.stringify(globalVars, null, 2);
          const resultJson = `{ "metadata": ${metadataJson}, "nodes": ${nodesJson}, "globalVars": ${globalVarsJson} }`;

          return {
            content: [{ type: "text", text: resultJson }],
          };
        } catch (error) {
          console.error(`Error fetching file ${fileKey}:`, error);
          return {
            content: [{ type: "text", text: `Error fetching file: ${error}` }],
          };
        }
      },
    );

    // Tool to download images
    this.server.tool(
      "download_figma_images",
      "Download SVG or PNG images used in a Figma file based on the IDs of image or icon nodes",
      {
        fileKey: z.string().describe("The key of the Figma file containing the node"),
        nodes: z
          .object({
            nodeId: z
              .string()
              .describe("The Figma ID of the node to fetch, formatted as 1234:5678"),
            fileName: z.string().describe("The local name for saving the fetched file"),
          })
          .array()
          .describe("The nodes to fetch as images"),
        localPath: z
          .string()
          .describe(
            "The absolute path to the directory where images are stored in the project. Automatically creates directories if needed.",
          ),
      },
      async ({ fileKey, nodes, localPath }) => {
        try {
          const downloads = nodes.map(({ nodeId, fileName }) => {
            console.log(`get image "${nodeId}", saving to: ${localPath}/${fileName}`);
            const fileType = fileName.endsWith(".svg") ? "svg" : "png";
            return this.figmaService.getImage(fileKey, nodeId, fileName, localPath, fileType);
          });

          // If any download fails, return false
          const saveSuccess = !(await Promise.all(downloads)).find((success) => !success);
          return {
            content: [{ type: "text", text: saveSuccess ? "Success" : "Failed" }],
          };
        } catch (error) {
          console.error(`Error downloading images from file ${fileKey}:`, error);
          return {
            content: [{ type: "text", text: `Error downloading images: ${error}` }],
          };
        }
      },
    );
  }

  async connect(transport: Transport): Promise<void> {
    console.log("Connecting to transport...");
    await this.server.connect(transport);
    console.log("Server connected and ready to process requests");
  }

  async startHttpServer(port: number): Promise<void> {
    const app = express();

    app.get("/sse", async (req: Request, res: Response) => {
      console.log("New SSE connection established");
      this.sseTransport = new SSEServerTransport(
        "/messages",
        res as unknown as ServerResponse<IncomingMessage>,
      );
      await this.server.connect(this.sseTransport);
    });

    app.post("/messages", async (req: Request, res: Response) => {
      if (!this.sseTransport) {
        // @ts-expect-error Not sure why Express types aren't working
        res.sendStatus(400);
        return;
      }
      await this.sseTransport.handlePostMessage(
        req as unknown as IncomingMessage,
        res as unknown as ServerResponse<IncomingMessage>,
      );
    });

    app.listen(port, () => {
      console.log(`HTTP server listening on port ${port}`);
      console.log(`SSE endpoint available at http://localhost:${port}/sse`);
      console.log(`Message endpoint available at http://localhost:${port}/messages`);
    });
  }
}
