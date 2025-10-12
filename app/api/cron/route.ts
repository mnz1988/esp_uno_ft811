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
  // Read and sanitize environment variables (trim whitespace)
  const token = process.env.GITHUB_TOKEN?.trim()
  const owner = process.env.GITHUB_OWNER?.trim()
  const repo = process.env.GITHUB_REPO?.trim()
  const branch = process.env.GITHUB_BRANCH?.trim() || "main"

  // Validate required credentials are present
  if (!token || !owner || !repo) {
    throw new Error(
      "GitHub credentials not configured. Check GITHUB_TOKEN, GITHUB_OWNER, and GITHUB_REPO in Vercel environment variables.",
    )
  }

  // Log configuration for debugging (without exposing full token)
  console.log("[v0] GitHub config:", {
    owner,
    repo,
    branch,
    tokenLength: token.length,
    tokenFormat: token.startsWith("ghp_")
      ? "Classic PAT"
      : token.startsWith("github_pat_")
        ? "Fine-grained PAT"
        : "Unknown",
  })

  // Setup GitHub API headers with authentication
  const headers = {
    Authorization: `token ${token}`, // GitHub Personal Access Token format
    Accept: "application/vnd.github.v3+json", // GitHub API v3
    "User-Agent": "Vercel-Cron-Job", // Required by GitHub API
  }

  // Step 1: Check if file already exists to get its SHA (required for updates)
  let sha: string | undefined
  try {
    const getFileUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filename}?ref=${branch}`
    console.log("[v0] Checking if file exists:", getFileUrl)

    const getFileResponse = await fetch(getFileUrl, { headers })
    console.log("[v0] Get file response status:", getFileResponse.status)

    if (getFileResponse.ok) {
      // File exists, get its SHA for update operation
      const fileData = await getFileResponse.json()
      sha = fileData.sha
      console.log("[v0] Found existing file with SHA:", sha?.substring(0, 7))
    } else if (getFileResponse.status === 404) {
      // File doesn't exist yet, will create new file
      console.log("[v0] File doesn't exist yet, will create new")
    } else {
      // Unexpected error
      const errorBody = await getFileResponse.text()
      console.error(`[v0] Error checking file: ${getFileResponse.status}`, errorBody)
      throw new Error(`GitHub API error (${getFileResponse.status}): ${errorBody}`)
    }
  } catch (error) {
    console.log(`[v0] Error checking file:`, error)
  }

  // Step 2: Commit the file (create or update)
  const commitUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filename}`
  console.log("[v0] Committing to:", commitUrl)

  const commitResponse = await fetch(commitUrl, {
    method: "PUT",
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: `Update ${filename} - ${new Date().toISOString()}`, // Commit message with timestamp
      content: Buffer.from(content).toString("base64"), // GitHub API requires base64 encoded content
      branch,
      ...(sha && { sha }), // Include SHA if updating existing file
    }),
  })

  console.log("[v0] Commit response status:", commitResponse.status)

  // Handle commit errors
  if (!commitResponse.ok) {
    const error = await commitResponse.text()
    console.error("[v0] Commit failed with body:", error)
    throw new Error(`Failed to commit ${filename}: ${error}`)
  }

  const result = await commitResponse.json()
  console.log("[v0] Successfully committed:", filename)
  return result
}

/**
 * Filters and processes raw cryptocurrency data to create a lighter version
 * Filtering rules:
 * 1. Remove cryptocurrencies with "Wrapped", "Staked", or "Restaked" in their name
 * 2. Keep only: symbol, name, price, h24 fields
 * 3. Prioritize BTC, ETH, SOL, BNB at the beginning
 * 4. Sort others by h24 (24-hour change) from most positive to most negative
 * 5. Limit to top 100 cryptocurrencies
 *
 * @param rawData - Raw API response containing cryptocurrency data
 * @returns Array of filtered cryptocurrency objects (max 100)
 */
