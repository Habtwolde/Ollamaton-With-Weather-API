#!/usr/bin/env node

import { ConfigManager } from './config.js';
import { MCPManager } from './mcp_client.js';
import { OllamaWithMCP } from './ollama_integration.js';
import readline from 'readline';

class OllamaMCPCLI {
  constructor() {
    this.configManager = new ConfigManager();
    this.mcpManager = null;
    this.ollamaClient = null;
  }

  async run() {
    const args = process.argv.slice(2);
    const command = args[0];

    switch (command) {
      case 'init':
        await this.initConfig();
        break;
      case 'config':
        await this.manageConfig(args.slice(1));
        break;
      case 'test':
        await this.testConnection();
        break;
      case 'chat':
        await this.startChat();
        break;
      case 'server':
        await this.startServer();
        break;
      case 'gui':
        await this.startGUI();
        break;
      case 'help':
      default:
        this.showHelp();
        break;
    }
  }

  showHelp() {
    console.log(`
🤖 Universal Ollama MCP Client CLI

Usage: node cli.js <command> [options]

Commands:
  init                    Create a default configuration file
  config <action>         Manage configuration
    - show                Show current configuration
    - set-ollama <host>   Set Ollama host (default: http://localhost:11434)
    - set-model <model>   Set default model (default: llama3.2)
    - add-server <name>   Add MCP server interactively
    - remove-server <name> Remove MCP server
    - edit-instructions   Edit system instructions
  test                    Test MCP connections and list available tools
  chat                    Start interactive chat mode
  server                  Start HTTP API server
  gui                     Start web GUI
  help                    Show this help message

Options:
  --config=<path>         Use specific config file

Examples:
  node cli.js init
  node cli.js config show
  node cli.js config add-server filesystem
  node cli.js test --config=./my-config.json
  node cli.js chat
  node cli.js server
  node cli.js gui
`);
  }

  async initConfig() {
    console.log('🚀 Initializing Universal Ollama MCP Client configuration...\n');

    const defaultConfig = this.configManager.createDefaultConfig();

    console.log('📋 Default configuration:');
    console.log(JSON.stringify(defaultConfig, null, 2));

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

    try {
      const confirm = await question('\n💾 Save this configuration to ./mcp_config.json? (y/N): ');

      if (confirm.toLowerCase() === 'y' || confirm.toLowerCase() === 'yes') {
        this.configManager.config = defaultConfig;
        await this.configManager.saveConfig('mcp_config.json');
        console.log('\n✅ Configuration saved!');
        console.log('💡 Edit the file to add your MCP servers and customize settings.');
        console.log('📖 Run "node cli.js config show" to view current configuration.');
      } else {
        console.log('\n❌ Configuration not saved.');
      }
    } finally {
      rl.close();
    }
  }

  async manageConfig(args) {
    const configPath = process.argv.find(arg => arg.startsWith('--config='))?.split('=')[1];
    await this.configManager.loadConfig(configPath);

    const action = args[0];

    switch (action) {
      case 'show':
        this.configManager.printConfigInfo();
        break;

      case 'set-ollama':
        if (!args[1]) {
          console.log('❌ Please provide Ollama host URL');
          return;
        }
        this.configManager.updateOllamaConfig({ host: args[1] });
        await this.configManager.saveConfig();
        console.log(`✅ Ollama host set to: ${args[1]}`);
        break;

      case 'set-model':
        if (!args[1]) {
          console.log('❌ Please provide model name');
          return;
        }
        this.configManager.updateOllamaConfig({ defaultModel: args[1] });
        await this.configManager.saveConfig();
        console.log(`✅ Default model set to: ${args[1]}`);
        break;

      case 'add-server':
        await this.addServerInteractive(args[1]);
        break;

      case 'remove-server':
        if (!args[1]) {
          console.log('❌ Please provide server name');
          return;
        }
        this.configManager.removeMCPServer(args[1]);
        await this.configManager.saveConfig();
        console.log(`✅ Server '${args[1]}' removed`);
        break;

      case 'edit-instructions':
        await this.editInstructions();
        break;

      default:
        console.log('❌ Unknown config action. Use: show, set-ollama, set-model, add-server, remove-server, edit-instructions');
        break;
    }
  }

  async addServerInteractive(serverName) {
    if (!serverName) {
      console.log('❌ Please provide server name');
      return;
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

    try {
      console.log(`\n🔧 Adding MCP server: ${serverName}`);

      const command = await question('Command (e.g., npx, node): ');
      const argsInput = await question('Arguments (space-separated): ');
      const args = argsInput.trim() ? argsInput.split(' ') : [];

      console.log('\n🌍 Environment variables (press Enter with empty name to finish):');
      const env = {};

      while (true) {
        const envName = await question('Environment variable name: ');
        if (!envName.trim()) break;

        const envValue = await question(`Value for ${envName}: `);
        env[envName] = envValue;
      }

      const serverConfig = {
        command,
        args,
        env
      };

      console.log('\n📋 Server configuration:');
      console.log(JSON.stringify(serverConfig, null, 2));

      const confirm = await question('\n💾 Add this server? (y/N): ');

      if (confirm.toLowerCase() === 'y' || confirm.toLowerCase() === 'yes') {
        this.configManager.addMCPServer(serverName, serverConfig);
        await this.configManager.saveConfig();
        console.log(`✅ Server '${serverName}' added successfully!`);
      } else {
        console.log('❌ Server not added.');
      }
    } finally {
      rl.close();
    }
  }

  async editInstructions() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

    try {
      const instructions = this.configManager.getInstructions();

      console.log('\n📝 Current system instructions:');
      console.log(instructions.system);

      const newSystem = await question('\n✏️  Enter new system instructions (or press Enter to keep current): ');

      console.log('\n📝 Current follow-up template:');
      console.log(instructions.followUp);

      const newFollowUp = await question('\n✏️  Enter new follow-up template (or press Enter to keep current): ');

      const updates = {};
      if (newSystem.trim()) updates.system = newSystem.trim();
      if (newFollowUp.trim()) updates.followUp = newFollowUp.trim();

      if (Object.keys(updates).length > 0) {
        this.configManager.updateInstructions(updates);
        await this.configManager.saveConfig();
        console.log('✅ Instructions updated successfully!');
      } else {
        console.log('ℹ️  No changes made.');
      }
    } finally {
      rl.close();
    }
  }

