import axios, { AxiosError } from 'axios';
import { FigmaAPIResponse, FigmaError } from '../types/figma';
import fs from 'fs';
import { parseFigmaResponse, SimplifiedDesign } from './simplify-node-response';

export class FigmaService {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.figma.com/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(endpoint: string): Promise<T> {
    try {
      console.log(`Calling ${this.baseUrl}${endpoint}`);
      const response = await axios.get(`${this.baseUrl}${endpoint}`, {
        headers: {
          'X-Figma-Token': this.apiKey,
        },
      });

      return response.data;
    } catch (error) {
      if (error instanceof AxiosError && error.response) {
        throw {
          status: error.response.status,
          err: (error.response.data as { err?: string }).err || 'Unknown error',
        } as FigmaError;
      }
      throw new Error('Failed to make request to Figma API');
    }
  }

  async getFile(fileKey: string, depth?: number): Promise<FigmaAPIResponse> {
    const endpoint = `/files/${fileKey}${depth ? `?depth=${depth}` : ''}`;
    return this.request<FigmaAPIResponse>(endpoint);
  }

  async getNode(fileKey: string, nodeId: string, depth?: number): Promise<SimplifiedDesign> {
    const endpoint = `/files/${fileKey}/nodes?ids=${nodeId}${depth ? `&depth=${depth}` : ''}`;
    const response = await this.request<FigmaAPIResponse>(endpoint);
    fs.writeFileSync('figma-response.json', JSON.stringify(response, null, 2));
    const simplifiedResponse = parseFigmaResponse(response);
    fs.writeFileSync('figma-response-simplified.json', JSON.stringify(simplifiedResponse, null, 2));
    return simplifiedResponse;
  }
}
