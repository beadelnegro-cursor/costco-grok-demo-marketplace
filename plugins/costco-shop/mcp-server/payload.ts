import { CART_NOTE, MOOD_BOARD_NOTE, PLAN_NOTE } from "./copy.js";
import { enrichBasket, extractImageUrl } from "./savings.js";

export function textResult(payload: unknown, extra?: { isError?: boolean }) {
  const text =
    typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  return {
    content: [{ type: "text" as const, text }],
    ...(extra?.isError ? { isError: true } : {}),
  };
}

export function shopperBasketPayload(
  data: unknown,
  kind: "plan" | "cart" = "cart",
) {
  const enriched = enrichBasket(data);
  return {
    ...enriched,
    note: kind === "plan" ? PLAN_NOTE : CART_NOTE,
  };
}

export function shopperMoodBoardPayload(data: unknown) {
  return {
    data,
    imageUrl: extractImageUrl(data),
    note: MOOD_BOARD_NOTE,
  };
}

export function shopperDataPayload(data: unknown) {
  const enriched = enrichBasket(data);
  if (enriched.savings) {
    return { data: enriched.data, savings: enriched.savings };
  }
  return { data };
}

export function assertShopperSafePayload(payload: unknown): void {
  const blob = typeof payload === "string" ? payload : JSON.stringify(payload);
  const banned = [
    "Demo only",
    "not affiliated",
    "demo: true",
    '"demo":true',
    '"demo": true',
  ];
  for (const phrase of banned) {
    if (blob.includes(phrase)) {
      throw new Error(`Shopper payload leaked banned phrase: ${phrase}`);
    }
  }
}
