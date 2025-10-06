import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  const envVars = {
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    GITHUB_OWNER: process.env.GITHUB_OWNER,
    GITHUB_REPO: process.env.GITHUB_REPO,
    GITHUB_BRANCH: process.env.GITHUB_BRANCH,
    EXTERNAL_API_URL: process.env.EXTERNAL_API_URL,
    EXTERNAL_API_KEY: process.env.EXTERNAL_API_KEY,
  }

  const githubToken = envVars.GITHUB_TOKEN?.trim().replace(/^["']|["']$/g, "")
  const tokenFormat = githubToken
    ? githubToken.startsWith("ghp_")
      ? "Classic PAT (correct)"
      : githubToken.startsWith("github_pat_")
        ? "Fine-grained PAT (correct)"
        : "Unknown format (may be invalid)"
    : "NOT SET"

  const status = Object.entries(envVars).map(([key, value]) => ({
    name: key,
    isSet: !!value,
    length: value?.length || 0,
    preview: value ? `${value.substring(0, 6)}...${value.substring(value.length - 4)}` : "NOT SET",
    format: key === "GITHUB_TOKEN" ? tokenFormat : undefined,
  }))

  const allSet = status.every((s) => s.isSet)
  const tokenValid = githubToken && (githubToken.startsWith("ghp_") || githubToken.startsWith("github_pat_"))

  return NextResponse.json({
    allConfigured: allSet && tokenValid,
    variables: status,
    message: !allSet
      ? "Some environment variables are missing"
      : !tokenValid
        ? "GITHUB_TOKEN format is invalid - must start with 'ghp_' or 'github_pat_'"
        : "All environment variables are configured correctly",
    help:
      !allSet || !tokenValid
        ? [
            "1. Go to https://github.com/settings/tokens/new",
            "2. Create a new token (classic) with 'repo' scope",
            "3. Copy the ENTIRE token (starts with 'ghp_')",
            "4. Go to Vercel → Settings → Environment Variables",
            "5. Set GITHUB_TOKEN to the copied value (no quotes)",
            "6. CRITICAL: Click 'Redeploy' after saving",
          ]
        : undefined,
  })
}
