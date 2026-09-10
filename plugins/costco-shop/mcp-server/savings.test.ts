import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CART_NOTE, MOOD_BOARD_NOTE, PLAN_NOTE, TOOL_DESCRIPTIONS } from "./copy.js";
import {
  assertShopperSafePayload,
  shopperBasketPayload,
  shopperMoodBoardPayload,
} from "./payload.js";
import {
  enrichBasket,
  enrichLine,
  extractImageUrl,
  formatUsd,
  multiplierForCategory,
  RETAIL_EQUIVALENT_MULTIPLIERS,
  savingsLabelFor,
} from "./savings.js";

describe("retail-equivalent multipliers", () => {
  it("matches category substrings and falls back to default", () => {
    assert.equal(multiplierForCategory("Halloween decor"), RETAIL_EQUIVALENT_MULTIPLIERS.halloween);
    assert.equal(multiplierForCategory("Bakery"), RETAIL_EQUIVALENT_MULTIPLIERS.bakery);
    assert.equal(multiplierForCategory("unknown aisle"), RETAIL_EQUIVALENT_MULTIPLIERS.default);
    assert.equal(multiplierForCategory(null), RETAIL_EQUIVALENT_MULTIPLIERS.default);
  });
});

describe("enrichLine", () => {
  it("uses API compareAt when present", () => {
    const { enriched, line } = enrichLine({
      name: "Kirkland sparkling water",
      price: 10,
      quantity: 2,
      compareAt: 14,
    });
    assert.deepEqual(enriched, {
      name: "Kirkland sparkling water",
      quantity: 2,
      price: 10,
      compareAt: 14,
      saved: 8,
      category: null,
      savingsSource: "api",
    });
    assert.equal((line as { savingsSource: string }).savingsSource, "api");
  });

  it("computes compareAt from the category table when the API has warehouse price only", () => {
    const { enriched } = enrichLine({
      name: "Pumpkin pie",
      price: 10,
      qty: 1,
      category: "Bakery",
    });
    assert.ok(enriched);
    assert.equal(enriched.savingsSource, "retail-equivalent");
    assert.equal(enriched.compareAt, 13.5);
    assert.equal(enriched.saved, 3.5);
  });

  it("does not invent a line when there is no price", () => {
    const { enriched } = enrichLine({ name: "Mystery item", category: "party" });
    assert.equal(enriched, null);
  });

  it("never reports negative saved", () => {
    const { enriched } = enrichLine({
      name: "Already cheaper elsewhere",
      price: 20,
      compareAt: 12,
      quantity: 1,
    });
    assert.ok(enriched);
    assert.equal(enriched.saved, 0);
  });
});

describe("enrichBasket", () => {
  it("adds cart-level youSaved / savingsLabel from priced lines", () => {
    const result = enrichBasket({
      title: "Halloween table",
      items: [
        { name: "Candy variety pack", price: 20, quantity: 1, category: "candy" },
        { name: "Sparkling water", price: 10, quantity: 2, compareAt: 13 },
      ],
    });

    assert.ok(result.savings);
    assert.equal(result.savings.warehouseTotal, 40);
    assert.equal(result.savings.compareAtTotal, 53);
    assert.equal(result.savings.youSaved, 13);
    assert.equal(result.savings.savingsTotal, 13);
    assert.equal(result.savings.savingsLabel, "You're saving $13.00 with Costco");
    assert.equal(result.basket?.title, "Halloween table");
    assert.equal(result.basket?.lines.length, 2);

    const items = (result.data as { items: Array<{ saved: number; compareAt: number }> }).items;
    assert.equal(items[0].compareAt, 27);
    assert.equal(items[1].saved, 6);
  });

  it("walks nested cart.lines and leaves savings null when nothing is priced", () => {
    const priced = enrichBasket({ cart: { lines: [{ name: "Chips", price: 8, category: "snacks" }] } });
    assert.ok(priced.savings);
    assert.equal(priced.savings.youSaved, priced.basket?.lines[0].saved);

    const empty = enrichBasket({ message: "cart is empty" });
    assert.equal(empty.savings, null);
    assert.equal(empty.basket, null);
  });
});

describe("shopper payloads", () => {
  it("strips demo disclaimers from plan/cart wrappers", () => {
    const payload = shopperBasketPayload(
      { title: "Party", lines: [{ name: "Cake", price: 15, category: "bakery" }] },
      "plan",
    );
    assert.equal("disclaimer" in payload, false);
    assert.equal("demo" in payload, false);
    assert.equal(payload.note, PLAN_NOTE);
    assert.ok(payload.savings && payload.savings.youSaved > 0);
    assertShopperSafePayload(payload);
    assertShopperSafePayload(shopperBasketPayload({ items: [] }, "cart"));
  });

  it("surfaces mood-board imageUrl and does not invent one", () => {
    const withUrl = shopperMoodBoardPayload({
      imageUrl: "https://img.example/board.png",
      mocked: true,
    });
    assert.equal(withUrl.imageUrl, "https://img.example/board.png");
    assert.equal(withUrl.note, MOOD_BOARD_NOTE);
    assertShopperSafePayload(withUrl);

    const missing = shopperMoodBoardPayload({ mocked: true, imageUrl: null });
    assert.equal(missing.imageUrl, null);
    assert.equal(extractImageUrl({ collageUrl: "https://img.example/collage.jpg" }), "https://img.example/collage.jpg");
    assert.equal(extractImageUrl({ url: "/relative.png" }), null);
  });

  it("formats the savings line the skill is told to read", () => {
    assert.equal(savingsLabelFor(12.5), "You're saving $12.50 with Costco");
    assert.equal(savingsLabelFor(0), null);
    assert.equal(formatUsd(4), "$4.00");
    assert.match(CART_NOTE, /Purchase/);
    assert.match(PLAN_NOTE, /Make swaps/);
  });
});

describe("shopper-safe tool copy", () => {
  it("does not lean on demo disclaimers in tool descriptions or notes", () => {
    const blob = JSON.stringify({ TOOL_DESCRIPTIONS, PLAN_NOTE, CART_NOTE, MOOD_BOARD_NOTE });
    assert.equal(blob.toLowerCase().includes("demo"), false);
    assert.equal(blob.includes("not affiliated"), false);
    assert.equal(blob.includes("Demo only"), false);
  });
});
