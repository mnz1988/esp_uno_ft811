import { NextResponse } from "next/server"

// Force dynamic rendering to ensure fresh data on every request
export const dynamic = "force-dynamic"
export const runtime = "nodejs";

/**
 * TypeScript interfaces for cryptocurrency data structure
 */

// Raw cryptocurrency data structure from external API
interface CryptoData {
  id: string
  symbol: string // e.g., "BTC", "ETH"
  name: string // e.g., "Bitcoin", "Ethereum"
  price: number // Current price in USD
  percentChange: {
    h24: number // 24-hour percentage change (can be positive or negative)
  }
}

// Filtered cryptocurrency data structure for light.json
interface FilteredCrypto {
  symbol: string
  name: string
  price: number
  h24: number // 24-hour percentage change
}

/**
 * Commits a file to GitHub repository using GitHub API
 * @param filename - Name of the file to commit (e.g., "raw.json", "light.json")
 * @param content - File content as a string
 * @returns Promise with GitHub API response
 */
async function commitToGitHub(filename: string, content: string) {
  const token = process.env.GITHUB_TOKEN?.trim()
  const owner = process.env.GITHUB_OWNER?.trim()
  const repo = process.env.GITHUB_REPO?.trim()
  const branch = process.env.GITHUB_BRANCH?.trim() || "main"

  if (!token || !owner || !repo) {
    throw new Error("GitHub credentials not configured.")
  }

  const headers = {
    Authorization: `token ${token}`,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Vercel-Cron-Job",
  }

  // get SHA if file exists
  let sha: string | undefined
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${filename}?ref=${branch}`, {
      headers,
    })
    if (res.ok) {
      const data = await res.json()
      sha = data.sha
    }
  } catch (e) {
    console.log("[v0] Cannot read file SHA:", e)
  }

  const commitUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filename}`
  const resp = await fetch(commitUrl, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `Update ${filename} - ${new Date().toISOString()}`,
      content: Buffer.from(content).toString("base64"),
      branch,
      ...(sha && { sha }),
    }),
  })

  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`Failed to commit ${filename}: ${err}`)
  }

  return await resp.json()
}

/**
 * Filters and processes raw cryptocurrency data to create a lighter version
 */
function filterData(rawData: any): FilteredCrypto[] {
  const cryptos: CryptoData[] = rawData.data || rawData
  if (!Array.isArray(cryptos)) return []

  const prioritySymbols = ["BTC", "ETH", "SOL", "BNB"]

  const filtered: FilteredCrypto[] = cryptos
    .filter(
      (crypto) =>
        !crypto.name.includes("Wrapped") &&
        !crypto.name.includes("Staked") &&
        !crypto.name.includes("Restaked")
    )
    .map((crypto) => ({
      symbol: crypto.symbol,
      name: crypto.name,
      price: crypto.price,
      h24: crypto.percentChange?.h24 || 0,
    }))

  const priorityCryptos = filtered.filter((c) => prioritySymbols.includes(c.symbol))
  const otherCryptos = filtered.filter((c) => !prioritySymbols.includes(c.symbol))

  const sortedPriority = prioritySymbols
    .map((sym) => priorityCryptos.find((c) => c.symbol === sym))
    .filter((c): c is FilteredCrypto => c !== undefined)

  const sortedOthers = otherCryptos.sort((a, b) => b.h24 - a.h24)

  return [...sortedPriority, ...sortedOthers].slice(0, 16)
}

/**
 * Reads a file (e.g., light.json) from GitHub and returns parsed content
 */
async function readFromGitHub(filename: string) {
  const token = process.env.GITHUB_TOKEN?.trim()
  const owner = process.env.GITHUB_OWNER?.trim()
  const repo = process.env.GITHUB_REPO?.trim()
  const branch = process.env.GITHUB_BRANCH?.trim() || "main"

  if (!token || !owner || !repo) throw new Error("GitHub credentials not configured.")

  const headers = {
    Authorization: `token ${token}`,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Vercel-Cron-Job",
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filename}?ref=${branch}`
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`Failed to read ${filename}: ${res.statusText}`)
  const data = await res.json()
  const content = Buffer.from(data.content, "base64").toString("utf-8")
  return JSON.parse(content)
}

/**
 * Main cron endpoint (every 30 min)
 */
export async function GET(request: Request) {
  try {
    const apiUrl = process.env.EXTERNAL_API_URL
    if (!apiUrl) {
      return NextResponse.json({ error: "EXTERNAL_API_URL not configured" }, { status: 500 })
    }

    console.log("[v0] Fetching data from external API...")
    const response = await fetch(apiUrl, {
      headers: {
        "Content-Type": "application/json",
        ...(process.env.EXTERNAL_API_KEY && { "x-api-key": process.env.EXTERNAL_API_KEY }),
      },
    })

    if (!response.ok) throw new Error(`API request failed: ${response.statusText}`)

    const rawData = await response.json()
    console.log("[v0] Data fetched successfully")

    // Step 1: Save raw.json
    await commitToGitHub("raw.json", JSON.stringify(rawData, null, 2))
    console.log("[v0] raw.json saved successfully")

    // Step 2: Filter
    const filteredData = filterData(rawData)
    let finalLightData = filteredData

    // Step 3: Try to preserve existing FGI entry from current light.json
    try {
      const existing = await readFromGitHub("light.json")
      const fgiEntry = existing.find((c: any) => c.symbol === "FGI")
      if (fgiEntry) {
        finalLightData.push(fgiEntry)
        console.log("[v0] Preserved FGI entry in light.json")
      }
    } catch (err) {
      console.log("[v0] No existing light.json found or error reading:", err)
    }

    // Step 4: Save light.json
    await commitToGitHub("light.json", JSON.stringify(finalLightData, null, 2))
    console.log("[v0] light.json saved successfully")

    return NextResponse.json({
      success: true,
      message: "Data fetched and saved successfully",
      timestamp: new Date().toISOString(),
      rawSize: JSON.stringify(rawData).length,
      filteredSize: JSON.stringify(finalLightData).length,
    })
  } catch (error) {
    console.error("[v0] Error:", error)
    return NextResponse.json(
      {
        error: "Failed to process request",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
