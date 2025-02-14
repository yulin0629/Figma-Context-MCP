export interface FigmaError {
  status: number;
  err: string;
}

export interface FigmaAPIResponse {
  name: string;
  lastModified: string;
  thumbnailUrl: string;
  nodes: Record<
    string,
    {
      document: FigmaDocumentNode;
      components?: Record<string, RawComponent>;
      componentSets?: Record<string, RawComponentSet>;
      // ignoring other sub-objects or styles if not needed
    }
  >;
}

// Additional raw structures for component metadata
export interface RawComponent {
  key: string;
  name: string;
  description: string;
  remote: boolean;
  componentSetId?: string;
  documentationLinks?: unknown[]; // Figma sometimes returns arrays
}
export interface RawComponentSet {
  key: string;
  name: string;
  description: string;
  remote: boolean;
}

export interface FigmaDocumentNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaDocumentNode[];
  // Layout & size
  absoluteBoundingBox?: RawBoundingBox;
  absoluteRenderBounds?: RawBoundingBox;
  layoutMode?: "NONE" | "HORIZONTAL" | "VERTICAL";
  primaryAxisAlignItems?: "MIN" | "MAX" | "CENTER" | "SPACE_BETWEEN";
  counterAxisAlignItems?: "MIN" | "MAX" | "CENTER" | "SPACE_BETWEEN";
  primaryAxisSizingMode?: "FIXED" | "AUTO";
  counterAxisSizingMode?: "FIXED" | "AUTO";
  itemSpacing?: number;
  layoutWrap?: "NO_WRAP" | "WRAP";
  layoutSizingHorizontal?: "FIXED" | "FILL" | "HUG";
  layoutSizingVertical?: "FIXED" | "FILL" | "HUG";
  paddingTop?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  paddingRight?: number;
  // Style & appearance
  fills?: RawPaint[];
  strokes?: RawPaint[];
  strokeWeight?: number;
  strokeDashes?: number[];
  opacity?: number;
  cornerRadius?: number;
  cornerSmoothing?: number;
  individualStrokeWeights?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  backgroundColor?: RawColor;
  background?: RawPaint[];
  // Text
  characters?: string;
  style?: RawTextStyle;
  // Components/instances
  componentId?: string;
  componentProperties?: Record<string, RawComponentProperty>;
  overrides?: RawOverride[];
  // Add these new layout properties
  layoutAlign?: "INHERIT" | "STRETCH";
  layoutGrow?: number;
  layoutPositioning?: "AUTO" | "ABSOLUTE";
  // etc.
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
