// Re-export the server and its types
export { FigmaMcpServer } from "./mcp.js";
export type { SimplifiedDesign } from "./services/simplify-node-response.js";
export type { FigmaService } from "./services/figma.js";
export { getServerConfig } from "./config.js";
export { startServer } from "./cli.js";

export const Logger = {
  log: (...args: any[]) => {
    console.error("[INFO]", ...args);
  },
  error: (...args: any[]) => {
    console.error("[ERROR]", ...args);
  },
};
