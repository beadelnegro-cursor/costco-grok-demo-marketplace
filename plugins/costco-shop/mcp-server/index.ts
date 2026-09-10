import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { TOOL_DESCRIPTIONS } from "./copy.js";
import {
  shopperBasketPayload,
  shopperDataPayload,
  shopperMoodBoardPayload,
  textResult,
} from "./payload.js";

const DEFAULT_API_BASE = "http://127.0.0.1:3000";

function apiBase(): string {
  const raw = process.env.COSTCO_DEMO_API_BASE?.trim();
  if (!raw || raw.startsWith("${")) return DEFAULT_API_BASE;
  return raw.replace(/\/+$/, "");
}

async function apiRequest(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  query?: Record<string, string | number | undefined>,
): Promise<unknown> {
  const url = new URL(path, `${apiBase()}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers:
        body === undefined
          ? { Accept: "application/json" }
          : { Accept: "application/json", "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Shopping API unreachable at ${apiBase()} (${message}). Confirm COSTCO_DEMO_API_BASE and that the local API is running on ${DEFAULT_API_BASE}.`,
    );
  }

  const raw = await response.text();
  let parsed: unknown = raw;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw;
    }
  }

  if (!response.ok) {
    throw new Error(
      `Shopping API ${method} ${url.pathname} failed (${response.status}): ${
        typeof parsed === "string" ? parsed : JSON.stringify(parsed)
      }`,
    );
  }

  return parsed;
}

const cartLineSchema = z
  .object({
    id: z.string().optional(),
    sku: z.string().optional(),
    itemNumber: z.string().optional(),
    name: z.string().optional(),
    title: z.string().optional(),
    quantity: z.number().optional(),
    qty: z.number().optional(),
    price: z.number().optional(),
  })
  .passthrough();

const server = new McpServer({
  name: "costco",
  version: "1.1.0",
});

server.tool(
  "search_catalog",
  TOOL_DESCRIPTIONS.search_catalog,
  {
    query: z
      .string()
      .optional()
      .describe("Free-text search, e.g. 'kirkland sparkling water'"),
    category: z.string().optional().describe("Optional category filter"),
    limit: z.number().int().positive().max(100).optional(),
  },
  async ({ query, category, limit }) => {
    try {
      const data = await apiRequest("GET", "/api/catalog", undefined, {
        q: query,
        query,
        category,
        limit,
      });
      return textResult(shopperDataPayload(data));
    } catch (error) {
      return textResult(error instanceof Error ? error.message : String(error), {
        isError: true,
      });
    }
  },
);

server.tool(
  "plan_cart",
  TOOL_DESCRIPTIONS.plan_cart,
  {
    intent: z
      .string()
      .describe(
        "Occasion or shopping goal, e.g. 'backyard birthday for 12, $150, include a cake'",
      ),
    engine: z
      .string()
      .optional()
      .describe("Optional planner engine id if the shopping API supports more than one"),
    updateCart: z
      .boolean()
      .optional()
      .describe("If true, ask the shopping API to write the plan into the cart"),
  },
  async ({ intent, engine, updateCart }) => {
    try {
      const data = await apiRequest("POST", "/api/plan", {
        intent,
        engine,
        updateCart,
      });
      return textResult(shopperBasketPayload(data, "plan"));
    } catch (error) {
      return textResult(error instanceof Error ? error.message : String(error), {
        isError: true,
      });
    }
  },
);

server.tool(
  "get_cart",
  TOOL_DESCRIPTIONS.get_cart,
  {},
  async () => {
    try {
      const data = await apiRequest("GET", "/api/cart");
      return textResult(shopperBasketPayload(data, "cart"));
    } catch (error) {
      return textResult(error instanceof Error ? error.message : String(error), {
        isError: true,
      });
    }
  },
);

server.tool(
  "set_cart_from_plan",
  TOOL_DESCRIPTIONS.set_cart_from_plan,
  {
    lines: z
      .array(cartLineSchema)
      .describe("Approved cart lines from the latest plan"),
    title: z.string().optional().describe("Optional basket title"),
    intent: z.string().optional().describe("Original shopping intent"),
  },
  async ({ lines, title, intent }) => {
    try {
      const data = await apiRequest("POST", "/api/cart", {
        action: "set",
        lines,
        title,
        intent,
      });
      return textResult(shopperBasketPayload(data, "cart"));
    } catch (error) {
      return textResult(error instanceof Error ? error.message : String(error), {
        isError: true,
      });
    }
  },
);

server.tool(
  "generate_mood_board",
  TOOL_DESCRIPTIONS.generate_mood_board,
  {
    intent: z.string().describe("Occasion or mood to illustrate"),
    cartSummary: z
      .string()
      .optional()
      .describe("Short summary of the planned basket for the mood board"),
  },
  async ({ intent, cartSummary }) => {
    try {
      const data = await apiRequest("POST", "/api/imagine", {
        intent,
        cartSummary,
      });
      return textResult(shopperMoodBoardPayload(data));
    } catch (error) {
      return textResult(error instanceof Error ? error.message : String(error), {
        isError: true,
      });
    }
  },
);

server.tool(
  "clear_cart",
  TOOL_DESCRIPTIONS.clear_cart,
  {},
  async () => {
    try {
      const data = await apiRequest("POST", "/api/cart", { action: "clear" });
      return textResult({ data });
    } catch (error) {
      return textResult(error instanceof Error ? error.message : String(error), {
        isError: true,
      });
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[costco-mcp] ready");
}

main().catch((error) => {
  console.error(
    "[costco-mcp] failed to start:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
