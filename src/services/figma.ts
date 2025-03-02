import axios, { AxiosError } from "axios";
import { FigmaError } from "~/types/figma";
import fs from "fs";
import { parseFigmaResponse, SimplifiedDesign } from "./simplify-node-response";
import type {
  GetImagesResponse,
  GetFileResponse,
  GetFileNodesResponse,
} from "@figma/rest-api-spec";
import { downloadFigmaImage } from "~/utils/common";

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

  async getImage(
    fileKey: string,
    nodeId: string,
    fileName: string,
    localPath: string,
  ): Promise<boolean> {
    const endpoint = `/images/${fileKey}?ids=${nodeId}&scale=2&format=png`;
    const file = await this.request<GetImagesResponse>(endpoint);
    const { images = {} } = file;
    let success = false;
    if (images[nodeId]) {
      await downloadFigmaImage(fileName, localPath, images[nodeId]);
      console.log(`Successfully save image`, localPath, fileName);
      success = true;
    }
    return success;
  }

  async getFile(fileKey: string, depth?: number): Promise<SimplifiedDesign> {
    try {
      const endpoint = `/files/${fileKey}${depth ? `?depth=${depth}` : ""}`;
      console.log(`Calling ${this.baseUrl}${endpoint}`);
      const response = await this.request<GetFileResponse>(endpoint);
      console.log("Got response");
      const simplifiedResponse = parseFigmaResponse(response);
      writeLogs("figma-raw.json", response);
      writeLogs("figma-simplified.json", simplifiedResponse);
      return simplifiedResponse;
    } catch (e) {
      console.log("hi?");
      console.error("Failed to get file:", e);
      throw e;
    }
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
  try {
    if (process.env.NODE_ENV !== "development") return;

    const logsDir = "logs";

    try {
      fs.accessSync(process.cwd(), fs.constants.W_OK);
    } catch (error) {
      console.log("Failed to write logs:", error);
      return;
    }

    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir);
    }
    fs.writeFileSync(`${logsDir}/${name}`, JSON.stringify(value, null, 2));
  } catch (error) {
    console.debug("Failed to write logs:", error);
  }
}
