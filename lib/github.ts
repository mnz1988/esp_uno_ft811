export interface GitHubConfig {
  token: string
  owner: string
  repo: string
  branch?: string
}

export class GitHubClient {
  private config: GitHubConfig

  constructor(config: GitHubConfig) {
    this.config = {
      ...config,
      branch: config.branch || "main",
    }
  }

  async getFile(path: string): Promise<{ content: string; sha: string } | null> {
    try {
      const response = await fetch(
        `https://api.github.com/repos/${this.config.owner}/${this.config.repo}/contents/${path}?ref=${this.config.branch}`,
        {
          headers: {
            Authorization: `token ${this.config.token}`,
            Accept: "application/vnd.github.v3+json",
          },
        },
      )

      if (!response.ok) {
        return null
      }

      const data = await response.json()
      return {
        content: Buffer.from(data.content, "base64").toString("utf-8"),
        sha: data.sha,
      }
    } catch (error) {
      return null
    }
  }

  async commitFile(path: string, content: string, message?: string): Promise<void> {
    const existingFile = await this.getFile(path)

    const response = await fetch(
      `https://api.github.com/repos/${this.config.owner}/${this.config.repo}/contents/${path}`,
      {
        method: "PUT",
        headers: {
          Authorization: `token ${this.config.token}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: message || `Update ${path} - ${new Date().toISOString()}`,
          content: Buffer.from(content).toString("base64"),
          branch: this.config.branch,
          ...(existingFile && { sha: existingFile.sha }),
        }),
      },
    )

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to commit ${path}: ${error}`)
    }
  }
}
