import { isFrame } from "~/utils/identity";
import type { Node as FigmaDocumentNode } from "@figma/rest-api-spec";

export interface SimplifiedLayout {
  mode: "none" | "row" | "column";
  justifyContent?: "flex-start" | "flex-end" | "center" | "space-between" | "baseline";
  alignItems?: "flex-start" | "flex-end" | "center" | "space-between" | "baseline";
  wrap?: boolean;
  gap?: string;
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

// Convert Figma's layout config into a more typical flex-like schema
export function buildSimplifiedLayout(n: FigmaDocumentNode): SimplifiedLayout | undefined {
  if (!isFrame(n) || n.layoutMode === "NONE") return undefined;

  // interpret Figma layout directions
  const mode = n.layoutMode === "HORIZONTAL" ? "row" : "column";

  // interpret align items
  function convertAlign(axisAlign?: "MIN" | "MAX" | "CENTER" | "SPACE_BETWEEN" | "BASELINE") {
    switch (axisAlign) {
      case "MIN":
        return "flex-start";
      case "MAX":
        return "flex-end";
      case "CENTER":
        return "center";
      case "SPACE_BETWEEN":
        return "space-between";
      case "BASELINE":
        return "baseline";
      default:
        return undefined;
    }
  }

  const justifyContent = convertAlign(n.primaryAxisAlignItems);
  const alignItems = convertAlign(n.counterAxisAlignItems);

  const wrap = n.layoutWrap === "WRAP";
  const gap = `${n.itemSpacing ?? 0}px`;

  // interpret sizing
  function convertSizing(s?: "FIXED" | "FILL" | "HUG"): "fixed" | "fill" | "hug" | undefined {
    if (s === "FIXED") return "fixed";
    if (s === "FILL") return "fill";
    if (s === "HUG") return "hug";
    return undefined;
  }

  const sizing = {
    horizontal: convertSizing(n.layoutSizingHorizontal),
    vertical: convertSizing(n.layoutSizingVertical),
  };

  // gather padding
  const padding: SimplifiedLayout["padding"] =
    n.paddingTop || n.paddingBottom || n.paddingLeft || n.paddingRight
      ? {
          top: `${n.paddingTop ?? 0}px`,
          right: `${n.paddingRight ?? 0}px`,
          bottom: `${n.paddingBottom ?? 0}px`,
          left: `${n.paddingLeft ?? 0}px`,
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
    childAlignment: n.layoutAlign?.toLowerCase() as "inherit" | "stretch",
    grow: n.layoutGrow,
    positioning: n.layoutPositioning?.toLowerCase() as "auto" | "absolute",
  };
}
