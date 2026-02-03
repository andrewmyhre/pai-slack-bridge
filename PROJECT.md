# PAI Slack Bridge

Bridge between Slack and local Claude Code CLI for PAI system access.

## Artifacts

| Type | Location |
|------|----------|
| Source Code | `~/projects/pai-slack-bridge` |
| GitHub | https://github.com/andrewmyhre/pai-slack-bridge |

## Goals

1. **Slack-to-PAI Communication** - Enable two-way messaging between Slack and locally running Claude Code
2. **Named Agent Access** - Address specific agents (Kit, Quinn) from Slack
3. **Session Management** - Thread-based conversations that maintain context
4. **Security** - Per-user and per-channel access controls

## Architecture

```
Slack (DMs, mentions, channels)
            │
            │ Socket Mode
            ▼
    ┌───────────────────┐
    │  PAI Slack Bridge │
    │  ├── Slack Bolt   │
    │  ├── Router       │
    │  └── Sessions     │
    └─────────┬─────────┘
              │
              ▼
    ┌───────────────────┐
    │  Claude Code CLI  │
    │  (--print mode)   │
    └─────────┬─────────┘
              │
              ▼
    ┌───────────────────┐
    │    PAI System     │
    │  (agents, hooks)  │
    └───────────────────┘
```

**Components:**
- `src/index.ts` - Entry point
- `src/slack/` - Slack Bolt SDK integration
- `src/bridge/` - Claude Code CLI integration
- `src/config/` - Configuration management

## Current Status

### Blocked

**Waiting on Slack tokens** - Need to create Slack app and obtain:
- `SLACK_BOT_TOKEN` (xoxb-*)
- `SLACK_APP_TOKEN` (xapp-*)

### Implemented

- Core architecture designed
- Slack Bolt SDK integration scaffolded
- Message routing structure
- Session management concept

### Open Issues

| Issue | Title | Status |
|-------|-------|--------|
| #4 | PAI System Integration | Open |
| #5 | Security & Access Control | Open |
| #6 | Local Deployment | Open |
| #7 | Testing Strategy | Open |
| #8 | End-to-End Testing | Open |

## Quick Start

```bash
# Install dependencies
bun install

# Configure environment
cp .env.example .env
# Edit .env with your Slack tokens

# Run the bridge
bun run start
```

## Related Documents

- `tasks/` - Task tracking and backlog
- `discussions/` - Architecture debates
- `decisions/` - ADRs and resolved decisions
