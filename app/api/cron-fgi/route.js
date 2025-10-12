import { NextResponse } from "next/server"

// Force dynamic rendering to ensure fresh data on every request
export const dynamic = "force-dynamic"

/**
 * TypeScript interfaces for Fear & Greed Index data
 */

// Response structure from CryptoRank Global API
interface GlobalApiResponse {
  data: {
    fearGreed: number // Fear & Greed Index value (0-100)
    altcoinIndex: number // Altcoin Index value
    // ... other fields we don't need
  }
}

// Structure for the FGI entry in light.json
interface FGICrypto {
  symbol: string
  name: string
  price: number // Will store fearGreed value
  h24: number // Will store altcoinIndex value
}

/**
 * Commits a file to GitHub repository using GitHub API
 * @param filename - Name of the file to commit (e.g., "global.json", "light.json")
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

  console.log("[v0] GitHub config:", {
    owner,
    repo,
    branch,
    tokenLength: token.length,
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

    if (getFileResponse.ok) {
      // File exists, get its SHA for update operation
      const fileData = await getFileResponse.json()
      sha = fileData.sha
      console.log("[v0] Found existing file with SHA:", sha?.substring(0, 7))
    } else if (getFileResponse.status === 404) {
      // File doesn't exist yet, will create new file
      console.log("[v0] File doesn't exist yet, will create new")
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
 * Reads a file from GitHub repository
 * @param filename - Name of the file to read
 * @returns Promise with file content as parsed JSON
 */
async function readFromGitHub(filename: string) {
  const token = process.env.GITHUB_TOKEN?.trim()
  const owner = process.env.GITHUB_OWNER?.trim()
  const repo = process.env.GITHUB_REPO?.trim()
  const branch = process.env.GITHUB_BRANCH?.trim() || "main"

  if (!token || !owner || !repo) {
    throw new Error("GitHub credentials not configured")
  }

  const headers = {
    Authorization: `token ${token}`,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Vercel-Cron-Job",
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filename}?ref=${branch}`
  console.log("[v0] Reading file from GitHub:", url)

  const response = await fetch(url, { headers })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to read ${filename}: ${error}`)
  }

  const data = await response.json()
  // Decode base64 content and parse JSON
  const content = Buffer.from(data.content, "base64").toString("utf-8")
  return JSON.parse(content)
}
 
/**
 * Main API endpoint handler - Triggered by cron-job.org every 2 hours
 * Process:
 * 1. Fetch global data from CryptoRank API
 * 2. Save raw response to GitHub as global.json
 * 3. Extract fearGreed and altcoinIndex values
 * 4. Read existing light.json from GitHub
 * 5. Add/update FGI entry in light.json
 * 6. Save updated light.json back to GitHub
 */
export async function GET(request: Request) {
  try {
    console.log("[v0] Starting FGI cron job...")

    // Step 1: Fetch global data from CryptoRank API
    const globalApiUrl = "https://api.cryptorank.io/v2/global"
    console.log("[v0] Fetching data from CryptoRank Global API...")

    const response = await fetch(globalApiUrl, {
      headers: {
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      throw new Error(`CryptoRank API request failed: ${response.statusText}`)
    }

    const globalData: GlobalApiResponse = await response.json()
    console.log("[v0] Global data fetched successfully")

    // Step 2: Save complete raw global data to GitHub
    console.log("[v0] Saving global.json to GitHub...")
    await commitToGitHub("global.json", JSON.stringify(globalData, null, 2))
    console.log("[v0] global.json saved successfully")

    // Step 3: Extract Fear & Greed Index and Altcoin Index values
    const fearGreed = globalData.data.fearGreed
    const altcoinIndex = globalData.data.altcoinIndex

    console.log("[v0] Extracted values:", { fearGreed, altcoinIndex })

    // Step 4: Read existing light.json from GitHub
    console.log("[v0] Reading existing light.json from GitHub...")
    let lightData: any[] = []
    try {
      lightData = await readFromGitHub("light.json")
      console.log("[v0] Existing light.json loaded, entries:", lightData.length)
    } catch (error) {
      console.log("[v0] light.json doesn't exist yet or error reading, will create new")
      lightData = []
    }

    // Step 5: Create or update FGI entry
    const fgiEntry: FGICrypto = {
      symbol: "FGI",
      name: "Fear & Greed Index",
      price: fearGreed, // Store Fear & Greed value as price
      h24: altcoinIndex, // Store Altcoin Index as h24
    }

    // Remove existing FGI entry if present
    lightData = lightData.filter((crypto: any) => crypto.symbol !== "FGI")

    // Add FGI entry at the beginning of the array
    lightData.unshift(fgiEntry)

    console.log("[v0] FGI entry added/updated in light.json")

    // Step 6: Save updated light.json back to GitHub
    console.log("[v0] Saving updated light.json to GitHub...")
    await commitToGitHub("light.json", JSON.stringify(lightData, null, 2))
    console.log("[v0] light.json updated successfully")

    // Return success response
    return NextResponse.json({
      success: true,
      message: "Fear & Greed Index data updated successfully",
      timestamp: new Date().toISOString(),
      fgiData: {
        fearGreed,
        altcoinIndex,
      },
      totalEntries: lightData.length,
    })
  } catch (error) {
    // Log and return error details
    console.error("[v0] Error:", error)
    return NextResponse.json(
      {
        error: "Failed to process FGI cron job",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
