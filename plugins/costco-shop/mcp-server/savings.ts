/**
 * Warehouse vs typical grocery/retail equivalent.
 *
 * The shopping API catalog often has warehouse `price` only. Shopper-facing
 * "You saved $X at Costco" must come from structured fields, not a silent
 * invented number. When a line already carries compare-at / MSRP / retail,
 * we use that (source: api). Otherwise we apply the category multiplier
 * table below (source: retail-equivalent) so the MCP response always has
 * a documented basis.
 *
 * Multipliers are typical retail ÷ warehouse, not live competitor quotes.
 */

export const RETAIL_EQUIVALENT_MULTIPLIERS = {
  grocery: 1.28,
  pantry: 1.28,
  produce: 1.22,
  meat: 1.32,
  seafood: 1.32,
  dairy: 1.26,
  bakery: 1.35,
  deli: 1.3,
  frozen: 1.28,
  beverage: 1.3,
  beverages: 1.3,
  drinks: 1.3,
  snacks: 1.32,
  candy: 1.35,
  household: 1.4,
  cleaning: 1.4,
  paper: 1.45,
  personal: 1.35,
  health: 1.3,
  beauty: 1.35,
  party: 1.35,
  seasonal: 1.35,
  halloween: 1.38,
  decor: 1.38,
  decorations: 1.38,
  electronics: 1.12,
  apparel: 1.3,
  clothing: 1.3,
  default: 1.28,
} as const;

export const SAVINGS_METHOD = {
  id: "warehouse-vs-typical-retail",
  basis: "Costco warehouse price vs typical grocery/retail equivalent",
  whenApiProvidesCompareAt:
    "Use the line's compareAt / msrp / retailPrice / listPrice / typicalPrice as the unit compare-at.",
  whenMissing:
    "compareAt = round(warehouse unit price × category multiplier). Category is matched by substring against RETAIL_EQUIVALENT_MULTIPLIERS; otherwise default 1.28.",
  lineSaved: "saved = round((compareAt − unitPrice) × qty); never negative.",
  cart: "youSaved / savingsTotal = sum of line saved; compareAtTotal = sum of compareAt × qty.",
} as const;

const LINE_ARRAY_KEYS = ["lines", "items", "products", "cartItems"] as const;
const NEST_KEYS = ["cart", "plan", "data", "basket", "result"] as const;

const COMPARE_AT_KEYS = [
  "compareAt",
  "compare_at",
  "msrp",
  "retailPrice",
  "retail_price",
  "listPrice",
  "list_price",
  "typicalPrice",
  "typical_price",
] as const;

const PRICE_KEYS = ["price", "unitPrice", "unit_price", "warehousePrice"] as const;
const QTY_KEYS = ["quantity", "qty"] as const;
const NAME_KEYS = ["name", "title", "productName", "product_name"] as const;
const CATEGORY_KEYS = ["category", "department", "aisle", "dept"] as const;
const TITLE_KEYS = ["title", "name", "occasion", "intent", "label"] as const;

export type SavingsSource = "api" | "retail-equivalent";

export type EnrichedLine = {
  name: string;
  quantity: number;
  price: number;
  compareAt: number;
  saved: number;
  category: string | null;
  savingsSource: SavingsSource;
};

export type BasketSavings = {
  warehouseTotal: number;
  compareAtTotal: number;
  youSaved: number;
  savingsTotal: number;
  savingsLabel: string | null;
  method: typeof SAVINGS_METHOD;
  pricedLineCount: number;
};

export type NormalizedBasket = BasketSavings & {
  title: string | null;
  lines: EnrichedLine[];
};

