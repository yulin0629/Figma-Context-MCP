import { SimplifiedLayout, buildSimplifiedLayout } from "~/transformers/layout";
import type {
  GetFileNodesResponse,
  Node as FigmaDocumentNode,
  Paint,
  Vector,
  RGBA,
} from "@figma/rest-api-spec";
import { hasValue, isRectangle, isStrokeWeights, isTruthy } from "~/utils/identity";

/**
 * TDOO ITEMS
 *
 * - Improve color handling—room to simplify return types e.g. when only a single fill with opacity 1
 * - Improve stroke handling
 * - Improve layout handling—translate from Figma vocabulary to CSS
 **/

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
  fill?: string;
  fills?: SimplifiedFill[];
  strokes?: SimplifiedFill[];
  opacity?: number;
  borderRadius?: string;
  // layout & alignment
  layout?: SimplifiedLayout;
  // backgroundColor?: ColorValue; // Deprecated by Figma API
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
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SimplifiedFill {
  type: Paint["type"];
  hex?: string;
  opacity?: number;
  imageRef?: string;
  scaleMode?: string;
  gradientHandlePositions?: Vector[];
  gradientStops?: {
    position: number;
    color: ColorValue;
  }[];
}

export interface ColorValue {
  hex: string;
  opacity: number;
}

// ---------------------- PARSING ----------------------

export function parseFigmaResponse(data: GetFileNodesResponse): SimplifiedDesign {
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

function parseNode(n: FigmaDocumentNode, parent?: FigmaDocumentNode): SimplifiedNode {
  const { id, name, type } = n;

  const simplified: SimplifiedNode = {
    id,
    name,
    type,
  };

  // bounding box - now normalized relative to parent
  if (isRectangle("absoluteBoundingBox", n) && isRectangle("absoluteBoundingBox", parent)) {
    const normalizedBounds = {
      x: n.absoluteBoundingBox.x - (parent?.absoluteBoundingBox?.x ?? n.absoluteBoundingBox.x),
      y: n.absoluteBoundingBox.y - (parent?.absoluteBoundingBox?.y ?? n.absoluteBoundingBox.y),
      width: n.absoluteBoundingBox.width,
      height: n.absoluteBoundingBox.height,
    };

    simplified.boundingBox = normalizedBounds;
  }

  // text
  if (hasValue("characters", n, isTruthy)) {
    simplified.text = n.characters;
  }
  if (hasValue("style", n)) {
    const style = n.style;
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
  if (hasValue("fills", n) && Array.isArray(n.fills)) {
    simplified.fills = n.fills
      .filter((f) => f.type === "SOLID" || f.type === "IMAGE")
      .map(parsePaint);
  }
  if (hasValue("strokes", n) && Array.isArray(n.strokes)) {
    simplified.strokes = n.strokes
      .filter((s) => s.type === "SOLID" || s.type === "IMAGE")
      .map(parsePaint);
  }

  // border/corner
  if (
    hasValue("strokeWeight", n) &&
    typeof n.strokeWeight === "number" &&
    simplified.strokes?.length
  ) {
    simplified.strokeWeight = n.strokeWeight;
  }
  if (hasValue("strokeDashes", n) && Array.isArray(n.strokeDashes)) {
    simplified.strokeDashes = n.strokeDashes;
  }
  if (hasValue("individualStrokeWeights", n, isStrokeWeights)) {
    simplified.individualStrokeWeights = {
      top: n.individualStrokeWeights.top,
      right: n.individualStrokeWeights.right,
      bottom: n.individualStrokeWeights.bottom,
      left: n.individualStrokeWeights.left,
    };
  }

  // opacity
  if (hasValue("opacity", n) && typeof n.opacity === "number") {
    simplified.opacity = n.opacity;
  }

  if (hasValue("cornerRadius", n) && typeof n.cornerRadius === "number") {
    simplified.borderRadius = `${n.cornerRadius}px`;
  }

  // layout data
  simplified.layout = buildSimplifiedLayout(n);

  // children - pass the current node as parent
  if (hasValue("children", n) && n.children.length > 0) {
    simplified.children = n.children.map((child) => parseNode(child, n));
  }

  return simplified;
}

function parsePaint(raw: Paint): SimplifiedFill {
  if (raw.type === "IMAGE") {
    return {
      type: "IMAGE",
      imageRef: raw.imageRef,
      scaleMode: raw.scaleMode,
    };
  } else if (raw.type === "SOLID") {
    // treat as SOLID
    const { hex, opacity } = convertColor(raw.color!);
    return {
      type: "SOLID",
      hex,
      opacity,
    };
  } else if (
    ["GRADIENT_LINEAR", "GRADIENT_RADIAL", "GRADIENT_ANGULAR", "GRADIENT_DIAMOND"].includes(
      raw.type,
    )
  ) {
    // treat as GRADIENT_LINEAR
    return {
      type: raw.type,
      gradientHandlePositions: raw.gradientHandlePositions,
      gradientStops: raw.gradientStops.map(({ position, color }) => ({
        position,
        color: convertColor(color),
      })),
    };
  } else {
    throw new Error(`Unknown paint type: ${raw.type}`);
  }
}

// Convert color from RGBA to { hex, opacity }
function convertColor(color: RGBA): ColorValue {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  const opacity = color.a;

  const hex = "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();

  return { hex, opacity };
}
