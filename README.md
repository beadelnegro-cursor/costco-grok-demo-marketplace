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

| Tool | Demo API |
| --- | --- |
| `search_catalog` | `GET /api/catalog` |
| `plan_cart` | `POST /api/plan` |
| `get_cart` | `GET /api/cart` |
| `set_cart_from_plan` | `POST /api/cart` `{ action: "set" }` |
| `generate_mood_board` | `POST /api/imagine` |
| `clear_cart` | `POST /api/cart` `{ action: "clear" }` |

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
  mcp-server/index.ts
  skills/costco-shop/SKILL.md
```

## Disclaimer

This is an internal GTMKO / Field Engineering demo. It is not a Costco product, not endorsed by Costco Wholesale, and must not be used with real membership or payment data.
