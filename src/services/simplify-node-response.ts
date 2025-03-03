import { SimplifiedLayout, buildSimplifiedLayout } from "~/transformers/layout";
import type {
  GetFileNodesResponse,
  Node as FigmaDocumentNode,
  Paint,
  Vector,
  GetFileResponse,
} from "@figma/rest-api-spec";
import { hasValue, isRectangleCornerRadii, isTruthy } from "~/utils/identity";
import { removeEmptyKeys, generateVarId, StyleId, parsePaint, isVisible } from "~/utils/common";
import { buildSimplifiedStrokes, SimplifiedStroke } from "~/transformers/style";
import { buildSimplifiedEffects, SimplifiedEffects } from "~/transformers/effects";
/**
 * TDOO ITEMS
 *
 * - Improve layout handling—translate from Figma vocabulary to CSS
 * - Look up existing styles in new MCP endpoint—Figma supports individual lookups without enterprise /v1/styles/:key
 * - Support endpoint for getting SVG data from Figma, similar to images
 **/

// -------------------- SIMPLIFIED STRUCTURES --------------------

export type TextStyle = Partial<{
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  lineHeight: string;
  letterSpacing: string;
  textCase: string;
  textAlignHorizontal: string;
  textAlignVertical: string;
}>;
export type StrokeWeights = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};
type StyleTypes =
  | TextStyle
  | SimplifiedFill[]
  | SimplifiedLayout
  | SimplifiedStroke
  | SimplifiedEffects
  | string;
type GlobalVars = {
  styles: Record<StyleId, StyleTypes>;
  vectorParents?: Record<
    string,
    {
      parentId: string;
      parentName: string;
      parentType: string;
      childrenId: string;
    }
  >;
  childrenToParents?: Record<string, string[]>;
};
export interface SimplifiedDesign {
  name: string;
  lastModified: string;
  thumbnailUrl: string;
  nodes: SimplifiedNode[];
  globalVars: GlobalVars;
}

