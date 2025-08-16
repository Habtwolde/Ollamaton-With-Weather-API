import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export class MCPManager {
  constructor(configManager) {
    this.clients = new Map();    // serverName -> Client
    this.tools = new Map();      // toolName   -> { client, serverName, tool }
    this.resources = new Map();  // uri        -> { client, serverName, resource }
    this.configManager = configManager;
  }

  async initializeServers() {
    const mcpServers = this.configManager.getMCPServers();

    if (Object.keys(mcpServers).length === 0) {
      console.log('⚠️  No MCP servers configured. Add servers to your config file.');
      return;
    }

    console.log(`🔧 Initializing ${Object.keys(mcpServers).length} MCP servers...`);

    for (const [name, config] of Object.entries(mcpServers)) {
      await this.connectServer(name, config);
    }

    console.log('✅ MCP servers initialization complete');
    await this.loadAllTools();
    await this.loadAllResources();
  }

  async connectServer(name, config) {
    try {
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: { ...process.env, ...config.env }
      });

      const client = new Client(
        { name: `ollama-${name}-client`, version: "1.0.0" },
        { capabilities: { tools: {} } }
      );

      await client.connect(transport);
      this.clients.set(name, client);
      console.log(`Connected to ${name} MCP server`);
    } catch (error) {
      console.error(`Failed to connect to ${name} server:`, error.message);
    }
  }

  async loadAllTools() {
    for (const [serverName, client] of this.clients) {
      try {
        const { tools } = await client.listTools();
        console.log(`${serverName} tools:`, tools.map(t => t.name));

        for (const tool of tools) {
          // Note: if multiple servers expose the same tool name, the last one wins.
          this.tools.set(tool.name, { client, serverName, tool });
        }
      } catch (error) {
        console.error(`Failed to load tools from ${serverName}:`, error);
      }
    }
  }

  async loadAllResources() {
    for (const [serverName, client] of this.clients) {
      try {
        const { resources } = await client.listResources();
        if (resources && resources.length > 0) {
          console.log(`${serverName} resources:`, resources.map(r => r.uri));

          for (const resource of resources) {
            this.resources.set(resource.uri, { client, serverName, resource });
          }
        }
      } catch (error) {
        // resources are optional in MCP; ignore “method not found”
        if (error.code !== -32601) {
          console.error(`Failed to load resources from ${serverName}:`, error.message);
        }
      }
    }
  }

  // Existing helper: call by tool name only (uses last-loaded server if duplicates)
  async callTool(toolName, args = {}) {
    const toolInfo = this.tools.get(toolName);
    if (!toolInfo) {
      throw new Error(`Tool '${toolName}' not found`);
    }

    try {
      console.log(`Calling tool: ${toolName} with args:`, args);
      const result = await toolInfo.client.callTool({
        name: toolName,
        arguments: args
      });
      return result;
    } catch (error) {
      console.error(`Error calling tool ${toolName}:`, error);
      throw error;
    }
  }

  /**
   * NEW: Call a tool on a specific MCP server by name.
   * This guarantees you hit the intended server (e.g., 'pg_log' → 'log_chat').
   */
  async callToolOnServer(serverName, toolName, args = {}) {
    // Find a tool entry that matches both server & tool
    const match = Array.from(this.tools.values()).find(
      t => t.serverName === serverName && t.tool.name === toolName
    );

    if (!match) {
      throw new Error(`Tool '${toolName}' not found on server '${serverName}'`);
    }

    try {
      console.log(`Calling tool '${toolName}' on server '${serverName}' with args:`, args);
      const result = await match.client.callTool({
        name: toolName,
        arguments: args
      });
      return result;
    } catch (error) {
      console.error(`Error calling tool ${toolName} on server ${serverName}:`, error);
      throw error;
    }
  }

  getAvailableTools() {
    return Array.from(this.tools.keys());
  }

  getToolInfo(toolName) {
    const toolInfo = this.tools.get(toolName);
    return toolInfo ? toolInfo.tool : null;
  }

  async accessResource(uri) {
    const resourceInfo = this.resources.get(uri);
    if (!resourceInfo) {
      throw new Error(`Resource '${uri}' not found`);
    }

    try {
      console.log(`Accessing resource: ${uri}`);
      const result = await resourceInfo.client.readResource({ uri });
      return result;
    } catch (error) {
      console.error(`Error accessing resource ${uri}:`, error);
      throw error;
    }
  }

  getAvailableResources() {
    return Array.from(this.resources.keys());
  }

  getResourceInfo(uri) {
    const resourceInfo = this.resources.get(uri);
    return resourceInfo ? resourceInfo.resource : null;
  }

  getAllServers() {
    return Array.from(this.clients.keys());
  }

  getConnectedServers() {
    return Array.from(this.clients.keys());
  }

  getServerTools(serverName) {
    return Array.from(this.tools.entries())
      .filter(([_, toolInfo]) => toolInfo.serverName === serverName)
      .map(([toolName]) => toolName);
  }

  getServerInfo() {
    const info = {};
    for (const [name] of this.clients) {
      const tools = Array.from(this.tools.entries())
        .filter(([_, toolInfo]) => toolInfo.serverName === name)
        .map(([toolName]) => toolName);

      const resources = Array.from(this.resources.entries())
        .filter(([_, resourceInfo]) => resourceInfo.serverName === name)
        .map(([uri]) => uri);

      info[name] = { tools, resources };
    }
    return info;
  }

  async close() {
    for (const [name, client] of this.clients) {
      try {
        await client.close();
        console.log(`Closed connection to ${name}`);
      } catch (error) {
        console.error(`Error closing ${name}:`, error);
      }
    }
  }
}
