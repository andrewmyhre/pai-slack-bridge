/**
 * Slack Bolt app initialization
 */

import { App } from "@slack/bolt";
import type { Config } from "../config";
import { registerHandlers } from "./handlers";

export function createSlackApp(config: Config): App {
  const app = new App({
    token: config.slack.botToken,
    appToken: config.slack.appToken,
    socketMode: true,
    // signingSecret is optional for Socket Mode
    ...(config.slack.signingSecret && {
      signingSecret: config.slack.signingSecret,
    }),
  });

  // Register event handlers
  registerHandlers(app, config);

  return app;
}

export async function startApp(app: App): Promise<void> {
  await app.start();
  console.log("PAI Slack Bridge is running!");
}
