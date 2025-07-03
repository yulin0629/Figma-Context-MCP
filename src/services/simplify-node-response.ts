import { type SimplifiedLayout, buildSimplifiedLayout } from "~/transformers/layout.js";
import type {
  GetFileNodesResponse,
  Node as FigmaDocumentNode,
  Paint,
  Vector,
  GetFileResponse,
  ComponentPropertyType,
  Component,
  ComponentSet,
} from "@figma/rest-api-spec";
import type {
  SimplifiedComponentDefinition,
  SimplifiedComponentSetDefinition,
} from "~/utils/sanitization.js";
import { sanitizeComponents, sanitizeComponentSets } from "~/utils/sanitization.js";
import { hasValue, isRectangleCornerRadii, isTruthy } from "~/utils/identity.js";
import {
  removeEmptyKeys,
  generateVarId,
  type StyleId,
  parsePaint,
  isVisible,
} from "~/utils/common.js";
import { buildSimplifiedStrokes, type SimplifiedStroke } from "~/transformers/style.js";
import { buildSimplifiedEffects, type SimplifiedEffects } from "~/transformers/effects.js";
/**
 * TODO ITEMS
 *
 * - Improve layout handling—translate from Figma vocabulary to CSS
 * - Pull image fills/vectors out to top level for better AI visibility
 *   ? Implement vector parents again for proper downloads
 * ? Look up existing styles in new MCP endpoint—Figma supports individual lookups without enterprise /v1/styles/:key
 * ? Parse out and save .cursor/rules/design-tokens file on command
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
interface TableCounter {
  row_count: number;
  rows_seen: Map<string, number>;
}

type GlobalVars = {
  styles: Record<StyleId, StyleTypes>;
  lookup: Map<string, StyleId>;  // Fast lookup for existing styles
  usageCount: Record<StyleId, number>;  // Track usage count for optimization
  nodeSeenCount: Map<string, number>;  // Track duplicate nodes
  tableCounters: Map<string, TableCounter>;  // Track table-specific counters
};

export interface SimplifiedDesign {
  name: string;
  lastModified: string;
  thumbnailUrl: string;
  nodes: SimplifiedNode[];
  components: Record<string, SimplifiedComponentDefinition>;
  componentSets: Record<string, SimplifiedComponentSetDefinition>;
  globalVars: GlobalVars;
}

export interface ComponentProperties {
  name: string;
  value: string;
  type: ComponentPropertyType;
}

export interface SimplifiedNode {
  id: string;
  name: string;
  type: string; // e.g. FRAME, TEXT, INSTANCE, RECTANGLE, SUMMARY, etc.
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
  componentId?: string;
  componentProperties?: ComponentProperties[];
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

/**
 * Optimize styles by inlining low-usage styles
 * @param nodes - Simplified nodes
 * @param globalVars - Global variables containing styles and usage counts
 * @returns Optimized nodes with inlined styles
 */
function optimizeStyles(nodes: SimplifiedNode[], globalVars: GlobalVars): SimplifiedNode[] {
  const USAGE_THRESHOLD = 3;
  
  // Determine which styles to inline based on usage count
  const stylesToInline = new Set<StyleId>();
  Object.entries(globalVars.usageCount).forEach(([styleId, count]) => {
    if (count < USAGE_THRESHOLD) {
      stylesToInline.add(styleId as StyleId);
    }
  });
  
  // Recursively inline styles in nodes
  function inlineStylesInNode(node: SimplifiedNode): SimplifiedNode {
    const updatedNode = { ...node };
    
    // Check and inline each style property
    const styleProperties: (keyof SimplifiedNode)[] = ['textStyle', 'fills', 'strokes', 'effects', 'layout'];
    
    styleProperties.forEach(prop => {
      const styleId = updatedNode[prop] as string | undefined;
      if (styleId && stylesToInline.has(styleId as StyleId)) {
        // Inline the style value directly
        const styleValue = globalVars.styles[styleId as StyleId];
        (updatedNode as any)[prop] = styleValue;
      }
    });
    
    // Process children recursively
    if (updatedNode.children) {
      updatedNode.children = updatedNode.children.map(child => inlineStylesInNode(child));
    }
    
    return updatedNode;
  }
  
  // Clean up unused styles from globalVars
  stylesToInline.forEach(styleId => {
    delete globalVars.styles[styleId];
  });
  
  return nodes.map(node => inlineStylesInNode(node));
}

