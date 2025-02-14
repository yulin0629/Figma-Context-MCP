import axios, { AxiosError } from "axios";
import { FigmaError } from "~/types/figma";
import fs from "fs";
import { parseFigmaResponse, SimplifiedDesign } from "./simplify-node-response";
import type { GetFileResponse, GetFileNodesResponse } from "@figma/rest-api-spec";

export class FigmaService {
  private readonly apiKey: string;
  private readonly baseUrl = "https://api.figma.com/v1";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(endpoint: string): Promise<T> {
    try {
      console.log(`Calling ${this.baseUrl}${endpoint}`);
      const response = await axios.get(`${this.baseUrl}${endpoint}`, {
        headers: {
          "X-Figma-Token": this.apiKey,
        },
      });

      return response.data;
    } catch (error) {
      if (error instanceof AxiosError && error.response) {
        throw {
          status: error.response.status,
          err: (error.response.data as { err?: string }).err || "Unknown error",
        } as FigmaError;
      }
      throw new Error("Failed to make request to Figma API");
    }
  }

  async getFile(fileKey: string, depth?: number): Promise<GetFileResponse> {
    const endpoint = `/files/${fileKey}${depth ? `?depth=${depth}` : ""}`;
    return this.request<GetFileResponse>(endpoint);
  }

  async getNode(fileKey: string, nodeId: string, depth?: number): Promise<SimplifiedDesign> {
    const endpoint = `/files/${fileKey}/nodes?ids=${nodeId}${depth ? `&depth=${depth}` : ""}`;
    const response = await this.request<GetFileNodesResponse>(endpoint);
    writeLogs("figma-raw.json", response);
    const simplifiedResponse = parseFigmaResponse(response);
    writeLogs("figma-simplified.json", simplifiedResponse);
    return simplifiedResponse;
  }
}

function writeLogs(name: string, value: any) {
  const logsDir = "logs";
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
  }
  fs.writeFileSync(`${logsDir}/${name}`, JSON.stringify(value, null, 2));
}
