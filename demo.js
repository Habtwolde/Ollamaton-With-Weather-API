import { MCPManager } from './mcp_client.js';
import { OllamaWithMCP } from './ollama_integration.js';

async function demo() {
  console.log('🚀 Ollama MCP Client Demo\n');
  
  try {
    // Initialize
    const mcpManager = new MCPManager();
    await mcpManager.initializeServers();
    
    const ollamaClient = new OllamaWithMCP(mcpManager);
    
    console.log('✅ System initialized successfully!');
    console.log(`📋 Available tools: ${mcpManager.getAvailableTools().length}\n`);
    
    // Test queries
    const testQueries = [
      "Show me all practitioners",
      "List the database tables",
      "Search for patients named John"
    ];
    
    for (const query of testQueries) {
      console.log(`🔍 Query: "${query}"`);
      console.log('🤔 Processing...\n');
      
      const result = await ollamaClient.chat(query);
      
      if (result.toolUsed) {
        console.log(`🔧 Tool used: ${result.toolUsed}`);
        console.log(`📊 Tool result: ${JSON.stringify(result.toolResult, null, 2)}`);
        console.log(`🤖 AI Response: ${result.finalResponse}\n`);
      } else if (result.error) {
        console.log(`❌ Error: ${result.error}\n`);
      } else {
        console.log(`🤖 AI Response: ${result.response}\n`);
      }
      
      console.log('─'.repeat(80) + '\n');
    }
    
    await mcpManager.close();
    console.log('✨ Demo completed!');
    
  } catch (error) {
    console.error('❌ Demo failed:', error.message);
  }
}

demo();
