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

*Coming soon* - The bridge is not yet functional. Watch this repo for updates.

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
