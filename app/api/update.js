import fs from "fs";
import path from "path";

const RAW_PATH = "/tmp/cryptorank-raw.json";
const LIGHT_PATH = "/tmp/cryptorank-light.json";
const CACHE_DURATION = 30 * 60 * 1000; // 30 min

let lastFetch = 0;

export default async function handler(req, res) {
  try {
    const now = Date.now();

    if (now - lastFetch > CACHE_DURATION || req.query.refresh === "true") {
      console.log("Fetching fresh data from CryptoRank...");

      const response = await fetch("https://api.cryptorank.io/v2/currencies?include=percentChange&limit=500");
      if (!response.ok) {
        return res.status(response.status).json({ error: "Failed to fetch cryptorank" });
      }

      const json = await response.json();

      // save raw JSON to file
      fs.writeFileSync(RAW_PATH, JSON.stringify(json));

      // filter down to light version
      const light = {
        updatedAt: new Date().toISOString(),
        data: json.data.slice(0, 20).map(item => ({
          symbol: item.symbol,
          name: item.name,
          price: item.price,
          percentChange: item.percentChange?.h24 ?? null,
        })),
      };

      fs.writeFileSync(LIGHT_PATH, JSON.stringify(light));

      lastFetch = now;
      return res.status(200).json({ status: "updated", lightCount: light.data.length });
    }

    return res.status(200).json({ status: "cache valid", lastFetch });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