// ---------------------- PARSING ----------------------
export function parseFigmaResponse(data: GetFileResponse | GetFileNodesResponse, maxDepth?: number): SimplifiedDesign {
  const aggregatedComponents: Record<string, Component> = {};
  const aggregatedComponentSets: Record<string, ComponentSet> = {};
  let nodesToParse: Array<FigmaDocumentNode>;

  if ("nodes" in data) {
    // GetFileNodesResponse
    const nodeResponses = Object.values(data.nodes); // Compute once
    nodeResponses.forEach((nodeResponse) => {
      if (nodeResponse.components) {
        Object.assign(aggregatedComponents, nodeResponse.components);
      }
      if (nodeResponse.componentSets) {
        Object.assign(aggregatedComponentSets, nodeResponse.componentSets);
      }
    });
    nodesToParse = nodeResponses.map((n) => n.document);
  } else {
    // GetFileResponse
    Object.assign(aggregatedComponents, data.components);
    Object.assign(aggregatedComponentSets, data.componentSets);
    nodesToParse = data.document.children;
  }

  const sanitizedComponents = sanitizeComponents(aggregatedComponents);
  const sanitizedComponentSets = sanitizeComponentSets(aggregatedComponentSets);

  const { name, lastModified, thumbnailUrl } = data;

  let globalVars: GlobalVars = {
    styles: {},
    lookup: new Map(),
    usageCount: {},
    nodeSeenCount: new Map(),
    tableCounters: new Map(),
  };

  let simplifiedNodes: SimplifiedNode[] = nodesToParse
    .filter(isVisible)
    .map((n) => parseNode(globalVars, n, undefined, 0, undefined, maxDepth))
    .filter((child) => child !== null && child !== undefined);

  // Optimize styles by inlining low-usage ones
  simplifiedNodes = optimizeStyles(simplifiedNodes, globalVars);

  const simplifiedDesign: SimplifiedDesign = {
    name,
    lastModified,
    thumbnailUrl: thumbnailUrl || "",
    nodes: simplifiedNodes,
    components: sanitizedComponents,
    componentSets: sanitizedComponentSets,
    globalVars,
  };

  return removeEmptyKeys(simplifiedDesign);
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
  // Create stable string representation for lookup
  const valueStr = JSON.stringify(value, Object.keys(value).sort());
  
  // Check if the same value already exists using fast lookup
  const existingVarId = globalVars.lookup.get(valueStr);
  
  if (existingVarId) {
    // Increment usage count
    globalVars.usageCount[existingVarId] = (globalVars.usageCount[existingVarId] || 0) + 1;
    return existingVarId;
  }

  // Create a new variable if it doesn't exist
  const varId = generateVarId(prefix);
  globalVars.styles[varId] = value;
  globalVars.lookup.set(valueStr, varId);
  globalVars.usageCount[varId] = 1;
  return varId;
}

/**
 * Get structural signature of a node for pattern detection
 * @param node - The node to analyze
 * @returns A structural signature string
 */
function getNodeStructureSignature(node: FigmaDocumentNode): string {
  const structureParts: string[] = [];
  
  function collectStructure(n: FigmaDocumentNode, level: number = 0) {
    if (level > 2) return; // Only check first few levels
    
    // Record node type
    structureParts.push(`${level}:${n.type || 'UNKNOWN'}`);
    
    // Record children count and types
    if (hasValue('children', n) && n.children.length > 0) {
      const childTypes = n.children.map(c => c.type || 'UNKNOWN');
      structureParts.push(`${level}:children=${n.children.length}`);
      structureParts.push(`${level}:types=${Array.from(new Set(childTypes)).sort().join(',')}`);
      
      // Recursively process first few children
      n.children.slice(0, 3).forEach(child => collectStructure(child, level + 1));
    }
  }
  
  collectStructure(node);
  return structureParts.join('|');
}

/**
 * Get content signature of a node for duplicate detection
 * @param node - The node to get signature from
 * @returns A content-based signature string
 */
function getContentSignature(node: FigmaDocumentNode): string {
  const contentParts: string[] = [];
  
  function extractContent(n: FigmaDocumentNode) {
    // Text content
    if (n.type === 'TEXT' && hasValue('characters', n)) {
      const text = n.characters.trim();
      if (text) {
        // Only take first 20 chars as feature
        contentParts.push(text.substring(0, 20));
      }
    }
    // Other node types represented by type and count
    else if (n.type === 'FRAME' || n.type === 'GROUP' || n.type === 'INSTANCE') {
      const childrenCount = hasValue('children', n) ? n.children.length : 0;
      contentParts.push(`${n.type}[${childrenCount}]`);
    }
    
    // Process first few children
    if (hasValue('children', n)) {
      n.children.slice(0, 5).forEach(child => extractContent(child));
    }
  }
  
  extractContent(node);
  
  // Generate signature
  return contentParts.length > 0 ? contentParts.join('|') : getNodeStructureSignature(node);
}

