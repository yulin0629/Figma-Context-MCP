import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { FigmaMcpServer } from "./server";
import { getServerConfig } from "./config";

export async function startServer(): Promise<void> {
  const config = getServerConfig();

  const server = new FigmaMcpServer(config.figmaApiKey);

  // Check if we're running in stdio mode (e.g., via CLI)
  const isStdioMode = process.env.NODE_ENV === "cli" || process.argv.includes("--stdio");

  if (isStdioMode) {
    console.log("Initializing Figma MCP Server in stdio mode...");
    const transport = new StdioServerTransport();
    await server.connect(transport);
  } else {
    console.log(`Initializing Figma MCP Server in HTTP mode on port ${config.port}...`);
    await server.startHttpServer(config.port);
  }

  console.log("\nAvailable tools:");
  console.log("- get_file: Fetch Figma file information");
  console.log("- get_node: Fetch specific node information");
}

// If this file is being run directly, start the server
if (require.main === module) {
  startServer().catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });
}
