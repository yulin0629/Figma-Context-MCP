import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { FigmaService, type FigmaAuthOptions } from "./services/figma.js";
import type { SimplifiedDesign } from "./services/simplify-node-response.js";
import yaml from "js-yaml";
import { Logger } from "./utils/logger.js";

const serverInfo = {
  name: "Figma MCP Server",
  version: process.env.NPM_PACKAGE_VERSION ?? "unknown",
};

type CreateServerOptions = {
  isHTTP?: boolean;
  outputFormat?: "yaml" | "json";
};

function createServer(
  authOptions: FigmaAuthOptions,
  { isHTTP = false, outputFormat = "yaml" }: CreateServerOptions = {},
) {
  const server = new McpServer(serverInfo);
  // const figmaService = new FigmaService(figmaApiKey);
  const figmaService = new FigmaService(authOptions);
  registerTools(server, figmaService, outputFormat);

  Logger.isHTTP = isHTTP;

  return server;
}

function registerTools(
  server: McpServer,
  figmaService: FigmaService,
  outputFormat: "yaml" | "json",
): void {
  // Tool to get file information
  server.tool(
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
          "OPTIONAL. Do NOT use unless explicitly requested by the user. Controls how many levels deep to traverse the node tree,",
        ),
    },
    async ({ fileKey, nodeId, depth }) => {
      try {
        Logger.log(
          `Fetching ${
            depth ? `${depth} layers deep` : "all layers"
          } of ${nodeId ? `node ${nodeId} from file` : `full file`} ${fileKey}`,
        );

        let file: SimplifiedDesign;
        if (nodeId) {
          file = await figmaService.getNode(fileKey, nodeId, depth);
        } else {
          file = await figmaService.getFile(fileKey, depth);
        }

        Logger.log(`Successfully fetched file: ${file.name}`);
        const { nodes, globalVars, ...metadata } = file;

        const result = {
          metadata,
          nodes,
          globalVars,
        };

        Logger.log(`Generating ${outputFormat.toUpperCase()} result from file`);
        const formattedResult =
          outputFormat === "json" ? JSON.stringify(result, null, 2) : yaml.dump(result);

        Logger.log("Sending result to client");
        return {
          content: [{ type: "text", text: formattedResult }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : JSON.stringify(error);
        Logger.error(`Error fetching file ${fileKey}:`, message);
        return {
          isError: true,
          content: [{ type: "text", text: `Error fetching file: ${message}` }],
        };
      }
    },
  );

  // TODO: Clean up all image download related code, particularly getImages in Figma service
  // Tool to download images
  server.tool(
    "download_figma_images",
    "Download SVG and PNG images used in a Figma file based on the IDs of image or icon nodes",
    {
      fileKey: z.string().describe("The key of the Figma file containing the node"),
      nodes: z
        .object({
          nodeId: z
            .string()
            .describe("The ID of the Figma image node to fetch, formatted as 1234:5678"),
          imageRef: z
            .string()
            .optional()
            .describe(
              "If a node has an imageRef fill, you must include this variable. Leave blank when downloading Vector SVG images.",
            ),
          fileName: z.string().describe("The local name for saving the fetched file"),
        })
        .array()
        .describe("The nodes to fetch as images"),
      pngScale: z
        .number()
        .positive()
        .optional()
        .default(2)
        .describe(
          "Export scale for PNG images. Optional, defaults to 2 if not specified. Affects PNG images only.",
        ),
      localPath: z
        .string()
        .describe(
          "The absolute path to the directory where images are stored in the project. If the directory does not exist, it will be created. The format of this path should respect the directory format of the operating system you are running on. Don't use any special character escaping in the path name either.",
        ),
      svgOptions: z
        .object({
          outlineText: z
            .boolean()
            .optional()
            .default(true)
            .describe("Whether to outline text in SVG exports. Default is true."),
          includeId: z
            .boolean()
            .optional()
            .default(false)
            .describe("Whether to include IDs in SVG exports. Default is false."),
          simplifyStroke: z
            .boolean()
            .optional()
            .default(true)
            .describe("Whether to simplify strokes in SVG exports. Default is true."),
        })
        .optional()
        .default({})
        .describe("Options for SVG export"),
    },
    async ({ fileKey, nodes, localPath, svgOptions, pngScale }) => {
      try {
        const imageFills = nodes.filter(({ imageRef }) => !!imageRef) as {
          nodeId: string;
          imageRef: string;
          fileName: string;
        }[];
        const fillDownloads = figmaService.getImageFills(fileKey, imageFills, localPath);
        const renderRequests = nodes
          .filter(({ imageRef }) => !imageRef)
          .map(({ nodeId, fileName }) => ({
            nodeId,
            fileName,
            fileType: fileName.endsWith(".svg") ? ("svg" as const) : ("png" as const),
          }));

        const renderDownloads = figmaService.getImages(
          fileKey,
          renderRequests,
          localPath,
          pngScale,
          svgOptions,
        );

        const downloads = await Promise.all([fillDownloads, renderDownloads]).then(([f, r]) => [
          ...f,
          ...r,
        ]);

        // If any download fails, return false
        const saveSuccess = !downloads.find((success) => !success);
        return {
          content: [
            {
              type: "text",
              text: saveSuccess
                ? `Success, ${downloads.length} images downloaded: ${downloads.join(", ")}`
                : "Failed",
            },
          ],
        };
      } catch (error) {
        Logger.error(`Error downloading images from file ${fileKey}:`, error);
        return {
          isError: true,
          content: [{ type: "text", text: `Error downloading images: ${error}` }],
        };
      }
    },
  );

  // Tool to analyze depth distribution
  server.tool(
    "analyze_figma_depth",
    "Analyze the depth distribution of a Figma file to help determine optimal depth limit",
    {
      fileKey: z
        .string()
        .describe(
          "The key of the Figma file to analyze, often found in a provided URL like figma.com/(file|design)/<fileKey>/...",
        ),
      nodeId: z
        .string()
        .optional()
        .describe(
          "The ID of the specific node to analyze, often found as URL parameter node-id=<nodeId>",
        ),
    },
    async ({ fileKey, nodeId }) => {
      try {
        Logger.log(
          `Analyzing depth distribution for ${nodeId ? `node ${nodeId} from file` : `full file`} ${fileKey}`,
        );

        // Get raw data to analyze
        const rawData = await figmaService.getRawData(fileKey, nodeId);
        
        // Analyze depth distribution
        const stats = analyzeDepthDistribution(rawData, nodeId);
        
        // Format analysis report
        const report = formatDepthAnalysis(stats);
        
        Logger.log("Sending depth analysis report to client");
        return {
          content: [{ type: "text", text: report }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : JSON.stringify(error);
        Logger.error(`Error analyzing file ${fileKey}:`, message);
        return {
          isError: true,
          content: [{ type: "text", text: `Error analyzing file: ${message}` }],
        };
      }
    },
  );
}

// Helper types for depth analysis
interface DepthStats {
  maxDepth: number;
  totalNodes: number;
  depthCount: Record<number, number>;
  depthNodes: Record<number, Array<{ name: string; type: string }>>;
  depthCharCount: Record<number, number>;
  totalChars: number;
}

// Analyze depth distribution
function analyzeDepthDistribution(rawData: any, nodeId?: string): DepthStats {
  const stats: DepthStats = {
    maxDepth: 0,
    totalNodes: 0,
    depthCount: {},
    depthNodes: {},
    depthCharCount: {},
    totalChars: 0,
  };

  let documentNode: any;
  if (nodeId && rawData.nodes) {
    const nodeKey = Object.keys(rawData.nodes)[0];
    documentNode = rawData.nodes[nodeKey]?.document;
  } else {
    documentNode = rawData.document;
  }

  if (documentNode) {
    analyzeNode(documentNode, 0, stats);
  }

  return stats;
}

function analyzeNode(node: any, depth: number, stats: DepthStats): void {
  if (!node || (node.visible !== undefined && !node.visible)) return;

  // Update statistics
  stats.totalNodes++;
  stats.maxDepth = Math.max(stats.maxDepth, depth);

  // Count nodes at this depth
  if (!stats.depthCount[depth]) {
    stats.depthCount[depth] = 0;
    stats.depthNodes[depth] = [];
    stats.depthCharCount[depth] = 0;
  }
  stats.depthCount[depth]++;

  // Record example nodes (max 3)
  if (stats.depthNodes[depth].length < 3) {
    stats.depthNodes[depth].push({
      name: node.name || 'Unnamed',
      type: node.type || 'Unknown',
    });
  }

  // Calculate character count for size estimation
  let nodeChars = 0;
  // Basic node info
  nodeChars += (node.id || '').length;
  nodeChars += (node.name || '').length;
  nodeChars += (node.type || '').length;
  
  // Text content
  if (node.characters) {
    nodeChars += node.characters.length;
  }
  
  // Styles and properties (estimation)
  if (node.style) {
    nodeChars += 200; // Average style info length
  }
  if (node.fills && Array.isArray(node.fills)) {
    nodeChars += 100 * node.fills.length;
  }
  if (node.effects && Array.isArray(node.effects)) {
    nodeChars += 150 * node.effects.length;
  }
  
  // Update character statistics
  stats.depthCharCount[depth] += nodeChars;
  stats.totalChars += nodeChars;

  // Recursively process children
  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) {
      analyzeNode(child, depth + 1, stats);
    }
  }
}

