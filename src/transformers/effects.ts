import { DropShadowEffect, Node as FigmaDocumentNode } from "@figma/rest-api-spec";
import { formatRGBAColor } from "~/utils/common";
import { hasValue } from "~/utils/identity";

export type SimplifiedEffects = {
  boxShadow?: string;
};

export function buildSimplifiedEffects(n: FigmaDocumentNode): SimplifiedEffects {
  if (!hasValue("effects", n)) return {};
  const effects = n.effects.filter((e) => e.visible);
  const boxShadow = effects
    .filter((e) => e.type === "DROP_SHADOW")
    .map(simplifyDropShadow)
    .join(", ");
  if (!boxShadow) return {};
  return { boxShadow: boxShadow ?? undefined };
}

function simplifyDropShadow(effect: DropShadowEffect) {
  return `${effect.offset.x}px ${effect.offset.y}px ${effect.radius}px ${effect.spread}px ${formatRGBAColor(effect.color)}`;
}
