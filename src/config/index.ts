/**
 * Configuration management for PAI Slack Bridge
 */

export interface Config {
  slack: {
    botToken: string;
    appToken: string;
    signingSecret?: string;
  };
  claude: {
    cliPath: string;
    timeout: number;
    maxOutputLength: number;
  };
  bridge: {
    allowedUsers?: string[];
    allowedChannels?: string[];
    debugMode: boolean;
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadConfig(): Config {
  return {
    slack: {
      botToken: requireEnv("SLACK_BOT_TOKEN"),
      appToken: requireEnv("SLACK_APP_TOKEN"),
      signingSecret: process.env.SLACK_SIGNING_SECRET,
    },
    claude: {
      cliPath: process.env.CLAUDE_CLI_PATH || "claude",
      timeout: parseInt(process.env.CLAUDE_TIMEOUT || "120000", 10),
      maxOutputLength: parseInt(process.env.CLAUDE_MAX_OUTPUT || "4000", 10),
    },
    bridge: {
      allowedUsers: process.env.ALLOWED_USERS?.split(",").filter(Boolean),
      allowedChannels: process.env.ALLOWED_CHANNELS?.split(",").filter(Boolean),
      debugMode: process.env.DEBUG === "true",
    },
  };
}