export interface SimplifiedNode {
  id: string;
  name: string;
  type: string; // e.g. FRAME, TEXT, INSTANCE, RECTANGLE, etc.
  // geometry
  boundingBox?: BoundingBox;
  // text
  text?: string;
  textStyle?: string;
  // appearance
  fills?: string;
  styles?: string;
  strokes?: string;
  effects?: string;
  opacity?: number;
  borderRadius?: string;
  // layout & alignment
  layout?: string;
  // backgroundColor?: ColorValue; // Deprecated by Figma API
  // for rect-specific strokes, etc.
  // children
  children?: SimplifiedNode[];
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type CSSRGBAColor = `rgba(${number}, ${number}, ${number}, ${number})`;
export type CSSHexColor = `#${string}`;
export type SimplifiedFill =
  | {
      type?: Paint["type"];
      hex?: string;
      rgba?: string;
      opacity?: number;
      imageRef?: string;
      scaleMode?: string;
      gradientHandlePositions?: Vector[];
      gradientStops?: {
        position: number;
        color: ColorValue | string;
      }[];
    }
  | CSSRGBAColor
  | CSSHexColor;

export interface ColorValue {
  hex: string;
  opacity: number;
}

function parseGlobalVars(globalVars: GlobalVars, simplifiedNodes: SimplifiedNode[]): GlobalVars {
  // Reorganize vectorParents based on childrenId
  const childrenToParents: Record<string, string[]> = {};

  // Iterate through vectorParents, group by childrenId
  Object.entries(globalVars.vectorParents ?? {}).forEach(([parentId, data]) => {
    const { childrenId } = data as { childrenId: string };

    if (!childrenToParents[childrenId]) {
      childrenToParents[childrenId] = [];
    }

    childrenToParents[childrenId].push(parentId);
  });

  if (simplifiedNodes.length) {
    // Process parent nodes with the same childrenId
    Object.values(childrenToParents).forEach((parentIds) => {
      // Find all parent nodes
      parentIds.forEach((parentId) => {
        let parentNode = findNodeById(parentId, simplifiedNodes);
        // If parent node is found, modify it directly
        if (parentNode) {
          // Save original size information
          const { id } = parentNode;
          Object.keys(parentNode).forEach((key) => {
            delete parentNode[key as keyof SimplifiedNode];
          });
          Object.assign(parentNode, {
            id,
            type: "IMAGE",
          });
        }
      });
    });
  }

  // Store grouping results in globalVars
  globalVars.childrenToParents = childrenToParents;
  delete globalVars.vectorParents;
  return globalVars;
}

// ---------------------- PARSING ----------------------
export function parseFigmaResponse(data: GetFileResponse | GetFileNodesResponse): SimplifiedDesign {
  const { name, lastModified, thumbnailUrl } = data;
  let nodes: FigmaDocumentNode[];
  if ("document" in data) {
    nodes = Object.values(data.document.children);
  } else {
    nodes = Object.values(data.nodes).map((n) => n.document);
  }
  let globalVars: GlobalVars = {
    styles: {},
    vectorParents: {},
  };
  const simplifiedNodes: SimplifiedNode[] = nodes
    .filter(isVisible)
    .map((n) => parseNode(globalVars, n))
    .filter((child) => child !== null && child !== undefined);
  globalVars = parseGlobalVars(globalVars, simplifiedNodes);

  return {
    name,
    lastModified,
    thumbnailUrl: thumbnailUrl || "",
    nodes: simplifiedNodes,
    globalVars,
  };
}

// Helper function to find node by ID
const findNodeById = (id: string, nodes: SimplifiedNode[]): SimplifiedNode | undefined => {
  for (const node of nodes) {
    if (node?.id === id) {
      return node;
    }

    if (node?.children && node.children.length > 0) {
      const foundInChildren = findNodeById(id, node.children);
      if (foundInChildren) {
        return foundInChildren;
      }
    }
  }

  return undefined;
};

/**
 * Find or create global variables
 * @param globalVars - Global variables object
 * @param value - Value to store
 * @param prefix - Variable ID prefix
 * @returns Variable ID
 */
function findOrCreateVar(globalVars: GlobalVars, value: any, prefix: string): StyleId {
  // Check if the same value already exists
  const [existingVarId] =
    Object.entries(globalVars.styles).find(
      ([_, existingValue]) => JSON.stringify(existingValue) === JSON.stringify(value),
    ) ?? [];

  if (existingVarId) {
    return existingVarId as StyleId;
  }

  // Create a new variable if it doesn't exist
  const varId = generateVarId(prefix);
  globalVars.styles[varId] = value;
  return varId;
}

function parseNode(
  globalVars: GlobalVars,
  n: FigmaDocumentNode,
  parent?: FigmaDocumentNode,
): SimplifiedNode | null {
  const { id, name, type } = n;

  const simplified: SimplifiedNode = {
    id,
    name,
    type,
  };

  // text
  if (hasValue("style", n) && Object.keys(n.style).length) {
    const style = n.style;
    const textStyle = {
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
    simplified.textStyle = findOrCreateVar(globalVars, textStyle, "style");
  }

  // fills & strokes
  if (hasValue("fills", n) && Array.isArray(n.fills) && n.fills.length) {
    // const fills = simplifyFills(n.fills.map(parsePaint));
    const fills = n.fills.map(parsePaint);
    simplified.fills = findOrCreateVar(globalVars, fills, "fill");
  }

  const strokes = buildSimplifiedStrokes(n);
  if (strokes.colors.length) {
    simplified.strokes = findOrCreateVar(globalVars, strokes, "stroke");
  }

  const effects = buildSimplifiedEffects(n);
  if (effects.boxShadow) {
    simplified.effects = findOrCreateVar(globalVars, effects, "effect");
  }

  // Process layout
  const layout = buildSimplifiedLayout(n, parent);
  if (Object.keys(layout).length > 1) {
    simplified.layout = findOrCreateVar(globalVars, layout, "layout");
  }

  // Keep other simple properties directly
  if (hasValue("characters", n, isTruthy)) {
    simplified.text = n.characters;
  }

  // border/corner

  // opacity
  if (hasValue("opacity", n) && typeof n.opacity === "number" && n.opacity !== 1) {
    simplified.opacity = n.opacity;
  }

  if (hasValue("cornerRadius", n) && typeof n.cornerRadius === "number") {
    simplified.borderRadius = `${n.cornerRadius}px`;
  }
  if (hasValue("rectangleCornerRadii", n, isRectangleCornerRadii)) {
    simplified.borderRadius = `${n.rectangleCornerRadii[0]}px ${n.rectangleCornerRadii[1]}px ${n.rectangleCornerRadii[2]}px ${n.rectangleCornerRadii[3]}px`;
  }

  // Recursively process child nodes
  if (hasValue("children", n) && n.children.length > 0) {
    let children = n.children
      .filter(isVisible)
      .map((child) => parseNode(globalVars, child, n))
      .filter((child) => child !== null && child !== undefined);
    if (children.length) {
      simplified.children = children;
    }
  }

  // Detect VECTOR type nodes and store their parent node information
  if (type === "VECTOR") {
    // Cache VECTOR nodes, store directly using prefix
    const { id: nodeId, ...vectorNodeData } = simplified;

    // Check if similar nodes already exist (ignoring id)
    const vectorId = findOrCreateVar(globalVars, vectorNodeData, "vector");

    // If there is a parent node, store relationship information
    if (parent) {
      // Store parent node information of the VECTOR node
      globalVars.vectorParents ??= {};
      globalVars.vectorParents[parent.id] = {
        parentId: parent.id,
        parentName: parent.name,
        parentType: parent.type,
        childrenId: vectorId,
      };
    }
  }

  return removeEmptyKeys(simplified);
}
