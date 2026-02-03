/**
 * PAI Slack Bridge - Entry Point
 *
 * Bridges Slack messages to local Claude Code CLI
 */

import { loadConfig } from "./config";
import { createSlackApp, startApp } from "./slack/app";

async function main() {
  console.log("Starting PAI Slack Bridge...");

  // Load configuration from environment
  const config = loadConfig();

  if (config.bridge.debugMode) {
    console.log("Debug mode enabled");
  }

  // Create and start Slack app
  const app = createSlackApp(config);
  await startApp(app);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
