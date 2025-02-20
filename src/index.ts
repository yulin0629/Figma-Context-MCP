import { config } from "dotenv";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { FigmaMcpServer } from "./server";

// Load environment variables from .env file
config();

export async function startServer(): Promise<void> {
  const FIGMA_API_KEY = process.env.FIGMA_API_KEY;
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  if (!FIGMA_API_KEY) {
    console.error("FIGMA_API_KEY environment variable is required");
    process.exit(1);
  }

  // At this point we know FIGMA_API_KEY is defined
  const apiKey: string = FIGMA_API_KEY;
  const server = new FigmaMcpServer(apiKey);

  // Check if we're running in stdio mode (e.g., via CLI)
  const isStdioMode = process.env.NODE_ENV === "cli" || process.argv.includes("--stdio");

  if (isStdioMode) {
    console.log("Initializing Figma MCP Server in stdio mode...");
    const transport = new StdioServerTransport();
    await server.connect(transport);
  } else {
    console.log(`Initializing Figma MCP Server in HTTP mode on port ${PORT}...`);
    await server.startHttpServer(PORT);
  }

  console.log("\nAvailable tools:");
  console.log("- get_file: Fetch Figma file information");
  console.log("- get_node: Fetch specific node information");
}

// Only run if this file is being executed directly
if (require.main === module) {
  startServer().catch((error: Error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });
}
