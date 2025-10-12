import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs";

async function commitToGitHub(filename, content) {
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

  let sha
  try {
    const getFileUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filename}?ref=${branch}`
    const getFileResponse = await fetch(getFileUrl, { headers })

    if (getFileResponse.ok) {
      const fileData = await getFileResponse.json()
      sha = fileData.sha
    }
  } catch (error) {
    console.log(`[v0] Error checking file:`, error)
  }

  const commitUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filename}`
  const commitResponse = await fetch(commitUrl, {
    method: "PUT",
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: `Update ${filename} - ${new Date().toISOString()}`,
      content: Buffer.from(content).toString("base64"),
      branch,
      ...(sha && { sha }),
    }),
  })

  if (!commitResponse.ok) {
    const error = await commitResponse.text()
    throw new Error(`Failed to commit ${filename}: ${error}`)
  }

  return await commitResponse.json()
}

async function readFromGitHub(filename) {
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
  const response = await fetch(url, { headers })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to read ${filename}: ${error}`)
  }

  const data = await response.json()
  const content = Buffer.from(data.content, "base64").toString("utf-8")
  return JSON.parse(content)
}

export async function GET(request) {
  try {
    console.log("[v0] Starting FGI cron job...")

    const globalApiUrl = "https://api.cryptorank.io/v2/global"
    const apiKey = process.env.X_API_KEY?.trim()

    if (!apiKey) {
      throw new Error("X_API_KEY not configured")
    }

    const response = await fetch(globalApiUrl, {
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
    })

    if (!response.ok) {
      throw new Error(`CryptoRank API failed: ${response.statusText}`)
    }

    const globalData = await response.json()
    console.log("[v0] Global data fetched")

    await commitToGitHub("global.json", JSON.stringify(globalData, null, 2))
    console.log("[v0] global.json saved")

    const fearGreed = globalData.data.fearGreed
    const altcoinIndex = globalData.data.altcoinIndex

    let lightData = []
    try {
      lightData = await readFromGitHub("light.json")
    } catch (error) {
      console.log("[v0] light.json doesn't exist, creating new")
    }

    const fgiEntry = {
      symbol: "FGI",
      name: "Fear & Greed Index",
      price: fearGreed,
      h24: altcoinIndex,
    }

    lightData = lightData.filter((crypto) => crypto.symbol !== "FGI")
    lightData.unshift(fgiEntry)

    await commitToGitHub("light.json", JSON.stringify(lightData, null, 2))
    console.log("[v0] light.json updated")

    return NextResponse.json({
      success: true,
      message: "FGI data updated successfully",
      timestamp: new Date().toISOString(),
      fgiData: { fearGreed, altcoinIndex },
      totalEntries: lightData.length,
    })
  } catch (error) {
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
