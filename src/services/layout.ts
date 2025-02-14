import { FigmaDocumentNode } from "../types/figma";

export interface SimplifiedLayout {
  mode: "none" | "row" | "column";
  justifyContent?: "flex-start" | "flex-end" | "center" | "space-between";
  alignItems?: "flex-start" | "flex-end" | "center" | "space-between";
  wrap?: boolean;
  gap?: number;
  padding?: {
    top: string;
    right: string;
    bottom: string;
    left: string;
  };
  sizing?: {
    horizontal?: "fixed" | "fill" | "hug";
    vertical?: "fixed" | "fill" | "hug";
  };
  childAlignment?: "inherit" | "stretch";
  grow?: number;
  positioning?: "auto" | "absolute";
}

// Parameters for building the layout
interface BuildLayoutParams {
  layoutMode?: "NONE" | "HORIZONTAL" | "VERTICAL";
  primaryAxisAlignItems?: "MIN" | "MAX" | "CENTER" | "SPACE_BETWEEN";
  counterAxisAlignItems?: "MIN" | "MAX" | "CENTER" | "SPACE_BETWEEN";
  layoutWrap?: "NO_WRAP" | "WRAP";
  itemSpacing?: number;
  primaryAxisSizingMode?: "FIXED" | "AUTO";
  counterAxisSizingMode?: "FIXED" | "AUTO";
  layoutSizingHorizontal?: "FIXED" | "FILL" | "HUG";
  layoutSizingVertical?: "FIXED" | "FILL" | "HUG";
  paddingTop?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  paddingRight?: number;
  layoutAlign?: string;
  layoutGrow?: number;
  layoutPositioning?: string;
}

// Convert Figma's layout config into a more typical flex-like schema
export function buildSimplifiedLayout({
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
}: BuildLayoutParams): SimplifiedLayout | undefined {
  if (!layoutMode || layoutMode === "NONE") return undefined;

  // interpret Figma layout directions
  const mode = layoutMode === "HORIZONTAL" ? "row" : "column";

  // interpret align items
  function convertAlign(axisAlign?: "MIN" | "MAX" | "CENTER" | "SPACE_BETWEEN") {
    switch (axisAlign) {
      case "MIN":
        return "flex-start";
      case "MAX":
        return "flex-end";
      case "CENTER":
        return "center";
      case "SPACE_BETWEEN":
        return "space-between";
      default:
        return undefined;
    }
  }

  const justifyContent = convertAlign(primaryAxisAlignItems);
  const alignItems = convertAlign(counterAxisAlignItems);

  const wrap = layoutWrap === "WRAP";
  const gap = itemSpacing ?? 0;

  // interpret sizing
  function convertSizing(s?: "FIXED" | "FILL" | "HUG"): "fixed" | "fill" | "hug" | undefined {
    if (s === "FIXED") return "fixed";
    if (s === "FILL") return "fill";
    if (s === "HUG") return "hug";
    return undefined;
  }

  const sizing = {
    horizontal: convertSizing(layoutSizingHorizontal),
    vertical: convertSizing(layoutSizingVertical),
  };

  // gather padding
  const padding: SimplifiedLayout["padding"] =
    paddingTop || paddingBottom || paddingLeft || paddingRight
      ? {
          top: `${paddingTop ?? 0}px`,
          right: `${paddingRight ?? 0}px`,
          bottom: `${paddingBottom ?? 0}px`,
          left: `${paddingLeft ?? 0}px`,
        }
      : undefined;

  return {
    mode,
    justifyContent,
    alignItems,
    wrap,
    gap,
    sizing,
    padding,
    childAlignment: layoutAlign?.toLowerCase() as "inherit" | "stretch",
    grow: layoutGrow,
    positioning: layoutPositioning?.toLowerCase() as "auto" | "absolute",
  };
}
