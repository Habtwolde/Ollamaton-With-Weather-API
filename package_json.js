{
  "name": "ollama-mcp-client",
  "version": "1.0.0",
  "description": "Ollama client with MCP server integration",
  "type": "module",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "node --watch index.js",
    "test": "node test.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "ollama": "^0.5.0",
    "express": "^4.18.2"
  },
  "keywords": ["ollama", "mcp", "ai", "tools"],
  "author": "",
  "license": "MIT"
}