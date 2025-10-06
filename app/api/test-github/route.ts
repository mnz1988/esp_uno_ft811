import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  const token = process.env.GITHUB_TOKEN?.trim()
  const owner = process.env.GITHUB_OWNER?.trim()
  const repo = process.env.GITHUB_REPO?.trim()

  console.log("[v0] Testing GitHub credentials...")
  console.log("[v0] Token exists:", !!token)
  console.log("[v0] Token length:", token?.length || 0)
  console.log(
    "[v0] Token format:",
    token?.startsWith("ghp_") ? "Classic PAT" : token?.startsWith("github_pat_") ? "Fine-grained PAT" : "Unknown",
  )
  console.log("[v0] Owner:", owner || "NOT SET")
  console.log("[v0] Repo:", repo || "NOT SET")

  if (!token) {
    return NextResponse.json(
      {
        error: "GITHUB_TOKEN environment variable is not set",
        help: "Go to Vercel Project Settings → Environment Variables → Add GITHUB_TOKEN",
        instructions: [
          "1. Go to https://github.com/settings/tokens/new",
          "2. Generate new token (classic)",
          "3. Select 'repo' scope (full control)",
          "4. Copy the ENTIRE token (starts with ghp_)",
          "5. Add it to Vercel as GITHUB_TOKEN (no quotes)",
          "6. REDEPLOY your app after saving",
        ],
      },
      { status: 500 },
    )
  }

  if (!owner || !repo) {
    return NextResponse.json(
      {
        error: "GITHUB_OWNER or GITHUB_REPO not configured",
        owner: owner || "NOT SET",
        repo: repo || "NOT SET",
      },
      { status: 500 },
    )
  }

  const headers = {
    Authorization: `token ${token}`,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Vercel-Cron-Job",
  }

  try {
    console.log("[v0] Testing authentication...")
    const userResponse = await fetch("https://api.github.com/user", { headers })

    console.log("[v0] User API response status:", userResponse.status)

    if (!userResponse.ok) {
      const errorBody = await userResponse.text()
      console.error("[v0] User API error:", errorBody)

      return NextResponse.json(
        {
          error: "GitHub authentication failed",
          status: userResponse.status,
          details: errorBody,
          tokenInfo: {
            length: token.length,
            startsWithGhp: token.startsWith("ghp_"),
            startsWithGithubPat: token.startsWith("github_pat_"),
          },
          help: [
            "Your GITHUB_TOKEN is invalid or expired.",
            "",
            "Create a new token:",
            "1. Go to: https://github.com/settings/tokens/new",
            "2. Name: 'Vercel Cron Job'",
            "3. Check 'repo' scope",
            "4. Generate and copy the ENTIRE token",
            "5. Update GITHUB_TOKEN in Vercel",
            "6. REDEPLOY your app",
          ],
        },
        { status: 401 },
      )
    }

    const userData = await userResponse.json()
    console.log("[v0] ✓ Authenticated as:", userData.login)

    // Test repo access
    const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers })

    if (!repoResponse.ok) {
      const errorBody = await repoResponse.text()
      return NextResponse.json(
        {
          error: "Cannot access repository",
          status: repoResponse.status,
          details: errorBody,
          help: `Token is valid but cannot access ${owner}/${repo}. Check repository name and token permissions.`,
        },
        { status: 403 },
      )
    }

    const repoData = await repoResponse.json()

    return NextResponse.json({
      success: true,
      message: "GitHub credentials are valid!",
      user: userData.login,
      repo: repoData.full_name,
      permissions: repoData.permissions,
    })
  } catch (error) {
    console.error("[v0] Test failed:", error)
    return NextResponse.json(
      {
        error: "Failed to test GitHub credentials",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
