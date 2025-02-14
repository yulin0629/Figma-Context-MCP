import { FigmaAPIResponse, FigmaDocumentNode, RawColor, RawPaint } from "../types/figma";
import { SimplifiedLayout, buildSimplifiedLayout } from "./layout";

// types.ts

// -------------------- SIMPLIFIED STRUCTURES --------------------

export interface SimplifiedDesign {
  name: string;
  lastModified: string;
  thumbnailUrl: string;
  // If we want to preserve components data, we can stash it
  nodes: SimplifiedNode[];
  components?: Record<string, SimplifiedComponent>;
  componentSets?: Record<string, SimplifiedComponentSet>;
}

export interface SimplifiedComponent {
  key: string;
  name: string;
  description: string;
  // etc. Expand as needed
}

export interface SimplifiedComponentSet {
  key: string;
  name: string;
  description: string;
  // etc. Expand as needed
}

export interface SimplifiedNode {
  id: string;
  name: string;
  type: string; // e.g. FRAME, TEXT, INSTANCE, RECTANGLE, etc.

  // geometry
  boundingBox?: BoundingBox;
  // text
  text?: string;
  textStyle?: Partial<{
    fontFamily: string;
    fontWeight: number;
    fontSize: number;
    lineHeight: string;
    letterSpacing: string;
    textCase: string;
    textAlignHorizontal: string;
    textAlignVertical: string;
  }>;
  // appearance
  fills?: SimplifiedFill[];
  strokes?: SimplifiedFill[];
  opacity?: number;
  borderRadius?: string;
  // layout & alignment
  layout?: SimplifiedLayout;
  // for frames, rectangles, images, etc.
  backgroundColor?: ColorValue;
  // for rect-specific strokes, etc.
  strokeWeight?: number;
  strokeDashes?: number[];
  individualStrokeWeights?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  // children
  children?: SimplifiedNode[];

  layoutAlign?: "INHERIT" | "STRETCH";
  layoutGrow?: number;
  layoutPositioning?: "AUTO" | "ABSOLUTE";
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// We convert RGBA to hex plus alpha. Also store image transform info
export interface SimplifiedFill {
  type: "SOLID" | "IMAGE";
  hex?: string;
  opacity?: number;
  imageRef?: string;
  scaleMode?: string;
}

export interface ColorValue {
  hex: string;
  opacity: number;
}

// ---------------------- PARSING ----------------------

export function parseFigmaResponse(data: FigmaAPIResponse): SimplifiedDesign {
  const { name, lastModified, thumbnailUrl, nodes } = data;

  // Potentially gather all top-level nodes into an array
  const simplifiedNodes: SimplifiedNode[] = Object.values(nodes).map((n) => parseNode(n.document));

  return {
    name,
    lastModified,
    thumbnailUrl,
    nodes: simplifiedNodes,
  };
}

function parseNode(node: FigmaDocumentNode, parent?: FigmaDocumentNode): SimplifiedNode {
  const {
    id,
    name,
    type,
    children,
    absoluteBoundingBox,
    characters,
    style,
    fills,
    strokes,
    strokeWeight,
    strokeDashes,
    individualStrokeWeights,
    cornerRadius,
    opacity,
    backgroundColor,
    layoutMode,
    primaryAxisAlignItems,
    counterAxisAlignItems,
    primaryAxisSizingMode,
    counterAxisSizingMode,
    layoutWrap,
    itemSpacing,
    layoutSizingHorizontal,
    layoutSizingVertical,
    paddingTop,
    paddingBottom,
    paddingLeft,
    paddingRight,
    layoutAlign,
    layoutGrow,
    layoutPositioning,
  } = node;

  const simplified: SimplifiedNode = {
    id,
    name,
    type,
  };

  // bounding box - now normalized relative to parent
  if (absoluteBoundingBox) {
    const normalizedBounds = {
      x: absoluteBoundingBox.x - (parent?.absoluteBoundingBox?.x ?? absoluteBoundingBox.x),
      y: absoluteBoundingBox.y - (parent?.absoluteBoundingBox?.y ?? absoluteBoundingBox.y),
      width: absoluteBoundingBox.width,
      height: absoluteBoundingBox.height,
    };

    simplified.boundingBox = normalizedBounds;
  }

  // text
  if (characters) {
    simplified.text = characters;
  }
  if (style) {
    simplified.textStyle = {
      fontFamily: style.fontFamily,
      fontWeight: style.fontWeight,
      fontSize: style.fontSize,
      lineHeight:
        style.lineHeightPx && style.fontSize
          ? `${style.lineHeightPx / style.fontSize}em`
          : undefined,
      letterSpacing:
        style.letterSpacing && style.letterSpacing !== 0 && style.fontSize
          ? `${(style.letterSpacing / style.fontSize) * 100}%`
          : undefined,
      textCase: style.textCase,
      textAlignHorizontal: style.textAlignHorizontal,
      textAlignVertical: style.textAlignVertical,
    };
  }

  // fills & strokes
  if (fills?.length) {
    simplified.fills = fills
      .filter((f) => f.type === "SOLID" || f.type === "IMAGE")
      .map(parsePaint);
  }
  if (strokes?.length) {
    simplified.strokes = strokes
      .filter((s) => s.type === "SOLID" || s.type === "IMAGE")
      .map(parsePaint);
  }

  // border/corner
  if (typeof strokeWeight === "number" && simplified.strokes?.length) {
    simplified.strokeWeight = strokeWeight;
  }
  if (strokeDashes) {
    simplified.strokeDashes = strokeDashes;
  }
  if (individualStrokeWeights) {
    simplified.individualStrokeWeights = {
      top: individualStrokeWeights.top,
      right: individualStrokeWeights.right,
      bottom: individualStrokeWeights.bottom,
      left: individualStrokeWeights.left,
    };
  }

  // opacity
  if (typeof opacity === "number") {
    simplified.opacity = opacity;
  }

  if (typeof cornerRadius === "number") {
    simplified.borderRadius = `${cornerRadius}px`;
  }
  // background color
  if (backgroundColor) {
    simplified.backgroundColor = convertColor(backgroundColor);
  }

  // Add layout alignment properties
  if (layoutAlign) {
    simplified.layoutAlign = layoutAlign;
  }

  if (typeof layoutGrow === "number") {
    simplified.layoutGrow = layoutGrow;
  }

  if (layoutPositioning) {
    simplified.layoutPositioning = layoutPositioning;
  }

  // layout data
  simplified.layout = buildSimplifiedLayout({
    layoutMode,
    primaryAxisAlignItems,
    counterAxisAlignItems,
    layoutWrap,
    itemSpacing,
    layoutSizingHorizontal,
    layoutSizingVertical,
    paddingTop,
    paddingBottom,
    paddingLeft,
    paddingRight,
    layoutAlign,
    layoutGrow,
    layoutPositioning,
  });

  // children - pass the current node as parent
  if (children && children.length > 0) {
    simplified.children = children.map((child) => parseNode(child, node));
  }

  return simplified;
}

function parsePaint(raw: RawPaint): SimplifiedFill {
  if (raw.type === "IMAGE") {
    return {
      type: "IMAGE",
      imageRef: raw.imageRef,
      scaleMode: raw.scaleMode,
    };
  }
  // treat as SOLID
  const { hex, opacity } = convertColor(raw.color!);
  return {
    type: "SOLID",
    hex,
    opacity,
  };
}

// Convert color from RGBA to { hex, opacity }
function convertColor(color: RawColor): ColorValue {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  const alpha = color.a;

  const hex = "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();

  return { hex, opacity: alpha };
}