function filterData(rawData: any): FilteredCrypto[] {
  // Extract cryptocurrency array from API response
  // Handle both { data: [...] } and direct array formats
  const cryptos: CryptoData[] = rawData.data || rawData

  // Validate data is an array
  if (!Array.isArray(cryptos)) {
    console.error("[v0] Raw data is not an array:", typeof cryptos)
    return []
  }

  // Define priority cryptocurrencies that should appear first
  const prioritySymbols = ["BTC", "ETH", "SOL", "BNB"]

  // Filter and transform cryptocurrency data
  const filtered: FilteredCrypto[] = cryptos
    .filter(
      (crypto) =>
        !crypto.name.includes("Wrapped") && !crypto.name.includes("Staked") && !crypto.name.includes("Restaked"),
    )
    // Extract only the fields we need for the light version
    .map((crypto) => ({
      symbol: crypto.symbol,
      name: crypto.name,
      price: crypto.price,
      h24: crypto.percentChange?.h24 || 0, // Default to 0 if h24 is missing
    }))

  // Separate priority cryptocurrencies from others
  const priorityCryptos = filtered.filter((crypto) => prioritySymbols.includes(crypto.symbol))
  const otherCryptos = filtered.filter((crypto) => !prioritySymbols.includes(crypto.symbol))

  // Sort priority cryptos in the exact order specified (BTC, ETH, SOL, BNB)
  const sortedPriority = prioritySymbols
    .map((symbol) => priorityCryptos.find((crypto) => crypto.symbol === symbol))
    .filter((crypto): crypto is FilteredCrypto => crypto !== undefined)

  // Sort other cryptos by 24-hour change: highest positive to lowest negative
  // Example: [+15%, +10%, +5%, 0%, -5%, -10%]
  const sortedOthers = otherCryptos.sort((a, b) => b.h24 - a.h24)

  // Combine priority cryptos (first) with sorted others, then limit to top 16
  const result = [...sortedPriority, ...sortedOthers].slice(0, 16)

  // Log filtering statistics for debugging
  console.log("[v0] Filtered data:", {
    total: cryptos.length, // Total cryptocurrencies in raw data
    priority: sortedPriority.length, // Number of priority cryptos found
    others: sortedOthers.length, // Number of other cryptos
    final: result.length, // Final count after limiting to 16
  })

  return result
}

/**
 * Main API endpoint handler - Triggered by cron-job.org every 30 minutes
 * Process:
 * 1. Fetch data from external cryptocurrency API
 * 2. Save raw response to GitHub as raw.json
 * 3. Filter and process the data
 * 4. Save filtered data to GitHub as light.json
 */
export async function GET(request: Request) {
  try {
    // Get external API URL from environment variables
    const apiUrl = process.env.EXTERNAL_API_URL

    if (!apiUrl) {
      return NextResponse.json({ error: "EXTERNAL_API_URL not configured" }, { status: 500 })
    }

    console.log("[v0] Fetching data from external API...")

    // Fetch cryptocurrency data from external API
    const response = await fetch(apiUrl, {
      headers: {
        "Content-Type": "application/json",
        // Include API key if provided (using x-api-key header as required by the API)
        ...(process.env.EXTERNAL_API_KEY && {
          "x-api-key": process.env.EXTERNAL_API_KEY,
        }),
      },
    })

    // Check if API request was successful
    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`)
    }

    const rawData = await response.json()
    console.log("[v0] Data fetched successfully")

    // Step 1: Save complete raw data to GitHub
    console.log("[v0] Saving raw.json to GitHub...")
    await commitToGitHub("raw.json", JSON.stringify(rawData, null, 2)) // Pretty print with 2-space indentation
    console.log("[v0] raw.json saved successfully")

    // Step 2: Filter the data according to our rules
    console.log("[v0] Filtering data...")
    const filteredData = filterData(rawData)

    // Step 3: Save filtered data to GitHub
    console.log("[v0] Saving light.json to GitHub...")
    await commitToGitHub("light.json", JSON.stringify(filteredData, null, 2))
    console.log("[v0] light.json saved successfully")

    // Return success response with statistics
    return NextResponse.json({
      success: true,
      message: "Data fetched and saved successfully",
      timestamp: new Date().toISOString(),
      rawSize: JSON.stringify(rawData).length, // Size in bytes
      filteredSize: JSON.stringify(filteredData).length, // Size in bytes
    })
  } catch (error) {
    // Log and return error details
    console.error("[v0] Error:", error)
    return NextResponse.json(
      {
        error: "Failed to process request",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
