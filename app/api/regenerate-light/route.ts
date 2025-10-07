import { NextResponse } from "next/server"

// Force dynamic rendering to ensure fresh data on every request
export const dynamic = "force-dynamic"

/**
 * TypeScript interfaces for cryptocurrency data structure
 */

// Raw cryptocurrency data structure from external API
interface CryptoData {
  id: string
  symbol: string
  name: string
  price: number
  percentChange: {
    h24: number // 24-hour percentage change
  }
}

// Filtered cryptocurrency data structure for light.json
interface FilteredCrypto {
  symbol: string
  name: string
  price: number
  h24: number
}

/**
 * Fetches a file from GitHub repository
 * @param filename - Name of the file to fetch (e.g., "raw.json")
 * @returns Promise with parsed JSON content
 */
async function getFromGitHub(filename: string) {
  // Read and sanitize environment variables
  const token = process.env.GITHUB_TOKEN?.trim()
  const owner = process.env.GITHUB_OWNER?.trim()
  const repo = process.env.GITHUB_REPO?.trim()
  const branch = process.env.GITHUB_BRANCH?.trim() || "main"

  // Validate required credentials
  if (!token || !owner || !repo) {
    throw new Error("GitHub credentials not configured")
  }

  // Setup GitHub API headers
  const headers = {
    Authorization: `token ${token}`,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Vercel-Cron-Job",
  }

  // Fetch file from GitHub
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filename}?ref=${branch}`
  const response = await fetch(url, { headers })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to fetch ${filename}: ${error}`)
  }

  // GitHub returns file content as base64, decode it
  const data = await response.json()
  const content = Buffer.from(data.content, "base64").toString("utf-8")
  return JSON.parse(content)
}

/**
 * Commits a file to GitHub repository
 * @param filename - Name of the file to commit
 * @param content - File content as a string
 * @returns Promise with GitHub API response
 */
async function commitToGitHub(filename: string, content: string) {
  // Read and sanitize environment variables
  const token = process.env.GITHUB_TOKEN?.trim()
  const owner = process.env.GITHUB_OWNER?.trim()
  const repo = process.env.GITHUB_REPO?.trim()
  const branch = process.env.GITHUB_BRANCH?.trim() || "main"

  if (!token || !owner || !repo) {
    throw new Error("GitHub credentials not configured")
  }

  // Setup GitHub API headers
  const headers = {
    Authorization: `token ${token}`,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Vercel-Cron-Job",
  }

  // Get current file SHA (required for updating existing files)
  let sha: string | undefined
  try {
    const getFileUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filename}?ref=${branch}`
    const getFileResponse = await fetch(getFileUrl, { headers })

    if (getFileResponse.ok) {
      const fileData = await getFileResponse.json()
      sha = fileData.sha
    }
  } catch (error) {
    console.log(`[v0] File doesn't exist yet:`, error)
  }

  // Commit the file to GitHub
  const commitUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filename}`
  const commitResponse = await fetch(commitUrl, {
    method: "PUT",
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: `Regenerate ${filename} - ${new Date().toISOString()}`,
      content: Buffer.from(content).toString("base64"), // GitHub requires base64
      branch,
      ...(sha && { sha }), // Include SHA if updating
    }),
  })

  if (!commitResponse.ok) {
    const error = await commitResponse.text()
    throw new Error(`Failed to commit ${filename}: ${error}`)
  }

  return await commitResponse.json()
}

/**
 * Filters raw cryptocurrency data to create a lighter version
 * Same filtering logic as the main cron job
 * @param rawData - Raw cryptocurrency data from raw.json
 * @returns Array of filtered cryptocurrency objects (max 100)
 */
function filterData(rawData: any): FilteredCrypto[] {
  // Extract cryptocurrency array from data
  const cryptos: CryptoData[] = rawData.data || rawData

  if (!Array.isArray(cryptos)) {
    console.error("[v0] Raw data is not an array:", typeof cryptos)
    return []
  }

  // Priority cryptocurrencies to appear first
  const prioritySymbols = ["BTC", "ETH", "SOL", "BNB"]

  const filtered: FilteredCrypto[] = cryptos
    .filter(
      (crypto) =>
        !crypto.name.includes("Wrapped") && !crypto.name.includes("Staked") && !crypto.name.includes("Restaked"),
    )
    .map((crypto) => ({
      symbol: crypto.symbol,
      name: crypto.name,
      price: crypto.price,
      h24: crypto.percentChange?.h24 || 0,
    }))

  // Separate priority and other cryptocurrencies
  const priorityCryptos = filtered.filter((crypto) => prioritySymbols.includes(crypto.symbol))
  const otherCryptos = filtered.filter((crypto) => !prioritySymbols.includes(crypto.symbol))

  // Sort priority cryptos in specified order
  const sortedPriority = prioritySymbols
    .map((symbol) => priorityCryptos.find((crypto) => crypto.symbol === symbol))
    .filter((crypto): crypto is FilteredCrypto => crypto !== undefined)

  // Sort others by 24-hour change (highest to lowest)
  const sortedOthers = otherCryptos.sort((a, b) => b.h24 - a.h24)

  // Combine and limit to top 50
  return [...sortedPriority, ...sortedOthers].slice(0, 50)
}

/**
 * API endpoint to regenerate light.json from existing raw.json
 * Useful when you want to update the filtering without fetching new data
 * Triggered by POST request from the dashboard
 */
export async function POST(request: Request) {
  try {
    // Step 1: Fetch existing raw.json from GitHub
    console.log("[v0] Fetching raw.json from GitHub...")
    const rawData = await getFromGitHub("raw.json")

    // Step 2: Apply filtering logic
    console.log("[v0] Filtering data...")
    const filteredData = filterData(rawData)

    // Step 3: Save new light.json to GitHub
    console.log("[v0] Saving light.json to GitHub...")
    await commitToGitHub("light.json", JSON.stringify(filteredData, null, 2))

    // Return success response
    return NextResponse.json({
      success: true,
      message: "light.json regenerated successfully",
      timestamp: new Date().toISOString(),
      count: filteredData.length, // Number of cryptocurrencies in light.json
    })
  } catch (error) {
    // Log and return error
    console.error("[v0] Error:", error)
    return NextResponse.json(
      {
        error: "Failed to regenerate light.json",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
