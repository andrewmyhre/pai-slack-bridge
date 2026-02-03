# PAI Slack Bridge Backlog

## Blocked

**All work blocked on Slack tokens.** Need to:
1. Create Slack app in workspace (see README.md)
2. Enable Socket Mode, get App Token
3. Install to workspace, get Bot Token
4. Add tokens to `.env`

## Open Issues

| Issue | Title | Priority | Notes |
|-------|-------|----------|-------|
| #4 | PAI System Integration | High | Core functionality |
| #5 | Security & Access Control | High | Per-user/channel controls |
| #6 | Local Deployment | Medium | systemd/launchd setup |
| #7 | Testing Strategy | Medium | Unit + integration approach |
| #8 | End-to-End Testing | Low | Needs #7 first |

## Next Steps (after tokens)

1. **Validate Slack connection** - Confirm bot can receive messages
2. **Implement basic message routing** - DM and mention handling
3. **Wire up Claude Code CLI** - Spawn `claude --print` process
4. **Session management** - Map threads to sessions
5. **Security controls** - User allowlist, command restrictions

## Full Backlog

See GitHub Issues: https://github.com/andrewmyhre/pai-slack-bridge/issues
