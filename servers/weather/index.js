// servers/weather/index.js
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// ---------------------------------------------------------------------------
// Ensure fetch exists (Node <18 or quirky distros)
let safeFetch = globalThis.fetch;
if (!safeFetch) safeFetch = (await import("node-fetch")).default;

const UA = {
  "User-Agent":
    "ollamaton-weather/1.0 (+https://github.com/inventorado/ollamaton)"
};

// ---------------------------------------------------------------------------
// MCP server instance
const server = new McpServer({ name: "weather", version: "1.1.0" });

server.registerTool(
  "get_current_weather",
  {
    title: "Get current weather",
    description:
      "Return temperature (°C), precipitation (mm) and weather code for a city"
    // no inputSchema – we validate manually
  },

  // ⚠️  NOTE: parameter order is (context, input)
  async (ctx, input) => {
    try {
      // Accept {city:"…"} OR {arguments:{city:"…"}}
      const city =
        (input?.city ||
          input?.arguments?.city ||
          /* fallback */ "").trim();

      if (!city) {
        return {
          content: [
            {
              type: "text",
              text:
                "Error: provide a non-empty 'city' string. " +
                `Debug: ${JSON.stringify({ input }, null, 2)}`
            }
          ]
        };
      }

      /* ── 1. Geocode ─────────────────────────────────────────────── */
      const geoUrl =
        "https://geocoding-api.open-meteo.com/v1/search" +
        `?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;

      if (process.env.DEBUG_WEATHER)
        console.error("[weather] geo URL:", geoUrl);

      const geoRes = await safeFetch(geoUrl, { headers: UA });
      if (!geoRes.ok) throw new Error(`Geocoding failed: ${geoRes.status}`);
      const geoJson = await geoRes.json();

      if (!geoJson.results?.length) {
        return {
          content: [{ type: "text", text: `I couldn’t locate “${city}”.` }]
        };
      }

      const { latitude: lat, longitude: lon } = geoJson.results[0];

      /* ── 2. Current weather ─────────────────────────────────────── */
      const wxUrl =
        "https://api.open-meteo.com/v1/forecast" +
        `?latitude=${lat}&longitude=${lon}` +
        "&current=temperature_2m,weather_code,precipitation&timezone=auto";

      if (process.env.DEBUG_WEATHER)
        console.error("[weather] wx  URL:", wxUrl);

      const wxRes = await safeFetch(wxUrl, { headers: UA });
      if (!wxRes.ok) throw new Error(`Weather fetch failed: ${wxRes.status}`);
      const wxJson = await wxRes.json();
      const cur = wxJson.current ?? {};

      /* ── 3. Return payload ──────────────────────────────────────── */
      const payload = {
        location: city,
        latitude: lat,
        longitude: lon,
        temperature_c: cur.temperature_2m ?? null,
        precipitation_mm: cur.precipitation ?? null,
        weather_code: cur.weather_code ?? null
      };

      // Return as plain-text JSON so every MCP client can parse it
      return { content: [{ type: "text", text: JSON.stringify(payload) }] };
    } catch (err) {
      console.error("weather-tool error:", err);
      return {
        content: [
          {
            type: "text",
            text:
              "Sorry, I couldn’t reach the weather service. " +
              "Please try again in a moment."
          }
        ]
      };
    }
  }
);

// ---------------------------------------------------------------------------
// Start server over stdio
await server.connect(new StdioServerTransport());
