# Ollama MCP Client

A Node.js application that integrates Ollama with Model Context Protocol (MCP) servers.

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Make Sure Ollama is Running
```bash
# Start Ollama server
ollama serve

# Pull a model if you don't have one
ollama pull llama3.2
```

### 3. Verify MCP Servers
Make sure your MCP servers are accessible

## Usage

### Start the Server
```bash
npm start
```

### Interactive Mode
```bash
node index.js --interactive
```

### Run Tests
```bash
# Test MCP connections
npm test

# Test tools directly
node test.js tools
```

## API Endpoints

### POST /chat
Chat with Ollama using MCP tools:
```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Search for patients named John"}'
```

### GET /tools
List available MCP tools:
```bash
curl http://localhost:3000/tools
```

### POST /test-tool
Test a specific tool:
```bash
curl -X POST http://localhost:3000/test-tool \
  -H "Content-Type: application/json" \
  -d '{"tool": "search_patients", "args": {"name": "test"}}'
```

## Example Conversations

**Database Query:**
```
You: "Show me the tables in the database"
AI: Uses Supabase tools to list tables, then explains structure
```

## Configuration

The MCP servers credentials are set in the environment variables within the mcp_congig.

## Troubleshooting

**MCP Connection Issues:**
- Check that MCP server path is correct
- Verify environment variables are set properly
- Ensure network access to API endpoints

**Ollama Issues:**
- Make sure `ollama serve` is running
- Check that you have models installed: `ollama list`
- Verify Ollama is accessible at localhost:11434

**Tool Call Issues:**
- Check tool names with `GET /tools`
- Verify tool arguments match expected schema
- Test tools individually with `/test-tool`

## Architecture

```
App → Ollama LLM → Tool Parser → MCP Manager → MCP Servers

```

The system automatically:
1. Detects when Ollama wants to use tools
2. Calls the appropriate MCP server
3. Returns results back to Ollama for final response