function formatDepthAnalysis(stats: DepthStats): string {
  let report = '📊 深度分析結果:\n';
  report += `   最大深度: ${stats.maxDepth}\n`;
  report += `   總節點數: ${stats.totalNodes}\n`;
  
  // Estimate size and tokens
  const totalSizeKb = stats.totalChars / 1024;
  // YAML format is about 1.2x original chars, simplified is about 0.8x
  const yamlSizeEstimate = totalSizeKb * 1.2 * 0.8;
  // Generally, 1 token ≈ 4 characters
  const totalTokens = Math.floor(stats.totalChars / 4);
  
  report += `   預估大小: ~${yamlSizeEstimate.toFixed(1)} KB (YAML)\n`;
  report += `   預估 tokens: ~${totalTokens.toLocaleString()} tokens\n\n`;
  report += '   各深度節點分布:\n';

  let cumulativePercent = 0;
  let cumulativeChars = 0;
  const depths = Object.keys(stats.depthCount).map(Number).sort((a, b) => a - b);

  for (const depth of depths) {
    const count = stats.depthCount[depth];
    const percent = (count / stats.totalNodes) * 100;
    cumulativePercent += percent;
    
    // Calculate cumulative chars and size
    const depthChars = stats.depthCharCount[depth] || 0;
    cumulativeChars += depthChars;
    const cumulativeSizeKb = (cumulativeChars / 1024) * 1.2 * 0.8; // YAML estimate
    const cumulativeTokens = Math.floor(cumulativeChars / 4);
    
    report += `   深度 ${depth}: ${count.toString().padStart(4)} 個節點 (${percent.toFixed(1).padStart(5)}%) [累計: ${cumulativePercent.toFixed(1).padStart(5)}%] ` +
              `~${cumulativeSizeKb.toFixed(1)}KB/${cumulativeTokens.toLocaleString()}tokens\n`;
    
    // Show example nodes
    if (stats.depthNodes[depth].length > 0) {
      for (const example of stats.depthNodes[depth].slice(0, 2)) {
        const truncatedName = example.name.length > 30 ? example.name.substring(0, 30) + '...' : example.name;
        report += `           例: ${example.type} - ${truncatedName}\n`;
      }
    }
  }

  report += '\n💡 建議:\n';
  
  // Provide recommendations based on distribution
  if (stats.maxDepth <= 3) {
    report += '   檔案結構較淺，不需要設定深度限制\n';
  } else if (stats.maxDepth <= 5) {
    report += '   建議深度限制: 3-4\n';
  } else {
    // Find depth containing 80% of nodes
    const targetPercent = 80;
    let cumulative = 0;
    let suggestedDepth = 0;
    
    for (const depth of depths) {
      cumulative += (stats.depthCount[depth] / stats.totalNodes) * 100;
      if (cumulative >= targetPercent) {
        suggestedDepth = depth;
        break;
      }
    }
    
    // Calculate suggested depth size estimation
    let suggestedChars = 0;
    for (let d = 0; d <= suggestedDepth; d++) {
      suggestedChars += stats.depthCharCount[d] || 0;
    }
    const suggestedSizeKb = (suggestedChars / 1024) * 1.2 * 0.8;
    const suggestedTokens = Math.floor(suggestedChars / 4);
    
    report += `   建議深度限制: ${suggestedDepth} (包含 ${cumulative.toFixed(1)}% 的節點)\n`;
    report += `   預估輸出: ~${suggestedSizeKb.toFixed(1)} KB / ~${suggestedTokens.toLocaleString()} tokens\n`;
    report += `   如需更多細節，可試試深度 ${suggestedDepth + 1} 或 ${suggestedDepth + 2}\n`;
  }

  // Performance optimization tips
  if (stats.totalNodes > 1000) {
    report += '\n   ⚡ 效能優化:\n';
    report += `   由於節點數量較多（${stats.totalNodes} 個），建議使用深度參數減少 API 傳輸量\n`;
    report += '   這會在 API 層級限制資料，加快下載速度\n';
  }

  return report;
}

export { createServer };
