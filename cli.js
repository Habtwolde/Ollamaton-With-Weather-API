#!/usr/bin/env node
/* ===========================================================================
 * Universal Ollama + MCP CLI
 * ========================================================================== */

import { ConfigManager }   from './config.js';
import { MCPManager }      from './mcp_client.js';
import { OllamaWithMCP }   from './ollama_integration.js';
import readline            from 'readline';

/*─────────────────────────────────────────────────────────────────────────────
 * Helper: "server.tool" → {serverId, toolName}
 *───────────────────────────────────────────────────────────────────────────*/
function parseQualifiedTool(input) {
  const parts = input.split('.');
  if (parts.length !== 2) {
    throw new Error('Use server.tool format, e.g., pg_log.log_chat');
  }
  return { serverId: parts[0], toolName: parts[1] };
}

/*─────────────────────────────────────────────────────────────────────────────
 * Helper: robust tool invocation (works with all MCP SDK versions)
 *───────────────────────────────────────────────────────────────────────────*/
async function callToolSmart(mcpManager, serverId, toolName, args) {
  /* 0️⃣  NEW — **always** try the wrapped call first (modern SDK shape) */
  if (mcpManager?.callTool) {
    try {
      return await mcpManager.callTool({
        name: `${serverId}.${toolName}`,
        arguments: args
      });
    } catch { /* ignore and fall through */ }
  }

  /* 1️⃣  Legacy 3-arg signature: (serverId, toolName, args) */
  if (mcpManager?.callTool && mcpManager.callTool.length >= 3) {
    try {
      return await mcpManager.callTool(serverId, toolName, args);
    } catch { /* ignore */ }
  }

  /* 2️⃣  "server.tool" string (dot) */
  if (mcpManager?.callTool) {
    try {
      return await mcpManager.callTool(`${serverId}.${toolName}`, args);
    } catch { /* ignore */ }
  }

  /* 3️⃣  "server:tool" string (colon) */
  if (mcpManager?.callTool) {
    try {
      return await mcpManager.callTool(`${serverId}:${toolName}`, args);
    } catch { /* ignore */ }
  }

  /* 4️⃣  Bare tool name (last resort) */
  if (mcpManager?.callTool) {
    try {
      return await mcpManager.callTool(toolName, args);
    } catch { /* ignore */ }
  }

  /* 5️⃣  Directly poke the raw server/client object if exposed */
  const raw =
      mcpManager?.getServer?.(serverId) ||
      mcpManager?.getClient?.(serverId) ||
      mcpManager?.servers?.get?.(serverId) ||
      mcpManager?.servers?.[serverId];

  if (raw?.callTool) {
    return await raw.callTool(toolName, args);
  }
  if (raw?.request) {
    return await raw.request('tools/call', {
      name: toolName,
      arguments: args
    });
  }

  throw new Error(`Could not call tool; unsupported MCPManager/client shape for '${serverId}.${toolName}'`);
}

/*─────────────────────────────────────────────────────────────────────────────
 * CLI CLASS
 *───────────────────────────────────────────────────────────────────────────*/
class OllamaMCPCLI {
  constructor() {
    this.configManager = new ConfigManager();
    this.mcpManager    = null;
    this.ollamaClient  = null;
  }

  /* --------------------------------------------------------------------- */
  async run() {
    const args    = process.argv.slice(2);
    const command = args[0];

    switch (command) {
      case 'init':   await this.initConfig();                break;
      case 'config': await this.manageConfig(args.slice(1)); break;
      case 'test':   await this.testConnection();            break;
      case 'chat':   await this.startChat();                 break;
      case 'server': await this.startServer();               break;
      case 'gui':    await this.startGUI();                  break;
      case 'help':
      default:       this.showHelp();                        break;
    }
  }

  /* --------------------------------------------------------------------- */
  showHelp() {
    console.log(`
🤖  Universal Ollama MCP Client CLI

Usage: node cli.js <command> [options]

Commands
  init                    Create a default configuration file
  config <action>         Manage configuration
     • show               Show current configuration
     • set-ollama <host>  Change Ollama host (default: http://localhost:11434)
     • set-model <model>  Change default model (default: llama3:latest)
     • add-server <name>  Add a new MCP server interactively
     • remove-server <name>
     • edit-instructions  Edit system / follow-up prompts
  test                    Connect to all MCP servers & list tools
  chat                    Interactive chat REPL
  server                  Start HTTP API server
  gui                     Start web GUI
  help                    Show this help

Chat shortcuts
  tools                   List tools
  clear                   Clear conversation history
  exit                    Quit chat
  tool <server.tool> <jsonArgs>
                          Call a tool directly, e.g.
                          tool pg_log.log_chat {"user_text":"hi","assistant_text":"hello"}

Options
  --config=<path>         Use custom config file (defaults to ./mcp_config.json)
`);
  }

