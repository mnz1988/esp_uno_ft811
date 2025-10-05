let cachedData = null;
let lastFetch = 0;
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
const apiKey = process.env.CRYPTORANK_API_KEY

export default async function handler(req, res) {
  try {
    const now = Date.now();

    // If cache expired or never fetched → refresh
    if (!cachedData || now - lastFetch > CACHE_DURATION) {
      console.log("Fetching fresh data from CryptoRank...");

      const response = await fetch("https://api.cryptorank.io/v2/currencies?include=percentChange&limit=500", {
        headers: {
            "x-api-key":  apiKey
        }
      })

      if (!response.ok) {
        return res.status(response.status).json({ error: "Failed to fetch cryptorank" });
      }

      const json = await response.json();

      // Keep only light version
      cachedData = {
        updatedAt: new Date().toISOString(),
        data: json.data.slice(0, 20).map(item => ({
          symbol: item.symbol,
          name: item.name,
          price: item.price,
          percentChange: item.percentChange?.h24 ?? null,
        //   image: item.images?.x60 ?? null
        })),
        // usedCredits: json.status?.usedCredits ?? null
      };

      lastFetch = now;
    }

    res.status(200).json(cachedData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
