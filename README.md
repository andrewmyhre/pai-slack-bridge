# PAI Slack Bridge

Bridge between Slack and local Claude Code CLI for PAI system integration.

## Project Vision

Enable two-way communication between Slack and a locally running Claude Code instance, giving you access to your entire PAI system (agents, filesystem, hooks) from anywhere via Slack messages.

This means you can:
- Chat with named agents (Kit, Quinn) from your phone
- Trigger PAI workflows from Slack
- Access your local development environment remotely
- Get notifications and responses in familiar Slack threads

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              SLACK                                       │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐          │
│  │  User    │    │  User    │    │  #dev    │    │  #alerts │          │
│  │  DM      │    │  @bot    │    │ channel  │    │ channel  │          │
│  └────┬─────┘    └────┬─────┘    └────┬─────┘    └────▲─────┘          │
│       │               │               │               │                 │
│       └───────────────┴───────────────┘               │                 │
│                       │                               │                 │
└───────────────────────┼───────────────────────────────┼─────────────────┘
                        │ Socket Mode                   │
                        ▼                               │
┌─────────────────────────────────────────────────────────────────────────┐
│                         LOCAL MACHINE                                    │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                    PAI SLACK BRIDGE                                 │ │
│  │  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐              │ │
│  │  │   Slack     │   │   Message   │   │   Session   │              │ │
│  │  │   Bolt SDK  │──▶│   Router    │──▶│   Manager   │              │ │
│  │  └─────────────┘   └─────────────┘   └──────┬──────┘              │ │
│  │                                              │                     │ │
│  └──────────────────────────────────────────────┼─────────────────────┘ │
│                                                 │                       │
│                                                 ▼                       │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                      CLAUDE CODE CLI                              │  │
│  │  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐            │  │
│  │  │   --print   │   │   Session   │   │   Output    │            │  │
│  │  │   mode      │──▶│   Context   │──▶│   Capture   │────────────┼──┘
│  │  └─────────────┘   └─────────────┘   └─────────────┘            │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                 │                       │
│                                                 ▼                       │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                       PAI SYSTEM                                  │  │
│  │  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐          │  │
│  │  │   Kit   │   │  Quinn  │   │  Hooks  │   │ Memory  │          │  │
│  │  │  Agent  │   │  Agent  │   │ System  │   │ System  │          │  │
│  │  └─────────┘   └─────────┘   └─────────┘   └─────────┘          │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

## Key Features

- **Named Agent Access**: Address specific agents like `@pai ask Kit about the Donk architecture`
- **Filesystem Operations**: Read and write files through the bridge (with security controls)
- **PAI Hooks Integration**: Trigger hooks and receive hook outputs back in Slack
- **Multi-turn Conversations**: Thread-based conversations maintain context
- **Session Management**: Each Slack thread maps to a Claude Code session

## Tech Stack

- **Runtime**: [Bun](https://bun.sh) (TypeScript)
- **Slack SDK**: [@slack/bolt](https://slack.dev/bolt-js/)
- **CLI Integration**: Claude Code CLI with `--print` mode
- **Configuration**: TypeScript config files

## Status

**Prototype / Early Development**

This is a new project. Core architecture is being designed. See GitHub Issues for the current roadmap.

## Getting Started

### Prerequisites

- Local machine with Claude Code CLI installed
- Slack workspace where you can create apps
- Bun runtime (`curl -fsSL https://bun.sh/install | bash`)

### 1. Create Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click **Create New App**
3. Choose **From an app manifest**
4. Select your workspace
5. Copy the contents of `slack-app-manifest.yaml` from this repo
6. Review and create the app

### 2. Enable Socket Mode

1. In your app settings, go to **Socket Mode** (left sidebar)
2. Toggle **Enable Socket Mode** to ON
3. Generate an **App-Level Token** with `connections:write` scope
4. Save this token - it's your `SLACK_APP_TOKEN` (starts with `xapp-`)

### 3. Install App to Workspace

1. Go to **OAuth & Permissions** (left sidebar)
2. Click **Install to Workspace**
3. Authorize the requested scopes
4. Copy the **Bot User OAuth Token** - this is your `SLACK_BOT_TOKEN` (starts with `xoxb-`)

### 4. Configure Environment

Create a `.env` file in the project root:

```bash
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_APP_TOKEN=xapp-your-app-token
```

### 5. Run the Bridge

```bash
bun install
bun run start
```

### Required Bot Token Scopes

The app manifest includes these scopes:

| Scope | Purpose |
|-------|---------|
| `app_mentions:read` | React to @mentions |
| `channels:history` | Read channel messages |
| `channels:read` | List channels |
| `chat:write` | Send messages |
| `groups:history` | Read private channel messages |
| `groups:read` | List private channels |
| `im:history` | Read DMs |
| `im:read` | List DMs |
| `im:write` | Send DMs |
| `users:read` | Get user info |

## Requirements

- Local machine with Claude Code CLI installed
- Slack workspace where you can create apps
- Bun runtime (`curl -fsSL https://bun.sh/install | bash`)

## Security Considerations

- The bridge runs locally on your machine
- Slack Socket Mode means no public webhooks needed
- Access control is configurable per-user and per-channel
- Sensitive commands can be restricted

## License

MIT
