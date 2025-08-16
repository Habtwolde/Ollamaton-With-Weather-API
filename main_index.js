import { MCPManager } from './mcp_client.js';
import { OllamaWithMCP } from './ollama_integration.js';
import { ConfigManager } from './config.js';
import express from 'express';

async function main() {
  console.log('🚀 Starting Universal Ollama MCP Client...');
  
  // Initialize configuration
  const configManager = new ConfigManager();
  const configPath = process.argv.find(arg => arg.startsWith('--config='))?.split('=')[1];
  await configManager.loadConfig(configPath);
  configManager.printConfigInfo();
  
  // Initialize MCP Manager
  const mcpManager = new MCPManager(configManager);
  await mcpManager.initializeServers();
  
  // Initialize Ollama integration
  const ollamaClient = new OllamaWithMCP(mcpManager, configManager);
  
  // Test the integration
  console.log('\n📋 Available tools:', mcpManager.getAvailableTools());
  
  // Start Express server for API
  const app = express();
  app.use(express.json());
  
  // Chat endpoint
  app.post('/chat', async (req, res) => {
    try {
      const { message, model = 'llama3.2' } = req.body;
      const result = await ollamaClient.chat(message, model);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // List tools endpoint
  app.get('/tools', (req, res) => {
    const tools = mcpManager.getAvailableTools().map(name => ({
      name,
      info: mcpManager.getToolInfo(name)
    }));
    res.json({ tools });
  });
  
  // Test tool endpoint
  app.post('/test-tool', async (req, res) => {
    try {
      const { tool, args = {} } = req.body;
      const result = await mcpManager.callTool(tool, args);
      res.json({ result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🌐 Server running on http://localhost:${PORT}`);
    console.log('\n📚 Available endpoints:');
    console.log('  POST /chat - Chat with Ollama + MCP tools');
    console.log('  GET /tools - List available tools');
    console.log('  POST /test-tool - Test a specific tool');
  });
  
  // Interactive CLI mode
  if (process.argv.includes('--interactive')) {
    await runInteractiveMode(ollamaClient, mcpManager);
  }
  
  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down...');
    await mcpManager.close();
    process.exit(0);
  });
}

async function runInteractiveMode(ollamaClient, mcpManager) {
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  console.log('\n💬 Interactive mode started. Type "exit" to quit, "tools" to list tools.');
  
  const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));
  
  while (true) {
    try {
      const input = await question('\n> ');
      
      if (input.toLowerCase() === 'exit') break;
      
      if (input.toLowerCase() === 'tools') {
        console.log('Available tools:', mcpManager.getAvailableTools());
        continue;
      }
      
      console.log('🤖 Thinking...');
      const result = await ollamaClient.chat(input);
      
      if (result.toolUsed) {
        console.log(`🔧 Tool used: ${result.toolUsed}`);
        console.log('📊 Final response:', result.finalResponse);
      } else if (result.error) {
        console.log('❌ Error:', result.error);
      } else {
        console.log('💭 Response:', result.response);
      }
    } catch (error) {
      console.error('Error:', error.message);
    }
  }
  
  rl.close();
}

// Start the application
main().catch(error => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