export type ShopperBasketPayload = {
  data: unknown;
  basket: NormalizedBasket | null;
  savings: BasketSavings | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function money(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function savingsLabelFor(youSaved: number): string | null {
  if (!(youSaved > 0)) return null;
  return `You saved ${formatUsd(youSaved)} at Costco`;
}

export function multiplierForCategory(category?: string | null): number {
  const raw = (category ?? "").trim().toLowerCase();
  if (raw) {
    for (const [key, multiplier] of Object.entries(RETAIL_EQUIVALENT_MULTIPLIERS)) {
      if (key !== "default" && raw.includes(key)) {
        return multiplier;
      }
    }
  }
  return RETAIL_EQUIVALENT_MULTIPLIERS.default;
}

function firstFiniteNumber(
  record: Record<string, unknown>,
  keys: readonly string[],
): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function firstString(
  record: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function enrichLine(raw: unknown): { line: unknown; enriched: EnrichedLine | null } {
  if (!isRecord(raw)) return { line: raw, enriched: null };

  const unitPrice = firstFiniteNumber(raw, PRICE_KEYS);
  if (unitPrice === null || unitPrice < 0) {
    return { line: raw, enriched: null };
  }

  const quantityRaw = firstFiniteNumber(raw, QTY_KEYS);
  const quantity = quantityRaw && quantityRaw > 0 ? quantityRaw : 1;
  const category = firstString(raw, CATEGORY_KEYS);
  const name = firstString(raw, NAME_KEYS) ?? "Item";

  const apiCompareAt = firstFiniteNumber(raw, COMPARE_AT_KEYS);
  let compareAt: number;
  let savingsSource: SavingsSource;
  if (apiCompareAt !== null && apiCompareAt > 0) {
    compareAt = money(apiCompareAt);
    savingsSource = "api";
  } else {
    compareAt = money(unitPrice * multiplierForCategory(category));
    savingsSource = "retail-equivalent";
  }

  const saved = money(Math.max(0, compareAt - unitPrice) * quantity);
  const enriched: EnrichedLine = {
    name,
    quantity,
    price: money(unitPrice),
    compareAt,
    saved,
    category,
    savingsSource,
  };

  return {
    line: {
      ...raw,
      compareAt,
      saved,
      savingsSource,
    },
    enriched,
  };
}

function findLineArray(
  root: unknown,
): { parent: Record<string, unknown>; key: string } | { parent: unknown[]; key: null } | null {
  if (Array.isArray(root)) {
    return { parent: root, key: null };
  }
  if (!isRecord(root)) return null;

  for (const key of LINE_ARRAY_KEYS) {
    if (Array.isArray(root[key])) {
      return { parent: root, key };
    }
  }
  for (const nest of NEST_KEYS) {
    if (nest in root) {
      const found = findLineArray(root[nest]);
      if (found) return found;
    }
  }
  return null;
}

function readTitle(root: unknown): string | null {
  if (!isRecord(root)) return null;
  const direct = firstString(root, TITLE_KEYS);
  if (direct) return direct;
  for (const nest of NEST_KEYS) {
    const nested = readTitle(root[nest]);
    if (nested) return nested;
  }
  return null;
}

function totalsFrom(lines: EnrichedLine[]): BasketSavings {
  let warehouseTotal = 0;
  let compareAtTotal = 0;
  let youSaved = 0;
  for (const line of lines) {
    warehouseTotal += line.price * line.quantity;
    compareAtTotal += line.compareAt * line.quantity;
    youSaved += line.saved;
  }
  warehouseTotal = money(warehouseTotal);
  compareAtTotal = money(compareAtTotal);
  youSaved = money(youSaved);
  return {
    warehouseTotal,
    compareAtTotal,
    youSaved,
    savingsTotal: youSaved,
    savingsLabel: savingsLabelFor(youSaved),
    method: SAVINGS_METHOD,
    pricedLineCount: lines.length,
  };
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function enrichBasket(data: unknown): ShopperBasketPayload {
  if (data === undefined || data === null) {
    return { data, basket: null, savings: null };
  }

  const cloned = cloneJson(data);
  const located = findLineArray(cloned);
  if (!located) {
    return { data: cloned, basket: null, savings: null };
  }

  const sourceLines = located.key === null ? located.parent : located.parent[located.key];
  if (!Array.isArray(sourceLines)) {
    return { data: cloned, basket: null, savings: null };
  }

  const enrichedLines: EnrichedLine[] = [];
  const nextLines = sourceLines.map((raw) => {
    const { line, enriched } = enrichLine(raw);
    if (enriched) enrichedLines.push(enriched);
    return line;
  });

  if (located.key === null) {
    return {
      data: nextLines,
      basket: {
        title: null,
        lines: enrichedLines,
        ...totalsFrom(enrichedLines),
      },
      savings: totalsFrom(enrichedLines),
    };
  }

  located.parent[located.key] = nextLines;
  const savings = totalsFrom(enrichedLines);
  if (isRecord(located.parent)) {
    located.parent.youSaved = savings.youSaved;
    located.parent.savingsTotal = savings.savingsTotal;
    located.parent.compareAtTotal = savings.compareAtTotal;
    located.parent.warehouseTotal = savings.warehouseTotal;
    located.parent.savingsLabel = savings.savingsLabel;
  }

  const basket: NormalizedBasket = {
    title: readTitle(cloned),
    lines: enrichedLines,
    ...savings,
  };

  return { data: cloned, basket, savings };
}

export function extractImageUrl(data: unknown): string | null {
  if (typeof data === "string") {
    const trimmed = data.trim();
    return /^https?:\/\//i.test(trimmed) ? trimmed : null;
  }
  if (!isRecord(data)) return null;

  const keys = [
    "imageUrl",
    "image_url",
    "collageUrl",
    "collage_url",
    "moodBoardUrl",
    "mood_board_url",
    "url",
    "image",
  ];
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && /^https?:\/\//i.test(value.trim())) {
      return value.trim();
    }
  }
  for (const nest of NEST_KEYS) {
    const nested = extractImageUrl(data[nest]);
    if (nested) return nested;
  }
  return null;
}