  async testConnection() {
    console.log('🔧 Testing MCP connections...\n');

    const configPath = process.argv.find(arg => arg.startsWith('--config='))?.split('=')[1];
    await this.configManager.loadConfig(configPath);
    this.configManager.printConfigInfo();

    this.mcpManager = new MCPManager(this.configManager);
    await this.mcpManager.initializeServers();

    const tools = this.mcpManager.getAvailableTools();
    const resources = this.mcpManager.getAvailableResources();
    const servers = this.mcpManager.getAllServers();

    console.log('\n📊 Connection Summary:');
    console.log(`Connected servers: ${servers.length}`);
    console.log(`Available tools: ${tools.length}`);
    console.log(`Available resources: ${resources.length}`);

    if (tools.length > 0) {
      console.log('\n🔧 Available Tools:');
      tools.forEach(tool => {
        const info = this.mcpManager.getToolInfo(tool);
        console.log(`  - ${tool}: ${info?.description || 'No description'}`);
      });
    }

    if (resources.length > 0) {
      console.log('\n📁 Available Resources:');
      resources.forEach(resource => {
        console.log(`  - ${resource}`);
      });
    }

    await this.mcpManager.close();
  }

  // === NEW HELPER ===
  async forceLogChat(userText, assistantText) {
    if (!userText || !assistantText) return;
    try {
      if (this.mcpManager?.callTool) {
        await this.mcpManager.callTool('pg_log', 'log_chat', {
          user_text: userText,
          assistant_text: assistantText
        });
        console.log(`🗄️  DB log via MCP: OK`);
        return;
      }
      const pgLogClient =
        this.mcpManager?.getServer?.('pg_log') ||
        this.mcpManager?.getClient?.('pg_log') ||
        this.mcpManager?.servers?.get?.('pg_log') ||
        this.mcpManager?.servers?.['pg_log'];

      if (pgLogClient?.callTool) {
        await pgLogClient.callTool('log_chat', {
          user_text: userText,
          assistant_text: assistantText
        });
        console.log(`🗄️  DB log via MCP: OK`);
        return;
      }
      if (pgLogClient?.request) {
        await pgLogClient.request('tools/call', {
          name: 'log_chat',
          arguments: { user_text: userText, assistant_text: assistantText }
        });
        console.log(`🗄️  DB log via MCP: OK`);
        return;
      }
      console.warn('⚠️  pg_log MCP client not found or unsupported interface.');
    } catch (err) {
      console.warn('⚠️  log_chat failed:', err?.message || err);
    }
  }

  async startChat() {
    console.log('💬 Starting interactive chat mode...\n');

    const configPath = process.argv.find(arg => arg.startsWith('--config='))?.split('=')[1];
    await this.configManager.loadConfig(configPath);

    this.mcpManager = new MCPManager(this.configManager);
    await this.mcpManager.initializeServers();

    this.ollamaClient = new OllamaWithMCP(this.mcpManager, this.configManager);

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

    console.log('💡 Type "exit" to quit, "tools" to list tools, "clear" to clear history');

    while (true) {
      try {
        const input = await question('\n> ');

        if (input.toLowerCase() === 'exit') break;

        if (input.toLowerCase() === 'tools') {
          console.log('Available tools:', this.mcpManager.getAvailableTools());
          continue;
        }

        if (input.toLowerCase() === 'clear') {
          this.ollamaClient.clearConversationHistory();
          console.log('🧹 Conversation history cleared');
          continue;
        }

        console.log('🤖 Thinking...');
        const result = await this.ollamaClient.chat(input);

        const assistantText = result?.finalResponse ?? result?.response ?? '';

        if (result.toolUsed) {
          console.log(`🔧 Tool used: ${result.toolUsed}`);
          console.log('📊 Final response:', result.finalResponse);
        } else if (result.error) {
          console.log('❌ Error:', result.error);
        } else {
          console.log('💭 Response:', result.response);
        }

        // NEW: always log to DB
        await this.forceLogChat(input, assistantText);

      } catch (error) {
        console.error('Error:', error.message);
      }
    }

    rl.close();
    await this.mcpManager.close();
  }

  async startServer() {
    console.log('🌐 Starting HTTP API server...\n');

    const configPath = process.argv.find(arg => arg.startsWith('--config='))?.split('=')[1];
    await this.configManager.loadConfig(configPath);

    const { default: main } = await import('./main_index.js');
  }

  async startGUI() {
    console.log('🖥️  Starting Web GUI...\n');

    const configPath = process.argv.find(arg => arg.startsWith('--config='))?.split('=')[1];
    process.argv.push(`--config=${configPath || ''}`);

    await import('./web_gui.js');
  }
}

const cli = new OllamaMCPCLI();
cli.run().catch(error => {
  console.error('CLI Error:', error.message);
  process.exit(1);
});
