import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

interface CryptoData {
  id: string
  symbol: string
  name: string
  price: number
  percentChange: { h24: number }
}
interface FilteredCrypto {
  symbol: string
  name: string
  price: number
  h24: number
}

async function commitToGitHub(filename: string, content: string) {
  const token = process.env.GITHUB_TOKEN?.trim()
  const owner = process.env.GITHUB_OWNER?.trim()
  const repo = process.env.GITHUB_REPO?.trim()
  const branch = process.env.GITHUB_BRANCH?.trim() || "main"
  if (!token || !owner || !repo) throw new Error("GitHub credentials not configured")

  const headers = {
    Authorization: `token ${token}`,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Vercel-Cron-Job",
  }

  let sha: string | undefined
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filename}?ref=${branch}`,
      { headers }
    )
    if (res.ok) {
      const json = await res.json()
      sha = json.sha
    }
  } catch (e) {
    console.log("[v0] commitToGitHub: cannot get SHA:", e)
  }

  const body = {
    message: `Update ${filename} - ${new Date().toISOString()}`,
    content: Buffer.from(content).toString("base64"),
    branch,
    ...(sha && { sha }),
  }

  const resp = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${filename}`,
    {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  )

  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`Failed to commit ${filename}: ${err}`)
  }

  return await resp.json()
}

function filterData(rawData: any): FilteredCrypto[] {
  const cryptos: CryptoData[] = rawData.data || rawData
  if (!Array.isArray(cryptos)) return []

  const prioritySymbols = ["BTC", "ETH", "SOL", "BNB"]

  const filtered: FilteredCrypto[] = cryptos
    .filter(
      (c) =>
        !c.name.includes("Wrapped") &&
        !c.name.includes("Staked") &&
        !c.name.includes("Restaked")
    )
    .map((c) => ({
      symbol: c.symbol,
      name: c.name,
      price: c.price,
      h24: c.percentChange?.h24 || 0,
    }))

  const priority = filtered.filter((c) => prioritySymbols.includes(c.symbol))
  const others = filtered.filter((c) => !prioritySymbols.includes(c.symbol))
  const orderedPriority = prioritySymbols
    .map((s) => priority.find((c) => c.symbol === s))
    .filter((c): c is FilteredCrypto => !!c)
  const orderedOthers = others.sort((a, b) => b.h24 - a.h24)
  return [...orderedPriority, ...orderedOthers].slice(0, 16)
}

async function safeReadLightJson(): Promise<any[]> {
  const token = process.env.GITHUB_TOKEN?.trim()
  const owner = process.env.GITHUB_OWNER?.trim()
  const repo = process.env.GITHUB_REPO?.trim()
  const branch = process.env.GITHUB_BRANCH?.trim() || "main"
  if (!token || !owner || !repo) return []

  const headers = {
    Authorization: `token ${token}`,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Vercel-Cron-Job",
  }

  // retry up to 3 times in case GitHub cache delay
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/light.json?ref=${branch}`,
        { headers }
      )
      if (res.ok) {
        const data = await res.json()
        const content = Buffer.from(data.content, "base64").toString("utf-8")
        const json = JSON.parse(content)
        if (Array.isArray(json)) return json
      }
    } catch (err) {
      console.log(`[v0] attempt ${i + 1} to read light.json failed`, err)
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  return []
}

export async function GET() {
  try {
    const apiUrl = process.env.EXTERNAL_API_URL
    if (!apiUrl)
      return NextResponse.json(
        { error: "EXTERNAL_API_URL not configured" },
        { status: 500 }
      )

    console.log("[v0] Fetching data from external API...")
    const response = await fetch(apiUrl, {
      headers: {
        "Content-Type": "application/json",
        ...(process.env.EXTERNAL_API_KEY && {
          "x-api-key": process.env.EXTERNAL_API_KEY,
        }),
      },
    })

    if (!response.ok) throw new Error(`API request failed: ${response.statusText}`)
    const rawData = await response.json()

    await commitToGitHub("raw.json", JSON.stringify(rawData, null, 2))
    console.log("[v0] raw.json committed")

    const filteredData = filterData(rawData)
    console.log("[v0] Filtered data length:", filteredData.length)

    // preserve FGI entry
    let finalLight = [...filteredData]
    try {
      const existingLight = await safeReadLightJson()
      const fgi = existingLight.find((c: any) => c.symbol === "FGI")
      if (fgi) {
        finalLight.push(fgi)
        console.log("[v0] Preserved existing FGI entry")
      } else {
        console.log("[v0] No existing FGI entry found to preserve")
      }
    } catch (err) {
      console.log("[v0] Could not read existing light.json:", err)
    }

    await commitToGitHub("light.json", JSON.stringify(finalLight, null, 2))
    console.log("[v0] light.json committed (FGI preserved if existed)")

    return NextResponse.json({
      success: true,
      message: "Data fetched and saved successfully (FGI preserved)",
      timestamp: new Date().toISOString(),
      entries: finalLight.length,
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
