# costco-grok-demo-marketplace

GTMKO Use Case 2 demo marketplace: a Costco-style in-app AI shopping assistant plugin for **Grok Bot** and Cursor.

**Demo only. Not affiliated with Costco Wholesale.** No real checkout, no membership data, no live inventory.

Owner: **GTMKO Demo Team** / Bea Del Negro (Field Engineering demo)

Install id: `costco-shop@costco-grok-demo`

## Add the marketplace

In Cursor or Grok Bot:

```
/plugin marketplace add https://github.com/beadelnegro-cursor/costco-grok-demo-marketplace
```

## Install the plugin

```
/plugin install costco-shop@costco-grok-demo
```

That loads **Costco** (`costco-shop`): logo, `costco` MCP server, and the `costco-shop` skill.

## Demo API (required, not in this repo)

This marketplace does **not** vendor the Next.js warehouse app. The MCP server is a thin client of whatever is at `COSTCO_DEMO_API_BASE` (default `http://127.0.0.1:3000`).

1. Start the Costco demo API in its own repo / process.
2. If it is not on localhost:3000, set `COSTCO_DEMO_API_BASE`.
3. From `plugins/costco-shop`, run `npm install` so `npx tsx` can resolve `@modelcontextprotocol/sdk` and `zod`.

| Tool | Shopping API |
| --- | --- |
| `search_catalog` | `GET /api/catalog` |
| `plan_cart` | `POST /api/plan` |
| `get_cart` | `GET /api/cart` |
| `set_cart_from_plan` | `POST /api/cart` `{ action: "set" }` |
| `generate_mood_board` | `POST /api/imagine` |
| `clear_cart` | `POST /api/cart` `{ action: "clear" }` |

Shopper-facing replies (skill + successful MCP payloads) must **never** say “demo”, “demo only”, or “not affiliated”. That language stays here and in marketplace metadata only.

### Costco savings fields (MCP-enriched)

`plan_cart`, `get_cart`, `set_cart_from_plan`, and catalog search responses include structured savings so the bot can say **You’re saving $X with Costco** (soft, once, above the CTAs) without inventing a number.

Per line (when a warehouse `price` exists):

| Field | Meaning |
| --- | --- |
| `compareAt` | Typical grocery/retail equivalent, unit price |
| `saved` | `(compareAt − price) × qty`, floored at 0 |
| `savingsSource` | `api` if the line already had compare-at / MSRP / retail / list / typical price; otherwise `retail-equivalent` |

Cart / plan totals on `savings` (and mirrored onto the parent line array when present):

| Field | Meaning |
| --- | --- |
| `warehouseTotal` | Sum of warehouse `price × qty` |
| `compareAtTotal` | Sum of `compareAt × qty` |
| `youSaved` / `savingsTotal` | Sum of line `saved` |
| `savingsLabel` | `You're saving $X.XX with Costco` when `youSaved > 0`, else `null` |

**Method:** if the shopping API already returns `compareAt`, `msrp`, `retailPrice`, `listPrice`, or `typicalPrice`, MCP uses that (`savingsSource: "api"`). Otherwise MCP multiplies warehouse unit price by a documented category table in `plugins/costco-shop/mcp-server/savings.ts` (party/seasonal ~1.35×, bakery 1.35×, grocery default 1.28×, electronics 1.12×, …). These are typical-retail equivalents, not live competitor quotes. No extra API contract is required.

`generate_mood_board` passes through `imageUrl` / collage URL when present and does not invent one.

## Team marketplace / catalog sync

To get a SearchPlugins catalog ID with branding (logo on the connector):

1. In the Cursor dashboard, add this repo as a **team marketplace** (Plugins → Team Marketplaces → Import from repo).
2. Confirm it detects **1 plugin: Costco** (`costco-shop`) from `.cursor-plugin/marketplace.json` (`pluginRoot`: `plugins`, `source`: `costco-shop`).
3. Refresh / auto-sync the marketplace so SearchPlugins indexes `costco-shop@costco-grok-demo`.
4. The mark is `plugins/costco-shop/assets/logo.png`, referenced as `assets/logo.png` on the plugin. After sync, the connector should show the Costco **C** instead of a generic icon.

Grok Bot reads the same marketplace from `.grok-plugin/marketplace.json` (same payload).

Private repo: the importer needs read access or `raw.githubusercontent.com` will not resolve the logo.

## Layout

```
.cursor-plugin/marketplace.json
.grok-plugin/marketplace.json
plugins/costco-shop/
  .cursor-plugin/plugin.json
  .grok-plugin/plugin.json
  .mcp.json
  assets/logo.png
  mcp-server/run.mjs
  mcp-server/index.ts
  mcp-server/savings.ts
  mcp-server/payload.ts
  skills/costco-shop/SKILL.md
```

## Disclaimer

This is an internal GTMKO / Field Engineering demo. It is not a Costco product, not endorsed by Costco Wholesale, and must not be used with real membership or payment data.
