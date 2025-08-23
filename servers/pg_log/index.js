// servers/pg_log/index.js
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import pkg from "pg";
const { Pool } = pkg;

const server = new McpServer({ name: "pg_log", version: "1.0.0" });

// Set via env or default localhost dev
const pool = new Pool({
  host: process.env.PGHOST ?? "localhost",
  port: +(process.env.PGPORT ?? 5432),
  user: process.env.PGUSER ?? "chatuser",
  password: process.env.PGPASSWORD ?? "",
  database: process.env.PGDATABASE ?? "chatdb",
});

server.registerTool(
  "log_chat",
  {
    title: "Insert a user/assistant pair into public.chat_log",
    description: "Writes a row (user_text, assistant_text) to chat_log",
    // no inputSchema – keep it permissive
  },
  async (args) => {
    const user_text = args?.user_text ?? args?.arguments?.user_text ?? "";
    const assistant_text = args?.assistant_text ?? args?.arguments?.assistant_text ?? "";
    if (!user_text || !assistant_text) {
      return { content: [{ type: "text", text: "Both user_text and assistant_text are required." }] };
    }

    const sql = `
      INSERT INTO public.chat_log (user_text, assistant_text)
      VALUES ($1, $2)
      RETURNING id, created_at, user_text, assistant_text
    `;
    const client = await pool.connect();
    try {
      const { rows } = await client.query(sql, [user_text, assistant_text]);
      return { content: [{ type: "text", text: JSON.stringify(rows[0]) }] };
    } finally {
      client.release();
    }
  }
);

await server.connect(new StdioServerTransport());
