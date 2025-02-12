import { FigmaAPIResponse, FigmaDocumentNode, RawColor, RawPaint } from '../types/figma';

// This is the simplified representation we want to produce.
export interface SimplifiedDesign {
  name: string;
  lastModified: string;
  thumbnailUrl: string;
  nodes: SimplifiedNode[];
}

export interface SimplifiedNode {
  id: string;
  name: string;
  type: string;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  text?: string; // for TEXT nodes
  fills?: SimplifiedFill[];
  strokes?: SimplifiedFill[];
  style?: {
    fontFamily?: string;
    fontWeight?: number;
    fontSize?: number;
    lineHeightPercent?: string;
    letterSpacing?: string;
  };
  layout?: {
    // A simplified "flex" layout interpretation
    flexDirection?: 'row' | 'column';
    wrap?: boolean;
    gap?: number; // from itemSpacing
    // Keep raw Figma layout info if you want
    figmaLayoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL';
    figmaLayoutWrap?: 'NO_WRAP' | 'WRAP';
    figmaCounterAxisSizingMode?: 'FIXED' | 'AUTO';
  };
  children?: SimplifiedNode[];
}

// We condense Paint objects here, ignoring boundVariables:
export interface SimplifiedFill {
  type: 'SOLID' | 'IMAGE';
  hex?: string; // e.g. "#FF00AA"
  opacity?: number; // derived from alpha
  imageRef?: string; // if type === 'IMAGE'
}

// parser.ts
export function parseFigmaResponse(data: FigmaAPIResponse): SimplifiedDesign {
  const { name, lastModified, thumbnailUrl, nodes } = data;
  // The top-level "nodes" can contain multiple root documents keyed by ID.
  // We'll parse them all and flatten into an array.
  const simplifiedNodes: SimplifiedNode[] = Object.values(nodes).map((nodeObj) =>
    parseNode(nodeObj.document),
  );

  return {
    name,
    lastModified,
    thumbnailUrl,
    nodes: simplifiedNodes,
  };
}

function parseNode(node: FigmaDocumentNode): SimplifiedNode {
  const {
    id,
    name,
    type,
    children,
    absoluteBoundingBox,
    characters,
    fills,
    strokes,
    style,
    layoutMode,
    itemSpacing,
    layoutWrap,
    counterAxisSizingMode,
  } = node;

  const simplifiedNode: SimplifiedNode = {
    id,
    name,
    type,
  };

  // bounding box
  if (absoluteBoundingBox) {
    simplifiedNode.boundingBox = {
      x: absoluteBoundingBox.x,
      y: absoluteBoundingBox.y,
      width: absoluteBoundingBox.width,
      height: absoluteBoundingBox.height,
    };
  }

  // text
  if (characters) {
    simplifiedNode.text = characters;
  }

  // fills
  if (fills) {
    simplifiedNode.fills = fills
      .filter((f) => f.type === 'SOLID' || f.type === 'IMAGE')
      .map(parsePaint);
  }

  // strokes
  if (strokes) {
    simplifiedNode.strokes = strokes
      .filter((s) => s.type === 'SOLID' || s.type === 'IMAGE')
      .map(parsePaint);
  }

  // style
  if (style) {
    simplifiedNode.style = {
      fontFamily: style.fontFamily,
      fontWeight: style.fontWeight,
      fontSize: style.fontSize,
      lineHeightPercent: style.lineHeightPercent ? `${style.lineHeightPercent / 100}%` : undefined,
      letterSpacing:
        typeof style.letterSpacing === 'number' && style.fontSize
          ? `${style.letterSpacing / style.fontSize}%`
          : undefined,
    };
  }

  // layout info: layoutMode, itemSpacing, etc.
  if (layoutMode && layoutMode !== 'NONE') {
    simplifiedNode.layout = {
      figmaLayoutMode: layoutMode,
      figmaLayoutWrap: layoutWrap,
      figmaCounterAxisSizingMode: counterAxisSizingMode,
      // interpret figma layout as "flex"
      flexDirection: layoutMode === 'HORIZONTAL' ? 'row' : 'column',
      wrap: layoutWrap === 'WRAP',
      gap: itemSpacing ?? 0,
    };
  }

  // children
  if (children && children.length > 0) {
    simplifiedNode.children = children.map(parseNode);
  }

  return simplifiedNode;
}

function parsePaint(raw: RawPaint): SimplifiedFill {
  if (raw.type === 'IMAGE') {
    return {
      type: 'IMAGE',
      imageRef: raw.imageRef,
    };
  }
  // else it’s a SOLID (or treat as SOLID):
  let hex;
  let opacity;
  if (raw.color) {
    const { hex: colorHex, alpha } = convertColor(raw.color);
    hex = colorHex;
    opacity = alpha;
  }
  return {
    type: 'SOLID',
    hex,
    opacity,
  };
}

// Convert color to { hex, alpha }
function convertColor(color: RawColor): { hex: string; alpha: number } {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  const alpha = color.a;

  // zero-pad the hex digits
  const hex = '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();

  return { hex, alpha };
}
