import fs from "fs";

const LIGHT_PATH = "/tmp/cryptorank-light.json";

export default async function handler(req, res) {
  try {
    if (fs.existsSync(LIGHT_PATH)) {
      const data = fs.readFileSync(LIGHT_PATH, "utf8");
      res.setHeader("Content-Type", "application/json");
      res.status(200).send(data);
    } else {
      res.status(404).json({ error: "No light cache available yet. Call /api/update first." });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
