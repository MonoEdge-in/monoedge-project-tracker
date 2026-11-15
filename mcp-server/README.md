# MonoEdge tracker MCP

Agents can create, list, read, and update tracker tasks. The deployed app hosts the tools, so nobody needs a checkout of this repo. The tools write the same Google Sheet as the web app.

Set `TRACKER_MCP_TOKEN` on the Vercel project (any long random string). That is the only extra setting. The sheet credentials are already on the deployment.

## Cursor or Claude

```json
{
  "mcpServers": {
    "monoedge-tracker": {
      "url": "https://monoedge-project-tracker.vercel.app/api/mcp",
      "headers": {
        "Authorization": "Bearer THE_SAME_TOKEN"
      }
    }
  }
}
```

Replace the URL if the deployment domain is different, and replace the token. Restart the app. No install, no local path.

## Local script

`bin/start.sh` is only for running the same tools on a machine that already has the repo. Prefer the URL above.

## Cursor (local script)

`.cursor/mcp.json` in this repo, or Cursor Settings → MCP:

```json
{
  "mcpServers": {
    "monoedge-tracker": {
      "command": "/absolute/path/to/monoedge-project-tracker/mcp-server/bin/start.sh"
    }
  }
}
```

Replace the path with the real one. Restart Cursor. The tools show up as `monoedge-tracker`.

## Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "monoedge-tracker": {
      "command": "/absolute/path/to/monoedge-project-tracker/mcp-server/bin/start.sh"
    }
  }
}
```

Quit and reopen Claude Desktop.

## Tools

| Tool | What it does |
|---|---|
| `list_work_items` | Search and filter tasks (text, status, product, person). Completed work older than 14 days stays hidden unless `includeArchived` is true or the text search hits it. |
| `get_work_item` | One task. `id` is `MON-12` or `12`. |
| `create_work_item` | Adds a row. Requires title (max 20 words), description, product (`Kaagaz`, `Soch`, `Business Brain`), primary person, assigned by, and end date (`yyyy-mm-dd`). Status defaults to Yet to Start, priority to Medium. |
| `update_work_item` | Changes only the fields you send. Person fields accept a name or member id from the Team tab. |

People names are resolved against the Team tab. If a short name matches two people, the tool asks for a full name or id.