  /* --------------------------------------------------------------------- */
  async initConfig() {
    console.log('🚀  Initializing configuration …\n');

    const defaultConfig = this.configManager.createDefaultConfig();
    console.log('📋  Default config:\n', JSON.stringify(defaultConfig, null, 2));

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = q => new Promise(res => rl.question(q, res));

    try {
      const ok = (await ask('\n💾  Save to ./mcp_config.json? (y/N): ')).toLowerCase();
      if (ok === 'y' || ok === 'yes') {
        this.configManager.config = defaultConfig;
        await this.configManager.saveConfig('mcp_config.json');
        console.log('✅  Saved!');
      } else {
        console.log('ℹ️  Aborted.');
      }
    } finally {
      rl.close();
    }
  }

  /* --------------------------------------------------------------------- */
  async manageConfig(args) {
    const cfgPath = process.argv.find(a => a.startsWith('--config='))?.split('=')[1];
    await this.configManager.loadConfig(cfgPath);
    const action  = args[0];

    switch (action) {
      case 'show':
        this.configManager.printConfigInfo();
        break;

      case 'set-ollama':
        if (!args[1]) return console.log('❌  Provide host URL');
        this.configManager.updateOllamaConfig({ host: args[1] });
        await this.configManager.saveConfig();
        console.log(`✅  Ollama host set to ${args[1]}`);
        break;

      case 'set-model':
        if (!args[1]) return console.log('❌  Provide model name');
        this.configManager.updateOllamaConfig({ defaultModel: args[1] });
        await this.configManager.saveConfig();
        console.log(`✅  Default model set to ${args[1]}`);
        break;

      case 'add-server':
        await this.addServerInteractive(args[1]);
        break;

      case 'remove-server':
        if (!args[1]) return console.log('❌  Provide server name');
        this.configManager.removeMCPServer(args[1]);
        await this.configManager.saveConfig();
        console.log(`✅  Removed server ${args[1]}`);
        break;

      case 'edit-instructions':
        await this.editInstructions();
        break;

      default:
        console.log('❌  Unknown action. Use show / set-ollama / set-model / add-server / remove-server / edit-instructions');
    }
  }

  /* ----------------------  addServerInteractive  ----------------------- */
  async addServerInteractive(name) {
    if (!name) return console.log('❌  Provide server name');

    const rl  = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = q => new Promise(res => rl.question(q, res));

    try {
      console.log(`\n🔧  Adding MCP server: ${name}`);
      const command   = await ask('Command (e.g. node): ');
      const argsInput = await ask('Arguments (space-separated): ');
      const args      = argsInput.trim() ? argsInput.trim().split(/\s+/) : [];

      console.log('\n🌍  Environment variables (Enter on empty name to finish)');
      const env = {};
      while (true) {
        const key = await ask('Name: ');
        if (!key.trim()) break;
        env[key] = await ask(`Value for ${key}: `);
      }

      const cfg = { command, args, env };
      console.log('\n📋  Server config:\n', JSON.stringify(cfg, null, 2));

      const ok = (await ask('\n💾  Add this server? (y/N): ')).toLowerCase();
      if (ok === 'y' || ok === 'yes') {
        this.configManager.addMCPServer(name, cfg);
        await this.configManager.saveConfig();
        console.log('✅  Added.');
      } else {
        console.log('ℹ️  Not added.');
      }
    } finally { rl.close(); }
  }

  /* ----------------------  editInstructions  --------------------------- */
  async editInstructions() {
    const rl  = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = q => new Promise(res => rl.question(q, res));

    try {
      const instr = this.configManager.getInstructions();
      console.log('\n✏️  Current system prompt:\n', instr.system);
      const newSys = await ask('\nNew system prompt (Enter to keep): ');
      console.log('\n✏️  Current follow-up template:\n', instr.followUp);
      const newFU  = await ask('\nNew follow-up template (Enter to keep): ');

      const upd = {};
      if (newSys.trim()) upd.system   = newSys.trim();
      if (newFU.trim())  upd.followUp = newFU.trim();
      if (Object.keys(upd).length) {
        this.configManager.updateInstructions(upd);
        await this.configManager.saveConfig();
        console.log('✅  Updated.');
      } else {
        console.log('ℹ️  No changes.');
      }
    } finally { rl.close(); }
  }

