# Ollamaton - Ollama MCP Client

A universal client that connects Ollama with any MCP (Model Context Protocol) servers, allowing you to extend your local AI with powerful tools and resources.

## Features

- 🔧 **Universal MCP Support**: Connect to any MCP server
- 🤖 **Ollama Integration**: Works with any Ollama model
- 📝 **Editable Instructions**: Customize system prompts and behavior
- 🌐 **Multiple Interfaces**: CLI, HTTP API, and Web GUI
- 🔄 **Auto-discovery**: Automatically finds and loads Claude Desktop configs
- 📊 **Tool Management**: List, test, and manage MCP tools
- 💬 **Interactive Chat**: Real-time conversation with tool integration

## Screenshot

![Ollamaton Web Interface](ollamaton_screenshot.png)

*Ollamaton's web interface showing the chat interface with MCP tool integration, settings modal, and responsive design.*

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Initialize Configuration

```bash
node cli.js init
```

This creates a default `mcp_config.json` file with example MCP servers.

### 3. Configure MCP Servers

Edit `mcp_config.json` or use the CLI:

```bash
# Add a filesystem server
node cli.js config add-server filesystem

# Add a web search server
node cli.js config add-server brave-search
```

### 4. Test Connections

```bash
node cli.js test
```

### 5. Start Using

```bash
# Interactive chat
node cli.js chat

# Web GUI
node cli.js gui

# HTTP API server
node cli.js server
```

## Configuration

⚠️ **Security Warning**: Never commit sensitive credentials (API keys, tokens, passwords) to version control. Use environment variables or secure credential management systems for production deployments.

### Using Claude Desktop Config

The client automatically searches for Claude Desktop configuration files in standard locations:

- `mcp_config.json` (local)
- `~/.config/claude/claude_desktop_config.json` (Linux/macOS)
- `~/AppData/Roaming/Claude/claude_desktop_config.json` (Windows)
- `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)

You can also specify a custom config file:

```bash
node cli.js test --config=/path/to/your/config.json
```

### Configuration Format

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/allowed/path"],
      "env": {}
    },
    "brave-search": {
      "command": "npx", 
      "args": ["-y", "@modelcontextprotocol/server-brave-search"],
      "env": {
        "BRAVE_API_KEY": "your-api-key-here"
      }
    }
  },
  "ollama": {
    "host": "http://localhost:11434",
    "defaultModel": "llama3.2"
  },
  "instructions": {
    "system": "You are a helpful AI assistant...",
    "followUp": "Tool result: {TOOL_RESULT}\n\nPlease provide a helpful summary..."
  }
}
```

## CLI Commands

### Configuration Management

```bash
# Show current configuration
node cli.js config show

# Set Ollama host
node cli.js config set-ollama http://localhost:11434

# Set default model
node cli.js config set-model llama3.2

# Add MCP server interactively
node cli.js config add-server myserver

# Remove MCP server
node cli.js config remove-server myserver

# Edit system instructions
node cli.js config edit-instructions
```

### Testing and Usage

```bash
# Test MCP connections
node cli.js test

# Interactive chat mode
node cli.js chat

# Start HTTP API server (port 3000)
node cli.js server

# Start web GUI (port 3000)
node cli.js gui

# Show help
node cli.js help
```

## HTTP API

When running `node cli.js server`, the following endpoints are available:

### POST /chat
Chat with the AI using MCP tools.

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "List files in the current directory"}'
```

### GET /tools
List available MCP tools.

```bash
curl http://localhost:3000/tools
```

### POST /test-tool
Test a specific tool.

```bash
curl -X POST http://localhost:3000/test-tool \
  -H "Content-Type: application/json" \
  -d '{"tool": "list_files", "args": {"path": "."}}'
```

## Web GUI

Start the web interface with:

```bash
node cli.js gui
```

Then open http://localhost:3000 in your browser for a full-featured chat interface with:

- Real-time chat with Ollama
- Tool usage visualization
- Collapsible tool results
- Markdown rendering
- Conversation history management

## Popular MCP Servers

Here are some popular MCP servers you can use:

### File System
```bash
node cli.js config add-server filesystem
# Command: npx
# Args: -y @modelcontextprotocol/server-filesystem /path/to/allowed/directory
```

### Web Search (Brave)
```bash
node cli.js config add-server brave-search
# Command: npx
# Args: -y @modelcontextprotocol/server-brave-search
# Env: BRAVE_API_KEY=your-api-key
```

### GitHub
```bash
node cli.js config add-server github
# Command: npx
# Args: -y @modelcontextprotocol/server-github
# Env: GITHUB_PERSONAL_ACCESS_TOKEN=your-token
```

### PostgreSQL
```bash
node cli.js config add-server postgres
# Command: npx
# Args: -y @modelcontextprotocol/server-postgres
# Env: DATABASE_URL=postgresql://user:pass@localhost/db
```

### Slack
```bash
node cli.js config add-server slack
# Command: npx
# Args: -y @modelcontextprotocol/server-slack
# Env: SLACK_BOT_TOKEN=xoxb-your-token
```

## Customizing Instructions

You can customize how the AI behaves by editing the system instructions:

```bash
node cli.js config edit-instructions
```

The instructions support two templates:

1. **System Instructions**: The main prompt that defines the AI's behavior
2. **Follow-up Template**: How tool results are presented to the AI (use `{TOOL_RESULT}` placeholder)

## Troubleshooting

### MCP Server Connection Issues

1. **Check server installation**:
   ```bash
   node cli.js test
   ```

2. **Verify server command and arguments**:
   ```bash
   node cli.js config show
   ```

3. **Test server manually**:
   ```bash
   npx @modelcontextprotocol/server-filesystem /path/to/directory
   ```

### Ollama Connection Issues

1. **Ensure Ollama is running**:
   ```bash
   ollama serve
   ```

2. **Check Ollama host configuration**:
   ```bash
   node cli.js config set-ollama http://localhost:11434
   ```

3. **Verify model availability**:
   ```bash
   ollama list
   ```

### Configuration Issues

1. **Reset to default configuration**:
   ```bash
   node cli.js init
   ```

2. **Use specific config file**:
   ```bash
   node cli.js test --config=/path/to/config.json
   ```

## Development

### Project Structure

```
├── cli.js              # Command-line interface
├── config.js           # Configuration management
├── main_index.js       # HTTP API server
├── mcp_client.js       # MCP client implementation
├── ollama_integration.js # Ollama integration
├── web_gui.js          # Web GUI server
└── README.md           # This file
```

### Adding New Features

1. **New CLI commands**: Add to `cli.js`
2. **New API endpoints**: Add to `main_index.js`
3. **New MCP functionality**: Add to `mcp_client.js`
4. **New Ollama features**: Add to `ollama_integration.js`

## License

MIT License - see LICENSE file for details.

## Third-Party Libraries

This project includes the following third-party libraries:

- **marked v15.0.12** - A markdown parser
  - Copyright (c) 2011-2025, Christopher Jeffrey. (MIT Licensed)
  - https://github.com/markedjs/marked
  - Used for rendering markdown in the web GUI chat interface

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Support

- 📖 Check the troubleshooting section above
- 🐛 Report bugs via GitHub issues
- 💡 Request features via GitHub issues
- 📧 Contact: [inventorado7@gmail.com]

---

**Made with ❤️ for the MCP and Ollama communities**
