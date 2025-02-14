export type { GetFileResponse, GetFileNodesResponse } from "@figma/rest-api-spec";
export interface FigmaError {
  status: number;
  err: string;
}

export interface RawPaint {
  type: "SOLID" | "IMAGE" | "VARIABLE_ALIAS" | string;
  color?: RawColor;
  blendMode?: string;
  imageRef?: string;
  scaleMode?: "FILL" | "FIT" | "CROP" | "TILE" | "STRETCH" | string;
  imageTransform?: number[][];
  // ignoring boundVariables, because we want to skip them
}

export interface RawColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface RawTextStyle {
  fontFamily?: string;
  fontPostScriptName?: string;
  fontWeight?: number;
  fontSize?: number;
  lineHeightPx?: number;
  letterSpacing?: number;
  textCase?: string;
  textAlignHorizontal?: string;
  textAlignVertical?: string;
  // etc.
}

export interface RawBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RawComponentProperty {
  value: string;
  type: string; // e.g. "TEXT", "VARIANT", etc.
}

export interface RawOverride {
  id: string;
  overriddenFields: string[];
  // possibly more
}
