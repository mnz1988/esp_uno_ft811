"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, CheckCircle2, XCircle, Clock, Settings, RefreshCw, Copy } from "lucide-react"

/**
 * Main Dashboard Component
 * Provides UI for:
 * - Testing GitHub credentials
 * - Checking environment variables
 * - Manually triggering the cron job
 * - Regenerating light.json from existing raw.json
 * - Displaying JSON file URLs for external access
 */
export default function CronDashboard() {
  // State management for different operations
  const [loading, setLoading] = useState(false) // Main cron job loading state
  const [result, setResult] = useState<any>(null) // Main cron job result
  const [error, setError] = useState<string | null>(null) // Main cron job error

  const [testLoading, setTestLoading] = useState(false) // GitHub test loading state
  const [testResult, setTestResult] = useState<any>(null) // GitHub test result
  const [testError, setTestError] = useState<string | null>(null) // GitHub test error

  const [envLoading, setEnvLoading] = useState(false) // Environment check loading state
  const [envResult, setEnvResult] = useState<any>(null) // Environment check result

  const [regenerateLoading, setRegenerateLoading] = useState(false) // Regenerate loading state
  const [regenerateResult, setRegenerateResult] = useState<any>(null) // Regenerate result
  const [regenerateError, setRegenerateError] = useState<string | null>(null) // Regenerate error

  const [copiedRaw, setCopiedRaw] = useState(false) // Copy feedback for raw.json URL
  const [copiedLight, setCopiedLight] = useState(false) // Copy feedback for light.json URL

  // Automatically check environment variables when page loads
  useEffect(() => {
    checkEnv()
  }, [])

  /**
   * Triggers the main cron job endpoint
   * Fetches data from external API and saves to GitHub
   */
  const triggerCron = async () => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch("/api/cron")
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to trigger cron job")
      }

      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error occurred")
    } finally {
      setLoading(false)
    }
  }

  /**
   * Tests GitHub credentials and repository access
   * Verifies token is valid before running the main cron job
   */
  const testGitHub = async () => {
    setTestLoading(true)
    setTestError(null)
    setTestResult(null)

    try {
      const response = await fetch("/api/test-github")
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "GitHub test failed")
      }

      setTestResult(data)
    } catch (err) {
      setTestError(err instanceof Error ? err.message : "Unknown error occurred")
    } finally {
      setTestLoading(false)
    }
  }

  /**
   * Checks if all required environment variables are configured
   * Shows which variables are set and their lengths
   */
  const checkEnv = async () => {
    setEnvLoading(true)
    setEnvResult(null)

    try {
      const response = await fetch("/api/check-env")
      const data = await response.json()
      setEnvResult(data)
    } catch (err) {
      setEnvResult({ error: err instanceof Error ? err.message : "Failed to check environment" })
    } finally {
      setEnvLoading(false)
    }
  }

  /**
   * Regenerates light.json from existing raw.json in GitHub
   * Useful when you want to update filtering without fetching new data
   */
  const regenerateLight = async () => {
    setRegenerateLoading(true)
    setRegenerateError(null)
    setRegenerateResult(null)

    try {
      const response = await fetch("/api/regenerate-light", { method: "POST" })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to regenerate light.json")
      }

      setRegenerateResult(data)
    } catch (err) {
      setRegenerateError(err instanceof Error ? err.message : "Unknown error occurred")
    } finally {
      setRegenerateLoading(false)
    }
  }

  /**
   * Copies text to clipboard and shows feedback
   * @param text - Text to copy
   * @param type - Which URL is being copied (for feedback state)
   */
  const copyToClipboard = async (text: string, type: "raw" | "light") => {
    try {
      await navigator.clipboard.writeText(text)
      // Show "copied" feedback for 2 seconds
      if (type === "raw") {
        setCopiedRaw(true)
        setTimeout(() => setCopiedRaw(false), 2000)
      } else {
        setCopiedLight(true)
        setTimeout(() => setCopiedLight(false), 2000)
      }
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }

  // Extract GitHub configuration from environment check result
  const owner = envResult?.variables?.find((v: any) => v.name === "GITHUB_OWNER")?.value || "YOUR_USERNAME"
  const repo = envResult?.variables?.find((v: any) => v.name === "GITHUB_REPO")?.value || "YOUR_REPO"
  const branch = envResult?.variables?.find((v: any) => v.name === "GITHUB_BRANCH")?.value || "main"

  // Construct GitHub raw content URLs for direct access to JSON files
  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/raw.json`
  const lightUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/light.json`

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Page Header */}
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">Cryptorank Cron-Job Dashboard</h1>
          <p className="text-muted-foreground">Trigger the API to fetch data and save to GitHub</p>
        </div>

        {/* Environment Variables Check Card */}
        <Card>
          <CardHeader>
            <CardTitle>Environment Variables</CardTitle>
            <CardDescription>Check if all required environment variables are configured</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={checkEnv} disabled={envLoading} className="w-full bg-transparent" variant="outline">
              {envLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Checking...
                </>
              ) : (
                <>
                  <Settings className="mr-2 h-4 w-4" />
                  Check Environment Variables
                </>
              )}
            </Button>

            {/* Display environment check results */}
            {envResult && (
              <Alert
                className={
                  envResult.allConfigured
                    ? "border-green-500/50 bg-green-500/10"
                    : "border-yellow-500/50 bg-yellow-500/10"
                }
              >
                {envResult.allConfigured ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-yellow-500" />
                )}
                <AlertDescription className="space-y-2">
                  <p className={`font-semibold ${envResult.allConfigured ? "text-green-500" : "text-yellow-500"}`}>
                    {envResult.message}
                  </p>
                  {/* List all environment variables with their status */}
                  <div className="space-y-1 text-sm">
                    {envResult.variables?.map((v: any) => (
                      <div key={v.name} className="flex items-center justify-between">
                        <code className="text-xs">{v.name}</code>
                        <span className={v.isSet ? "text-green-500" : "text-red-500"}>
                          {v.isSet ? `✓ (${v.length} chars)` : "✗ NOT SET"}
                        </span>
                      </div>
                    ))}
                  </div>
                  {/* Show help text if variables are missing */}
                  {envResult.help && (
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {envResult.help.map((line: string, i: number) => (
                        <p key={i}>{line}</p>
                      ))}
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* GitHub Connection Test Card */}
        <Card>
          <CardHeader>
            <CardTitle>Test GitHub Connection</CardTitle>
            <CardDescription>
              Verify your GitHub token and repository access before running the cron job
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={testGitHub} disabled={testLoading} className="w-full bg-transparent" variant="outline">
              {testLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Testing...
                </>
              ) : (
                "Test GitHub Credentials"
              )}
            </Button>

            {/* Display test success */}
            {testResult && (
              <Alert className="border-green-500/50 bg-green-500/10">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <AlertDescription className="space-y-2">
                  <p className="font-semibold text-green-500">GitHub Connection Successful!</p>
                  <div className="space-y-1 text-sm">
                    <p>Authenticated as: {testResult.user}</p>
                    <p>Repository: {testResult.repo}</p>
                    <p>Permissions: {JSON.stringify(testResult.permissions)}</p>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Display test error */}
            {testError && (
              <Alert className="border-red-500/50 bg-red-500/10">
                <XCircle className="h-4 w-4 text-red-500" />
                <AlertDescription>
                  <p className="font-semibold text-red-500">GitHub Connection Failed</p>
                  <p className="text-sm">{testError}</p>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Manual Cron Trigger Card */}
        <Card>
          <CardHeader>
            <CardTitle>Manual Trigger</CardTitle>
            <CardDescription>Test your cron job endpoint before setting up automated scheduling</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={triggerCron} disabled={loading} className="w-full" size="lg">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Clock className="mr-2 h-4 w-4" />
                  Manual Trigger Cron Job
                </>
              )}
            </Button>

            {/* Display cron job success */}
            {result && (
              <Alert className="border-green-500/50 bg-green-500/10">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <AlertDescription className="space-y-2">
                  <p className="font-semibold text-green-500">Success!</p>
                  <div className="space-y-1 text-sm">
                    <p>Timestamp: {result.timestamp}</p>
                    <p>Raw data size: {result.rawSize?.toLocaleString()} bytes</p>
                    <p>Filtered data size: {result.filteredSize?.toLocaleString()} bytes</p>
                    <p className="text-muted-foreground">{result.message}</p>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Display cron job error */}
            {error && (
              <Alert className="border-red-500/50 bg-red-500/10">
                <XCircle className="h-4 w-4 text-red-500" />
                <AlertDescription>
                  <p className="font-semibold text-red-500">Error</p>
                  <p className="text-sm">{error}</p>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Regenerate Light Version Card */}
        <Card>
          <CardHeader>
            <CardTitle>Regenerate Light Version</CardTitle>
            <CardDescription>
              Re-filter and regenerate light.json from the existing raw.json file in your repository
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={regenerateLight}
              disabled={regenerateLoading}
              className="w-full bg-transparent"
              variant="outline"
              size="lg"
            >
              {regenerateLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Regenerating...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Regenerate light.json
                </>
              )}
            </Button>

            {/* Display regenerate success */}
            {regenerateResult && (
              <Alert className="border-green-500/50 bg-green-500/10">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <AlertDescription className="space-y-2">
                  <p className="font-semibold text-green-500">Success!</p>
                  <div className="space-y-1 text-sm">
                    <p>Timestamp: {regenerateResult.timestamp}</p>
                    <p>Cryptocurrencies: {regenerateResult.count}</p>
                    <p className="text-muted-foreground">{regenerateResult.message}</p>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Display regenerate error */}
            {regenerateError && (
              <Alert className="border-red-500/50 bg-red-500/10">
                <XCircle className="h-4 w-4 text-red-500" />
                <AlertDescription>
                  <p className="font-semibold text-red-500">Error</p>
                  <p className="text-sm">{regenerateError}</p>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* JSON File URLs Card */}
        <Card>
          <CardHeader>
            <CardTitle>JSON File URLs</CardTitle>
            <CardDescription>Direct links to access your raw and filtered cryptocurrency data</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Raw JSON URL */}
            <div className="space-y-2">
              <label className="text-sm font-medium">raw.json (Full Data)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={rawUrl}
                  className="flex-1 rounded-md border bg-muted px-3 py-2 text-sm"
                />
                <Button size="sm" variant="outline" onClick={() => copyToClipboard(rawUrl, "raw")} className="shrink-0">
                  {copiedRaw ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* Light JSON URL */}
            <div className="space-y-2">
              <label className="text-sm font-medium">light.json (Filtered Top 100)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={lightUrl}
                  className="flex-1 rounded-md border bg-muted px-3 py-2 text-sm"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyToClipboard(lightUrl, "light")}
                  className="shrink-0"
                >
                  {copiedLight ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Note: These URLs will work after you run the cron job at least once and the files are committed to your
              GitHub repository.
            </p>
          </CardContent>
        </Card>

        {/* Setup Instructions Card */}
        <Card>
          <CardHeader>
            <CardTitle>Setup Instructions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {/* Step 1: Environment Variables */}
            <div className="space-y-2">
              <h3 className="font-semibold">1. Configure Environment Variables</h3>
              <p className="text-muted-foreground">Add these to your Vercel project settings:</p>
              <ul className="list-inside list-disc space-y-1 text-muted-foreground">
                <li>
                  <code className="text-foreground">EXTERNAL_API_URL</code> - The API endpoint to fetch data from
                </li>
                <li>
                  <code className="text-foreground">EXTERNAL_API_KEY</code> - API key (if required)
                </li>
                <li>
                  <code className="text-foreground">GITHUB_TOKEN</code> - GitHub personal access token
                </li>
                <li>
                  <code className="text-foreground">GITHUB_OWNER</code> - GitHub username or organization
                </li>
                <li>
                  <code className="text-foreground">GITHUB_REPO</code> - Repository name
                </li>
                <li>
                  <code className="text-foreground">GITHUB_BRANCH</code> - Branch name (default: main)
                </li>
              </ul>
            </div>

            {/* Step 2: Cron Job Setup */}
            <div className="space-y-2">
              <h3 className="font-semibold">2. Setup cron-job.org</h3>
              <p className="text-muted-foreground">Create a new cron job with this URL:</p>
              <code className="block rounded-md bg-muted p-2 text-foreground">
                https://your-domain.vercel.app/api/cron
              </code>
              <p className="text-muted-foreground">Set schedule to: Every 30 minutes</p>
            </div>

            {/* Step 3: Customization */}
            <div className="space-y-2">
              <h3 className="font-semibold">3. Customize Filtering Logic</h3>
              <p className="text-muted-foreground">
                Edit the <code className="text-foreground">filterData</code> function in{" "}
                <code className="text-foreground">app/api/cron/route.ts</code> to implement your custom filtering logic.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
