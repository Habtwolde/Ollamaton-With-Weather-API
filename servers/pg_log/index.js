// servers/pg_log/index.js
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import pg from "pg";

/* ───────────────────────────────────────────────
   PostgreSQL pool – credentials come from env vars:
   PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD
   ─────────────────────────────────────────────── */
const pool = new pg.Pool({
  host: "localhost",
  port: 5432,
  database: "chatdb",
  user: "chatuser",
  password: "ChatPass123!"
});

/* ───────────────────────────────────────────────
   Create the MCP server
   ─────────────────────────────────────────────── */
const srv = new McpServer({ name: "pg_log", version: "1.0.0" });

/* ───────────────────────────────────────────────
   Register the logging tool
   ─────────────────────────────────────────────── */
srv.registerTool(
  "log_chat",
  {
    title: "Log chat",
    description: "Insert a user/assistant pair into public.chat_log",
    inputSchema: {
      user_text:      z.string(),
      assistant_text: z.string()
    }
  },
  async ({ user_text, assistant_text }) => {
    try {
      const res = await pool.query(
        "INSERT INTO public.chat_log (user_text, assistant_text) VALUES ($1,$2) RETURNING id;",
        [user_text, assistant_text]
      );
      console.log(`✅ inserted chat_log row id ${res.rows[0].id}`);
    } catch (err) {
      console.error("❌ pg_log insert failed:", err.message);
    }

    /* The model sees this plain text; the follow-up prompt can ignore it. */
    return { content: [{ type: "text", text: "logged" }] };
  }
);

/* ───────────────────────────────────────────────
   Expose the server via stdio so Ollamaton can spawn it
   ─────────────────────────────────────────────── */
await srv.connect(new StdioServerTransport());
