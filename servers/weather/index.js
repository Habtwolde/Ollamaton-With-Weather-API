// servers/weather/index.js
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ─── Ensure fetch exists (Node <18 or funky builds) ───────────────────────────
let safeFetch = globalThis.fetch;
if (!safeFetch) {
  // eslint-disable-next-line import/no-extraneous-dependencies
  safeFetch = (await import("node-fetch")).default;
}

// Helpful header for any public API
const UA = { "User-Agent": "ollamaton-weather/1.0 (+https://github.com/inventorado/ollamaton)" };

/*───────────────────────────────────────────────────────────────────────────*/
const server = new McpServer({ name: "weather", version: "1.0.1" });

server.registerTool(
  "get_current_weather",
  {
    title: "Get current weather",
    description: "Return temperature (°C), precipitation (mm) and weather code for a city",
    inputSchema: { city: z.string() }
  },
  async ({ city }) => {
    try {
      /* 1️⃣  Geocode the city (Open-Meteo Geocoding) */
      const geoUrl =
        "https://geocoding-api.open-meteo.com/v1/search" +
        `?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
      const geoJson = await safeFetch(geoUrl, { headers: UA }).then(r => r.json());

      if (!geoJson.results?.length) {
        return {
          content: [{ type: "text", text: `I couldn’t locate “${city}”.` }]
        };
      }

      const { latitude: lat, longitude: lon } = geoJson.results[0];

      /* 2️⃣  Pull current weather */
      const wUrl =
        "https://api.open-meteo.com/v1/forecast" +
        `?latitude=${lat}&longitude=${lon}` +
        "&current=temperature_2m,weather_code,precipitation&timezone=auto";

      const weather = await safeFetch(wUrl, { headers: UA }).then(r => r.json());
      const cur = weather.current ?? {};

      /* 3️⃣  Return JSON for the model to summarise */
      return {
        content: [
          {
            type: "json",
            json: {
              location: city,
              latitude: lat,
              longitude: lon,
              temperature_c: cur.temperature_2m,
              precipitation_mm: cur.precipitation,
              weather_code: cur.weather_code
            }
          }
        ]
      };
    } catch (err) {
      // Log exact network / SSL / DNS error to stderr for debugging
      console.error("weather-tool error:", err);
      return {
        content: [
          {
            type: "text",
            text: "Sorry, I couldn’t reach the weather service. Please try again in a moment."
          }
        ]
      };
    }
  }
);

/*───────────────────────────────────────────────────────────────────────────*/
await server.connect(new StdioServerTransport());
