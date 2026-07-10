# MCP Servers

> **Source:** [OpenCode MCP Servers Documentation](https://opencode.ai/docs/mcp-servers/)

Add local and remote MCP tools to OpenCode.

You can extend OpenCode with external tools using the **Model Context Protocol (MCP)**. Both local and remote servers are supported. Once added, MCP tools are automatically available to the LLM alongside built-in tools.

> **Tip:** MCP servers add to your context window, so choose which ones you enable carefully. Some servers — like the GitHub MCP server — can produce a large number of tokens and may exceed the context limit.

---

## Configuration

Define MCP servers in your OpenCode config under the `mcp` key. Each server requires a unique name that you can reference when prompting the LLM.

**opencode.json:**

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "name-of-mcp-server": {
      "enabled": true
    },
    "name-of-other-mcp-server": {}
  }
}
```

Set `"enabled": false` to disable a server without removing its configuration.

### Overriding Remote Defaults

Organizations can provide default MCP servers via their `.well-known/opencode` endpoint. These servers may be disabled by default, allowing users to opt in.

To enable a specific server from your organization's remote config, add it to your local config with `"enabled": true`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "jira": {
      "type": "remote",
      "url": "https://jira.example.com/mcp",
      "enabled": true
    }
  }
}
```

Local config values always override remote defaults.

---

## Local Servers

Add a local MCP server by setting `"type"` to `"local"`.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "my-local-mcp-server": {
      "type": "local",
      "command": ["npx", "-y", "my-mcp-command"],
      "enabled": true,
      "environment": {
        "MY_ENV_VAR": "my_env_var_value"
      }
    }
  }
}
```

### Options

| Option | Type | Required | Description |
|---|---|---|---|
| `type` | String | Yes | Must be `"local"`. |
| `command` | Array | Yes | Command and arguments to run the MCP server. |
| `cwd` | String | No | Working directory for the MCP server process. |
| `environment` | Object | No | Environment variables to set when running the server. |
| `enabled` | Boolean | No | Enable or disable the MCP server on startup. |
| `timeout` | Number | No | Timeout in milliseconds for fetching tools. Defaults to `5000` (5 seconds). |

---

## Remote Servers

Add a remote MCP server by setting `"type"` to `"remote"`.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "my-remote-mcp": {
      "type": "remote",
      "url": "https://my-mcp-server.com",
      "enabled": true,
      "headers": {
        "Authorization": "Bearer MY_API_KEY"
      }
    }
  }
}
```

### Options

| Option | Type | Required | Description |
|---|---|---|---|
| `type` | String | Yes | Must be `"remote"`. |
| `url` | String | Yes | URL of the remote MCP server. |
| `enabled` | Boolean | No | Enable or disable the MCP server on startup. |
| `headers` | Object | No | Headers to send with each request. |
| `oauth` | Object | No | OAuth authentication configuration. |
| `timeout` | Number | No | Timeout in milliseconds for fetching tools. Defaults to `5000` (5 seconds). |

---

## OAuth

OpenCode automatically handles OAuth authentication for remote MCP servers. When a server requires authentication, OpenCode will:

1. Detect the `401` response and initiate the OAuth flow.
2. Use **Dynamic Client Registration (RFC 7591)** if the server supports it.
3. Store tokens securely for future requests.

### Automatic (No Configuration)

For most OAuth-enabled MCP servers, no special configuration is needed:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "my-oauth-server": {
      "type": "remote",
      "url": "https://mcp.example.com/mcp"
    }
  }
}
```

If the server requires authentication, OpenCode will prompt you to authenticate on first use.

### Pre-Registered Credentials

If you have client credentials from the MCP server provider:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "my-oauth-server": {
      "type": "remote",
      "url": "https://mcp.example.com/mcp",
      "oauth": {
        "clientId": "{env:MY_MCP_CLIENT_ID}",
        "clientSecret": "{env:MY_MCP_CLIENT_SECRET}",
        "scope": "tools:read tools:execute"
      }
    }
  }
}
```

### CLI Commands

```shell
opencode mcp auth my-oauth-server          # Trigger authentication
opencode mcp list                          # List all MCP servers and auth status
opencode mcp logout my-oauth-server        # Remove stored credentials
```

### Disabling OAuth

Set `"oauth"` to `false` for servers that use API keys instead:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "my-api-key-server": {
      "type": "remote",
      "url": "https://mcp.example.com/mcp",
      "oauth": false,
      "headers": {
        "Authorization": "Bearer {env:MY_API_KEY}"
      }
    }
  }
}
```

### OAuth Options

| Option | Type | Description |
|---|---|---|
| `oauth` | Object \| `false` | OAuth configuration object, or `false` to disable OAuth auto-detection. |
| `clientId` | String | OAuth client ID. Falls back to dynamic client registration. |
| `clientSecret` | String | OAuth client secret, if required. |
| `scope` | String | OAuth scopes to request during authorization. |

### Debugging

```shell
opencode mcp auth list                     # View auth status for all OAuth-capable servers
opencode mcp debug my-oauth-server         # Debug connection and OAuth flow
```

---

## Managing Tools

Your MCP servers are available as tools in OpenCode, alongside built-in tools.

### Global Control

Enable or disable MCP tools globally using the `tools` or `permission` config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "my-mcp-foo": {
      "type": "local",
      "command": ["bun", "x", "my-mcp-command-foo"]
    },
    "my-mcp-bar": {
      "type": "local",
      "command": ["bun", "x", "my-mcp-command-bar"]
    }
  },
  "tools": {
    "my-mcp-foo": false
  }
}
```

Use glob patterns to disable all matching MCPs at once:

```json
{
  "tools": {
    "my-mcp*": false
  }
}
```

### Per-Agent Control

Disable tools globally and enable them only for specific agents:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "my-mcp": {
      "type": "local",
      "command": ["bun", "x", "my-mcp-command"],
      "enabled": true
    }
  },
  "tools": {
    "my-mcp*": false
  },
  "agent": {
    "my-agent": {
      "tools": {
        "my-mcp*": true
      }
    }
  }
}
```

---

## Examples

### Sentry

Add the Sentry MCP server to interact with your Sentry projects and issues.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "sentry": {
      "type": "remote",
      "url": "https://mcp.sentry.dev/mcp",
      "oauth": {}
    }
  }
}
```

Authenticate with:

```shell
opencode mcp auth sentry
```

### Context7

Add the Context7 MCP server to search through documentation.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "context7": {
      "type": "remote",
      "url": "https://mcp.context7.com/mcp"
    }
  }
}
```

With an API key for higher rate limits:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "context7": {
      "type": "remote",
      "url": "https://mcp.context7.com/mcp",
      "headers": {
        "CONTEXT7_API_KEY": "{env:CONTEXT7_API_KEY}"
      }
    }
  }
}
```

### Grep by Vercel

Add the Grep by Vercel MCP server to search code snippets on GitHub.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "gh_grep": {
      "type": "remote",
      "url": "https://mcp.grep.app"
    }
  }
}
```
