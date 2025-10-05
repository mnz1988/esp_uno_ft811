import fs from "fs";

const RAW_PATH = "/tmp/cryptorank-raw.json";

export default async function handler(req, res) {
  try {
    if (fs.existsSync(RAW_PATH)) {
      const data = fs.readFileSync(RAW_PATH, "utf8");
      res.setHeader("Content-Type", "application/json");
      res.status(200).send(data);
    } else {
      res.status(404).json({ error: "No raw cache available yet. Call /api/update first." });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
