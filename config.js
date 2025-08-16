import fs from 'fs';
import path from 'path';
import os from 'os';

export class ConfigManager {
  constructor() {
    this.configPath = null;
    this.config = {
      mcpServers: {},
      ollama: {
        host: 'http://localhost:11434',
        defaultModel: 'llama3.2'
      },
      instructions: {
        system: 'You are a helpful AI assistant with access to various tools through MCP (Model Context Protocol) servers.',
        followUp: 'Tool result: {TOOL_RESULT}\n\nPlease provide a helpful summary of this information using proper markdown formatting.'
      }
    };
  }

  async loadConfig(configPath = null) {
    let sourceConfigPath = null;
    let isClaudeConfig = false;
    
    // Try to find config file
    if (configPath) {
      sourceConfigPath = path.resolve(configPath);
    } else {
      // Try our own config first, then Claude configs
      const possiblePaths = [
        './mcp_config.json',
        path.join(os.homedir(), '.config', 'claude', 'claude_desktop_config.json'),
        path.join(os.homedir(), 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json'), // Windows
        path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'), // macOS
      ];

      for (const possiblePath of possiblePaths) {
        if (fs.existsSync(possiblePath)) {
          sourceConfigPath = possiblePath;
          isClaudeConfig = possiblePath.includes('claude_desktop_config.json');
          break;
        }
      }
    }

    // Always use our own config file for saving (absolute path to avoid directory issues)
    this.configPath = path.resolve('mcp_config.json');

    if (sourceConfigPath && fs.existsSync(sourceConfigPath)) {
      try {
        const configData = JSON.parse(fs.readFileSync(sourceConfigPath, 'utf8'));
        
        // If it's a Claude Desktop config, only extract MCP servers (read-only)
        if (isClaudeConfig || sourceConfigPath.includes('claude_desktop_config.json')) {
          if (configData.mcpServers) {
            this.config.mcpServers = configData.mcpServers;
          } else if (configData.mcp && configData.mcp.servers) {
            this.config.mcpServers = configData.mcp.servers;
          }
          
          console.log(`✅ Loaded MCP servers from Claude config: ${sourceConfigPath}`);
          console.log(`📋 Found ${Object.keys(this.config.mcpServers).length} MCP servers`);
          console.log(`💾 Will save settings to: ${this.configPath}`);
          
          // Create our own config file with the imported MCP servers
          await this.saveConfig();
          return true;
        } else {
          // It's our own config file, load everything
          console.log(`📂 Loading config from file: ${sourceConfigPath}`);
          console.log(`📍 Resolved path: ${path.resolve(sourceConfigPath)}`);
          
          if (configData.mcpServers) {
            this.config.mcpServers = configData.mcpServers;
            console.log(`🔧 Loaded ${Object.keys(configData.mcpServers).length} MCP servers from config`);
          }
          if (configData.ollama) {
            this.config.ollama = { ...this.config.ollama, ...configData.ollama };
            console.log(`🦙 Loaded Ollama config: host=${configData.ollama.host}, model=${configData.ollama.defaultModel}`);
          }
          if (configData.instructions) {
            this.config.instructions = { ...this.config.instructions, ...configData.instructions };
            console.log(`📝 Loaded custom instructions (system: ${configData.instructions.system?.length || 0} chars)`);
          }

          console.log(`✅ Successfully loaded config from: ${sourceConfigPath}`);
          console.log(`💾 Config will be saved to: ${this.configPath}`);
          return true;
        }
      } catch (error) {
        console.error(`❌ Error loading config from ${sourceConfigPath}:`, error.message);
        return false;
      }
    }

    console.log('⚠️  No config file found. Creating default configuration.');
    console.log(`💾 Will save settings to: ${this.configPath}`);
    await this.saveConfig();
    return false;
  }

  async saveConfig(configPath = null) {
    const savePath = configPath || this.configPath || path.resolve('mcp_config.json');
    
    try {
      fs.writeFileSync(savePath, JSON.stringify(this.config, null, 2));
      this.configPath = savePath;
      console.log(`✅ Config saved to: ${savePath}`);
      return true;
    } catch (error) {
      console.error(`❌ Error saving config to ${savePath}:`, error.message);
      return false;
    }
  }

  createDefaultConfig() {
    return {
      mcpServers: {},
      ollama: {
        host: 'http://localhost:11434',
        defaultModel: 'llama3.2'
      },
      instructions: {
        system: 'You are a helpful AI assistant with access to various tools through MCP (Model Context Protocol) servers.',
        followUp: 'Tool result: {TOOL_RESULT}\n\nPlease provide a helpful summary of this information using proper markdown formatting.'
      }
    };
  }

  getMCPServers() {
    return this.config.mcpServers;
  }

  getOllamaConfig() {
    return this.config.ollama;
  }

  getInstructions() {
    return this.config.instructions;
  }

  updateInstructions(newInstructions) {
    this.config.instructions = { ...this.config.instructions, ...newInstructions };
  }

  addMCPServer(name, serverConfig) {
    this.config.mcpServers[name] = serverConfig;
  }

  removeMCPServer(name) {
    delete this.config.mcpServers[name];
  }

  updateOllamaConfig(newConfig) {
    this.config.ollama = { ...this.config.ollama, ...newConfig };
  }

  getConfigPath() {
    return this.configPath;
  }

  printConfigInfo() {
    console.log('\n📋 Current Configuration:');
    console.log(`Config file: ${this.configPath || 'Not saved'}`);
    console.log(`MCP Servers: ${Object.keys(this.config.mcpServers).length}`);
    console.log(`Ollama host: ${this.config.ollama.host}`);
    console.log(`Default model: ${this.config.ollama.defaultModel}`);
    
    if (Object.keys(this.config.mcpServers).length > 0) {
      console.log('\n🔧 MCP Servers:');
      for (const [name, config] of Object.entries(this.config.mcpServers)) {
        console.log(`  - ${name}: ${config.command} ${config.args?.join(' ') || ''}`);
      }
    }
  }
}
