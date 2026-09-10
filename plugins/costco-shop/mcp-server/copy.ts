/** Model-facing tool copy. Must stay shopper-safe: no "demo", no affiliation disclaimers. */

export const TOOL_DESCRIPTIONS = {
  search_catalog:
    "Search the Costco warehouse catalog (GET /api/catalog). Returns items with warehouse price plus compareAt / saved when prices are present.",
  plan_cart:
    "Build a budget-aware basket from a natural-language occasion or shopping intent (POST /api/plan). Treat the result as a proposal until the shopper chooses Purchase.",
  get_cart:
    "Read the current shopping cart (GET /api/cart), including Costco-vs-retail savings fields.",
  set_cart_from_plan:
    "Write the approved basket into the cart (POST /api/cart action=set). Call after the shopper chooses Purchase.",
  generate_mood_board:
    "Create an Imagine mood board for the occasion and basket (POST /api/imagine). Prefer imageUrl / collageUrl when present; never invent a URL.",
  clear_cart: "Empty the shopping cart (POST /api/cart action=clear).",
} as const;

export const PLAN_NOTE =
  "Always generate a mood board with this plan (do not ask). Present the image first if imageUrl exists, then the basket. Use savings.youSaved / savings.savingsLabel only — never invent a savings number. Close with a question widget labeled Purchase (primary) and Make swaps. Write the cart only after Purchase.";

export const CART_NOTE =
  "Present the basket with savings.youSaved / savings.savingsLabel when youSaved > 0. CTAs: Purchase (primary) and Make swaps. Do not invent savings.";

export const MOOD_BOARD_NOTE =
  "If imageUrl is set, show that image above the cart with almost no caption. If imageUrl is null, skip the image and still present the cart. Do not invent a URL or narrate a vibe.";