function parseNode(
  globalVars: GlobalVars,
  n: FigmaDocumentNode,
  parent?: FigmaDocumentNode,
  depth: number = 0,
  parentContext?: string,
  maxDepth?: number,
): SimplifiedNode | null {
  // Check if exceeds maximum depth limit
  if (maxDepth !== undefined && depth > maxDepth) {
    return {
      id: `depth_limit_${n.id}`,
      name: n.name,
      type: 'DEPTH_LIMIT',
      text: `（深度 ${depth} 超過限制，省略子節點）`
    };
  }

  const { id, name, type } = n;

  const simplified: SimplifiedNode = {
    id,
    name,
    type,
  };

  if (type === "INSTANCE") {
    if (hasValue("componentId", n)) {
      simplified.componentId = n.componentId;
    }

    // Add specific properties for instances of components
    if (hasValue("componentProperties", n)) {
      simplified.componentProperties = Object.entries(n.componentProperties ?? {}).map(
        ([name, { value, type }]) => ({
          name,
          value: value.toString(),
          type,
        }),
      );
    }
  }

  // text
  if (hasValue("style", n) && Object.keys(n.style).length) {
    const style = n.style;
    const textStyle: TextStyle = {
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
  if (Object.keys(effects).length) {
    simplified.effects = findOrCreateVar(globalVars, effects, "effect");
  }

  // Process layout with intelligent filtering
  const layout = buildSimplifiedLayout(n, parent);
  if (Object.keys(layout).length > 1) {
    // Filter to only important visual properties
    const importantLayout: Partial<SimplifiedLayout> = {};
    
    // Keep only visual-related properties
    if (layout.mode && layout.mode !== 'none') {
      importantLayout.mode = layout.mode;
    }
    if (layout.justifyContent) {
      importantLayout.justifyContent = layout.justifyContent;
    }
    if (layout.alignItems) {
      importantLayout.alignItems = layout.alignItems;
    }
    if (layout.gap) {
      importantLayout.gap = layout.gap;
    }
    if (layout.padding) {
      importantLayout.padding = layout.padding;
    }
    if (layout.wrap) {
      importantLayout.wrap = layout.wrap;
    }
    
    // Only store if there are meaningful properties
    if (Object.keys(importantLayout).length > 0 && importantLayout.mode !== 'none') {
      simplified.layout = findOrCreateVar(globalVars, importantLayout, "layout");
    }
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

  // Identify container type based on structure
  let containerType = parentContext;
  
  // Generic table detection: check if there are repeating child structures
  if (hasValue('children', n) && n.children.length > 3) {
    // Check if children have similar structures (possibly table rows)
    const childSignatures = new Map<string, number>();
    
    // Analyze first 10 children
    n.children.slice(0, 10).forEach(child => {
      const sig = getNodeStructureSignature(child);
      childSignatures.set(sig, (childSignatures.get(sig) || 0) + 1);
    });
    
    // If there are repeating structures, likely a table
    const maxCount = Math.max(...Array.from(childSignatures.values()));
    if (maxCount >= 3) {
      containerType = 'table_container';
      // Create independent counter for this table container
      const tableId = n.id;
      if (!globalVars.tableCounters.has(tableId)) {
        globalVars.tableCounters.set(tableId, {
          row_count: 0,
          rows_seen: new Map()
        });
      }
    }
  }

  // Recursively process child nodes.
  // Include children at the very end so all relevant configuration data for the element is output first and kept together for the AI.
  if (hasValue("children", n) && n.children.length > 0) {
    const children: SimplifiedNode[] = [];
    
    // Get current table counter if in table container
    let currentTableCounter: TableCounter | undefined;
    if (containerType === 'table_container') {
      const tableId = n.id;
      currentTableCounter = globalVars.tableCounters.get(tableId);
    }
    
    for (const child of n.children) {
      if (!isVisible(child)) continue;
      
      const childName = child.name || '';
      
      // Generic intermediate layer skipping logic
      if (child.type === 'INSTANCE') {
        // If INSTANCE has only one child, it might be unnecessary wrapper
        if (hasValue('children', child) && child.children.length === 1) {
          // Use the child directly
          const simplified = parseNode(globalVars, child.children[0], n, depth + 1, containerType, maxDepth);
          if (simplified) {
            children.push(simplified);
          }
          continue;
        }
      }
      
      // In table containers, identify duplicate rows
      if (containerType === 'table_container' && currentTableCounter) {
        const signature = getContentSignature(child);
        const rowsSeen = currentTableCounter.rows_seen;
        
        const seenCount = rowsSeen.get(signature) || 0;
        if (seenCount > 0) {
          rowsSeen.set(signature, seenCount + 1);
          // Keep only first 3 examples
          if (currentTableCounter.row_count >= 3) {
            continue;
          }
        } else {
          rowsSeen.set(signature, 1);
          currentTableCounter.row_count++;
        }
      }
      
      const simplifiedChild = parseNode(globalVars, child, n, depth + 1, containerType, maxDepth);
      if (simplifiedChild) {
        children.push(simplifiedChild);
      }
    }
    
    // Add summary for omitted table rows
    if (currentTableCounter && currentTableCounter.rows_seen.size > 0) {
      const totalRows = Array.from(currentTableCounter.rows_seen.values()).reduce((sum, count) => sum + count, 0);
      if (totalRows > 3) {
        children.push({
          id: 'summary_' + generateVarId('node'),
          name: 'Repetitive content summary',
          type: 'SUMMARY',
          text: `(Omitted ${totalRows - 3} similar items)`
        });
      }
    }
    
    if (children.length) {
      simplified.children = children;
    }
  }

  // Convert VECTOR to IMAGE
  if (type === "VECTOR") {
    simplified.type = "IMAGE-SVG";
  }

  return simplified;
}
