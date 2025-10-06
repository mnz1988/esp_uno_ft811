const OWNER = process.env.GH_OWNER;
const REPO = process.env.GH_REPO;
const BRANCH = "main";
const apiKey = process.env.CRYPTORANK_API_KEY

async function saveFileToGitHub(path, content) {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`;

  // Check if file already exists
  const existing = await fetch(url, {
    headers: { Authorization: `token ${process.env.GH_TOKEN}` }
  });
  const existingJson = existing.status === 200 ? await existing.json() : null;

  const body = {
    message: `Update ${path}`,
    content: Buffer.from(content).toString("base64"),
    branch: BRANCH
  };
  if (existingJson?.sha) body.sha = existingJson.sha;

  const resp = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `token ${process.env.GH_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Failed to update ${path}: ${err}`);
  }
}

export default async function handler(req, res) {
  try {
    // 1. Fetch from cryptorank
     const response = await fetch("https://api.cryptorank.io/v2/currencies?include=percentChange&limit=500", {
        headers: {
            "x-api-key":  apiKey
        }
      })
    if (!response.ok) {
      return res.status(response.status).json({ error: "Failed to fetch cryptorank" });
    }
    const json = await response.json();

    // 2. Build light version
    const light = {
      updatedAt: new Date().toISOString(),
      data: json.data.slice(0, 20).map(item => ({
        symbol: item.symbol,
        name: item.name,
        price: item.price,
        percentChange: item.percentChange?.h24 ?? null
      }))
    };

    // 3. Save raw + light to GitHub repo
    await saveFileToGitHub("raw.json", JSON.stringify(json, null, 2));
    await saveFileToGitHub("light.json", JSON.stringify(light, null, 2));

    res.status(200).json({ status: "updated", lightCount: light.data.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
