import axios from "axios";
import fs from "fs";
import path from "path";

import type { RGBA } from "@figma/rest-api-spec";

export type StyleId = `${string}_${string}` & { __brand: "StyleId" };

export interface ColorValue {
  hex: string;
  opacity: number;
}

/**
 * Download Figma image and save it locally
 * @param fileName - The filename to save as
 * @param localPath - The local path to save to
 * @param imageUrl - Image URL (images[nodeId])
 * @returns A Promise that resolves to the full file path where the image was saved
 * @throws Error if download fails
 */
export async function downloadFigmaImage(
  fileName: string,
  localPath: string,
  imageUrl: string,
): Promise<string> {
  try {
    // Ensure local path exists
    if (!fs.existsSync(localPath)) {
      fs.mkdirSync(localPath, { recursive: true });
    }

    // Build the complete file path
    const fullPath = path.join(localPath, fileName);

    // Use axios to download the image, set responseType to stream
    const response = await axios({
      method: "GET",
      url: imageUrl,
      responseType: "stream",
      timeout: 30000, // 30 seconds timeout
    });

    // Create write stream
    const writer = fs.createWriteStream(fullPath);

    // Pipe response stream to file stream
    response.data.pipe(writer);

    // Return a Promise that resolves when writing is complete
    return new Promise((resolve, reject) => {
      writer.on("finish", () => {
        console.log(`Image saved to: ${fullPath}`);
        resolve(fullPath);
      });

      writer.on("error", (err: Error) => {
        // Delete partially downloaded file
        fs.unlink(fullPath, () => {});
        reject(new Error(`Failed to download image: ${err.message}`));
      });
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Error downloading image: ${errorMessage}`);
  }
}

/**
 * Remove keys with empty arrays or empty objects from an object.
 * @param input - The input object or value.
 * @returns The processed object or the original value.
 */
export function removeEmptyKeys<T>(input: T): T {
  // If not an object type or null, return directly
  if (typeof input !== "object" || input === null) {
    return input;
  }

  // Handle array type
  if (Array.isArray(input)) {
    return input.map((item) => removeEmptyKeys(item)) as T;
  }

  // Handle object type
  const result = {} as T;
  for (const key in input) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      const value = input[key];

      // Recursively process nested objects
      const cleanedValue = removeEmptyKeys(value);

      // Skip empty arrays and empty objects
      if (
        cleanedValue !== undefined &&
        !(Array.isArray(cleanedValue) && cleanedValue.length === 0) &&
        !(
          typeof cleanedValue === "object" &&
          cleanedValue !== null &&
          Object.keys(cleanedValue).length === 0
        )
      ) {
        result[key] = cleanedValue;
      }
    }
  }

  return result;
}

/**
 * Convert hex color value and opacity to rgba format
 * @param hex - Hexadecimal color value (e.g., "#FF0000" or "#F00")
 * @param opacity - Opacity value (0-1)
 * @returns Color string in rgba format
 */
export function hexToRgba(hex: string, opacity: number = 1): string {
  // Remove possible # prefix
  hex = hex.replace("#", "");

  // Handle shorthand hex values (e.g., #FFF)
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }

  // Convert hex to RGB values
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Ensure opacity is in the 0-1 range
  const validOpacity = Math.min(Math.max(opacity, 0), 1);

  return `rgba(${r}, ${g}, ${b}, ${validOpacity})`;
}

/**
 * Convert color from RGBA to { hex, opacity }
 *
 * @param color - The color to convert, including alpha channel
 * @param opacity - The opacity of the color, if not included in alpha channel
 * @returns The converted color
 **/
export function convertColor(color: RGBA, opacity = 1): ColorValue {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);

  // Alpha channel defaults to 1. If opacity and alpha are both and < 1, their effects are multiplicative
  const a = Math.round(opacity * color.a * 100) / 100;

  const hex = "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();

  return { hex, opacity: a };
}

/**
 * Convert color from RGBA to { hex, opacity }
 *
 * @param color - The color to convert, including alpha channel
 * @param opacity - The opacity of the color, if not included in alpha channel
 * @returns The converted color
 **/
export function formatRGBAColor(color: RGBA, opacity = 1): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  // Alpha channel defaults to 1. If opacity and alpha are both and < 1, their effects are multiplicative
  const a = Math.round(opacity * color.a * 100) / 100;

  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * Generate a 6-character random variable ID
 * @param prefix - ID prefix
 * @returns A 6-character random ID string with prefix
 */
export function generateVarId(prefix: string = "var"): StyleId {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";

  for (let i = 0; i < 6; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    result += chars[randomIndex];
  }

  return `${prefix}_${result}` as StyleId;
}