  /* -----------------------  testConnection  ---------------------------- */
  async testConnection() {
    console.log('🔧  Testing MCP connections …\n');
    const cfgPath = process.argv.find(a => a.startsWith('--config='))?.split('=')[1];
    await this.configManager.loadConfig(cfgPath);
    this.configManager.printConfigInfo();

    this.mcpManager = new MCPManager(this.configManager);
    await this.mcpManager.initializeServers();

    const tools     = this.mcpManager.getAvailableTools();
    const resources = this.mcpManager.getAvailableResources();
    const servers   = this.mcpManager.getAllServers();

    console.log('\n📊  Connection summary:');
    console.log(`  Servers   : ${servers.length}`);
    console.log(`  Tools     : ${tools.length}`);
    console.log(`  Resources : ${resources.length}`);

    if (tools.length) {
      console.log('\n🔧  Tools:');
      tools.forEach(t => {
        const info = this.mcpManager.getToolInfo(t) || {};
        console.log(`    • ${t}: ${info.description || '—'}`);
      });
    }

    if (resources.length) {
      console.log('\n📁  Resources:');
      resources.forEach(r => console.log(`    • ${r}`));
    }

    await this.mcpManager.close();
  }

  /* -----------------------  forceLogChat  ------------------------------ */
  async forceLogChat(userText, assistantText) {
    if (!userText || !assistantText) return;
    try {
      await callToolSmart(
        this.mcpManager, 'pg_log', 'log_chat',
        { user_text: userText, assistant_text: assistantText }
      );
      console.log('🗄️   Chat logged to DB');
    } catch (e) {
      console.warn('⚠️   log_chat failed:', e.message || e);
    }
  }

  /* -------------------------  startChat  ------------------------------- */
  async startChat() {
    console.log('💬  Starting chat REPL …\n');
    const cfgPath = process.argv.find(a => a.startsWith('--config='))?.split('=')[1];
    await this.configManager.loadConfig(cfgPath);

    this.mcpManager   = new MCPManager(this.configManager);
    await this.mcpManager.initializeServers();
    this.ollamaClient = new OllamaWithMCP(this.mcpManager, this.configManager);

    const rl  = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = q => new Promise(res => rl.question(q, res));
    console.log('💡  Type "exit" to quit, "tools" to list, or use "tool <server.tool> <jsonArgs>"');

    while (true) {
      const line = await ask('\n> ');
      if (line.toLowerCase() === 'exit') break;
      if (line.toLowerCase() === 'tools') {
        console.log('Tools:', this.mcpManager.getAvailableTools());
        continue;
      }
      if (line.toLowerCase() === 'clear') {
        this.ollamaClient.clearConversationHistory();
        console.log('🧹  History cleared');
        continue;
      }

      /* direct tool call */
      if (line.startsWith('tool ')) {
        const rest   = line.slice(5).trim();
        const sp     = rest.indexOf(' ');
        const qname  = sp === -1 ? rest : rest.slice(0, sp);
        const argStr = sp === -1 ? '{}' : rest.slice(sp + 1);
        try {
          const { serverId, toolName } = parseQualifiedTool(qname);
          const argObj = JSON.parse(argStr || '{}');
          const res = await callToolSmart(this.mcpManager, serverId, toolName, argObj);
          console.log('✅  Tool result:', res);
        } catch (e) {
          console.error('❌  Tool call failed:', e.message || e);
        }
        continue;
      }

      /* normal chat */
      try {
        console.log('🤖  Thinking …');
        const out = await this.ollamaClient.chat(line);
        const text = out.finalResponse ?? out.response ?? '';
        if (out.error) {
          console.error('❌  Error:', out.error);
        } else if (out.toolUsed) {
          console.log(`🔧  Tool used: ${out.toolUsed}\n${out.finalResponse}`);
        } else {
          console.log('💭  ', text);
        }
        await this.forceLogChat(line, text);
      } catch (err) {
        console.error('❌  Chat error:', err.message || err);
      }
    }

    rl.close();
    await this.mcpManager.close();
  }

  /* --------------------------  startServer  ---------------------------- */
  async startServer() {
    console.log('🌐  Starting HTTP API …');
    const cfgPath = process.argv.find(a => a.startsWith('--config='))?.split('=')[1];
    await this.configManager.loadConfig(cfgPath);
    const { default: main } = await import('./main_index.js');
    await main();               // your existing file
  }

  /* ---------------------------  startGUI  ------------------------------ */
  async startGUI() {
    console.log('🖥️   Starting web GUI …');
    const cfgPath = process.argv.find(a => a.startsWith('--config='))?.split('=')[1];
    process.argv.push(`--config=${cfgPath || ''}`);
    await import('./web_gui.js');
  }
}

/*───────────────────────────────────────────────────────────────────────────*/
const cli = new OllamaMCPCLI();
cli.run().catch(err => {
  console.error('CLI Error:', err.message || err);
  process.exit(1);
});
