import express from 'express';
import { MCPManager } from './mcp_client.js';
import { OllamaWithMCP } from './ollama_integration.js';
import { ConfigManager } from './config.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class OllamaMCPWebGUI {
  constructor() {
    this.app = express();
    this.configManager = null;
    this.mcpManager = null;
    this.ollamaClient = null;
    this.port = 3000;
  }

  async initialize() {
    console.log('🚀 Initializing Ollamaton Web GUI...\n');
    
    try {
      // Initialize configuration
      this.configManager = new ConfigManager();
      const configPath = process.argv.find(arg => arg.startsWith('--config='))?.split('=')[1];
      await this.configManager.loadConfig(configPath);
      this.configManager.printConfigInfo();
      
      // Initialize MCP
      this.mcpManager = new MCPManager(this.configManager);
      await this.mcpManager.initializeServers();
      
      this.ollamaClient = new OllamaWithMCP(this.mcpManager, this.configManager);
      
      console.log('✅ MCP System ready!');
      console.log(`📋 Available tools: ${this.mcpManager.getAvailableTools().length}`);
      
      // Setup Express
      this.setupExpress();
      
    } catch (error) {
      console.error('❌ Initialization failed:', error.message);
      process.exit(1);
    }
  }

  setupExpress() {
    this.app.use(express.json());
    this.app.use(express.static('.'));
    
    // API Routes
    this.app.get('/api/status', (req, res) => {
      res.json({
        status: 'ready',
        tools: this.mcpManager.getAvailableTools().length,
        availableTools: this.mcpManager.getAvailableTools()
      });
    });

    this.app.post('/api/chat', async (req, res) => {
      try {
        const { message } = req.body;
        
        if (!message) {
          return res.status(400).json({ error: 'Message is required' });
        }
        
        const result = await this.ollamaClient.chat(message);
        res.json(result);
        
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/tool', async (req, res) => {
      try {
        const { toolName, args } = req.body;
        
        if (!toolName) {
          return res.status(400).json({ error: 'Tool name is required' });
        }
        
        const result = await this.mcpManager.callTool(toolName, args || {});
        res.json({ result });
        
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/tools', (req, res) => {
      const tools = this.mcpManager.getAvailableTools();
      const toolsWithInfo = tools.map(toolName => ({
        name: toolName,
        info: this.mcpManager.getToolInfo(toolName)
      }));
      
      res.json(toolsWithInfo);
    });

    this.app.get('/api/tools-grouped', (req, res) => {
      const toolsByServer = {};
      const servers = this.mcpManager.getConnectedServers();
      
      servers.forEach(serverName => {
        const serverTools = this.mcpManager.getServerTools(serverName);
        toolsByServer[serverName] = serverTools.map(toolName => ({
          name: toolName,
          info: this.mcpManager.getToolInfo(toolName)
        }));
      });
      
      res.json(toolsByServer);
    });

    this.app.get('/api/models', async (req, res) => {
      try {
        const models = await this.ollamaClient.listModels();
        res.json(models);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/config', (req, res) => {
      const config = {
        ollama: this.configManager.getOllamaConfig(),
        configPath: this.configManager.getConfigPath(),
        mcpServers: Object.keys(this.configManager.getMCPServers()),
        instructions: this.configManager.getInstructions()
      };
      res.json(config);
    });

    this.app.post('/api/config', async (req, res) => {
      try {
        const { ollama, configPath, instructions } = req.body;
        
        // IMPORTANT: Handle config path changes FIRST, before applying other updates
        // This prevents the race condition where loadConfig() overwrites in-memory changes
        if (configPath) {
          await this.configManager.loadConfig(configPath);
          // Reinitialize MCP servers with new config
          await this.mcpManager.close();
          this.mcpManager = new MCPManager(this.configManager);
          await this.mcpManager.initializeServers();
          this.ollamaClient.mcp = this.mcpManager;
        }
        
        // Now apply the updates AFTER any config loading
        if (ollama) {
          this.configManager.updateOllamaConfig(ollama);
          // Update the ollama client with new config
          const newOllamaConfig = this.configManager.getOllamaConfig();
          
          // Properly update the Ollama client configuration
          if (this.ollamaClient.ollama) {
            this.ollamaClient.ollama.host = newOllamaConfig.host;
          }
          this.ollamaClient.defaultModel = newOllamaConfig.defaultModel;
          
          // Also update the internal host property if it exists
          if (this.ollamaClient.host) {
            this.ollamaClient.host = newOllamaConfig.host;
          }
          
          console.log(`🔄 Updated Ollama client: host=${newOllamaConfig.host}, model=${newOllamaConfig.defaultModel}`);
        }
        
        if (instructions) {
          this.configManager.updateInstructions(instructions);
        }
        
        await this.configManager.saveConfig();
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/clear-history', (req, res) => {
      try {
        this.ollamaClient.clearConversationHistory();
        res.json({ success: true, message: 'Conversation history cleared' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Serve the main HTML page
    this.app.get('/', (req, res) => {
      res.send(this.getHTMLPage());
    });
  }

  getHTMLPage() {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ollamaton - Ollama MCP Client</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    animation: {
                        'spin-slow': 'spin 3s linear infinite',
                    }
                }
            }
        }
    </script>
</head>
<body class="bg-gradient-to-br from-violet-500 via-purple-500 to-pink-500 min-h-screen p-5">
    <div class="max-w-7xl mx-auto bg-white rounded-2xl shadow-2xl overflow-hidden h-[calc(100vh-2.5rem)] flex flex-col">
        <!-- Header -->
        <div class="bg-gradient-to-r from-purple-500 to-fuchsia-400 text-white p-4 lg:p-6">
            <h1 class="text-2xl lg:text-3xl font-bold text-center mb-3">Ollamaton - Ollama MCP Client</h1>
            <div class="flex flex-wrap justify-center items-center gap-2 lg:gap-6 mt-3">
                <div class="bg-white/20 px-3 lg:px-4 py-2 rounded-full text-xs lg:text-sm" id="status">🔄 Loading...</div>
                <div class="bg-white/20 px-3 lg:px-4 py-2 rounded-full text-xs lg:text-sm" id="tools-count">📋 Tools: 0</div>
                <div class="bg-white/20 px-3 lg:px-4 py-2 rounded-full text-xs lg:text-sm" id="current-model">🦙 Loading...</div>
                <button class="bg-white/20 hover:bg-white/30 text-white px-3 py-2 rounded-full text-xs lg:text-sm transition-all duration-300" onclick="openSettings()">
                    ⚙️ Settings
                </button>
            </div>
        </div>
        
        <!-- Main Content -->
        <div class="flex flex-1 overflow-hidden relative">
            <!-- Mobile Menu Button -->
            <button id="mobile-menu-btn" class="lg:hidden fixed top-4 left-4 z-50 bg-purple-500 hover:bg-purple-600 text-white p-3 rounded-full shadow-lg transition-all duration-200">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
                </svg>
            </button>
            
            <!-- Sidebar -->
            <div id="sidebar" class="w-80 lg:w-80 bg-gray-50 border-r border-gray-200 p-5 overflow-y-auto transform -translate-x-full lg:translate-x-0 transition-transform duration-300 ease-in-out fixed lg:relative z-40 h-full lg:h-auto">
                <div class="flex justify-between items-center mb-4 lg:block">
                    <h3 class="text-lg font-semibold text-gray-800">🔧 Available Tools</h3>
                    <button id="close-sidebar" class="lg:hidden text-gray-500 hover:text-gray-700 p-2">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>
                <div id="tools-list" class="space-y-2">
                    <div class="text-gray-500">Loading tools...</div>
                </div>
            </div>
            
            <!-- Sidebar Overlay for Mobile -->
            <div id="sidebar-overlay" class="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-30 hidden"></div>
            
            <!-- Chat Area -->
            <div class="flex-1 flex flex-col lg:ml-0">
                <!-- Messages -->
                <div class="flex-1 p-5 overflow-y-auto bg-gray-50" id="messages">
                    <div class="mb-5 p-4 bg-white border border-gray-200 rounded-xl max-w-4xl">
                        <div class="font-semibold text-gray-800 mb-2">🤖 Assistant:</div>
                        <div class="text-gray-700 leading-relaxed">
                            Hello! I'm your AI assistant with access to various tools through MCP (Model Context Protocol) servers. 
                            I can help you with file operations, web searches, database queries, and any other tools you have configured.
                            <br><br>
                            Try asking me to use one of the available tools from the sidebar, or just ask me a question!
                        </div>
                    </div>
                </div>
                
                <!-- Loading -->
                <div class="hidden text-center p-5 text-gray-600" id="loading">
                    <div class="inline-flex items-center gap-2">
                        <div class="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                        🤔 Thinking...
                    </div>
                </div>
                
                <!-- Input Area -->
                <div class="p-3 lg:p-5 bg-white border-t border-gray-200">
                    <div class="flex gap-2 lg:gap-3">
                        <input type="text" id="message-input" 
                               class="flex-1 px-3 lg:px-4 py-2 lg:py-3 border border-gray-300 rounded-full text-sm lg:text-base outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all duration-200" 
                               placeholder="Type your message here..." />
                        <button class="px-4 lg:px-6 py-2 lg:py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-full font-medium text-sm lg:text-base transition-all duration-200 transform hover:scale-105" 
                                onclick="sendMessage()">Send</button>
                        <button class="px-4 lg:px-6 py-2 lg:py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-full font-medium text-sm lg:text-base transition-all duration-200" 
                                onclick="clearChat()">Clear</button>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Settings Modal -->
    <div id="settingsModal" class="fixed inset-0 bg-black/50 z-50 hidden">
        <div class="flex items-center justify-center min-h-screen p-4">
            <div class="bg-white rounded-2xl p-8 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
                <div class="flex justify-between items-center mb-6 pb-4 border-b border-gray-200">
                    <h2 class="text-2xl font-bold text-gray-800">⚙️ Settings</h2>
                    <button class="text-gray-400 hover:text-gray-600 text-3xl font-bold leading-none" onclick="closeSettings()">×</button>
                </div>
                
                <form id="settingsForm">
                    <div class="space-y-6">
                        <div>
                            <label for="ollama-host" class="block text-sm font-semibold text-gray-700 mb-2">Ollama Host</label>
                            <input type="text" id="ollama-host" 
                                   class="w-full px-4 py-3 border border-gray-300 rounded-lg text-base outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200" 
                                   placeholder="http://localhost:11434">
                            <small class="block mt-2 text-gray-600">URL where your Ollama server is running e.g. http://localhost:11434</small>
                        </div>
                        
                        <div>
                            <label for="ollama-model" class="block text-sm font-semibold text-gray-700 mb-2">Default Model</label>
                            <div class="flex gap-2">
                                <select id="ollama-model" 
                                        class="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-base outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200">
                                    <option value="">Loading models...</option>
                                </select>
                                <button type="button" id="refresh-models-btn"
                                        class="px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-all duration-200 flex items-center gap-2"
                                        onclick="refreshModels()">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                                    </svg>
                                    Refresh
                                </button>
                            </div>
                            <small class="block mt-2 text-gray-600">Select the default Ollama model to use for conversations. Click refresh to reload models from the current host.</small>
                        </div>
                        
                        <div>
                            <label for="config-path" class="block text-sm font-semibold text-gray-700 mb-2">MCP Config Path</label>
                            <input type="text" id="config-path" 
                                   class="w-full px-4 py-3 border border-gray-300 rounded-lg text-base outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200" 
                                   placeholder="Path to config file">
                            <small class="block mt-2 text-gray-600">Path to your MCP configuration file (leave empty for auto-discovery)</small>
                        </div>
                        
                        <div>
                            <label for="system-instructions" class="block text-sm font-semibold text-gray-700 mb-2">System Instructions</label>
                            <textarea id="system-instructions" rows="4"
                                      class="w-full px-4 py-3 border border-gray-300 rounded-lg text-base outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200 resize-vertical" 
                                      placeholder="System instructions for the AI assistant..."></textarea>
                            <small class="block mt-2 text-gray-600">Instructions that define how the AI assistant should behave</small>
                        </div>
                        
                        <div>
                            <label for="followup-instructions" class="block text-sm font-semibold text-gray-700 mb-2">Follow-up Instructions</label>
                            <textarea id="followup-instructions" rows="3"
                                      class="w-full px-4 py-3 border border-gray-300 rounded-lg text-base outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200 resize-vertical" 
                                      placeholder="Instructions for processing tool results..."></textarea>
                            <small class="block mt-2 text-gray-600">Instructions for how to format and present tool results</small>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">Current MCP Servers</label>
                            <div id="mcp-servers-list" class="p-3 bg-gray-50 rounded-lg">
                                Loading...
                            </div>
                            <small class="block mt-2 text-gray-600">MCP servers currently configured and loaded</small>
                        </div>
                    </div>
                    
                    <div class="flex gap-3 justify-end mt-8 pt-6 border-t border-gray-200">
                        <button type="button" class="px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-medium transition-all duration-200" onclick="closeSettings()">Cancel</button>
                        <button type="submit" class="px-6 py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-medium transition-all duration-200">Save Settings</button>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <script src="marked.min.js"></script>
    <script>
        let isLoading = false;

        // Initialize the app
        async function init() {
            try {
                const response = await fetch('/api/status');
                const data = await response.json();
                
                document.getElementById('status').textContent = '✅ Ready';
                document.getElementById('tools-count').textContent = '📋 Tools: ' + data.tools;
                
                // Load current model name
                try {
                    const configResponse = await fetch('/api/config');
                    const config = await configResponse.json();
                    const modelName = config.ollama.defaultModel || 'No model set';
                    document.getElementById('current-model').textContent = '🦙 ' + modelName;
                } catch (error) {
                    console.error('Error loading model name:', error);
                    document.getElementById('current-model').textContent = '🦙 Error loading model';
                }
                
                loadTools();
            } catch (error) {
                document.getElementById('status').textContent = '❌ Error';
                console.error('Init error:', error);
            }
        }

        // Load available tools grouped by MCP server
        async function loadTools() {
            try {
                const response = await fetch('/api/tools-grouped');
                const toolsByServer = await response.json();
                
                const toolsList = document.getElementById('tools-list');
                toolsList.innerHTML = '';
                
                // Create collapsible sections for each MCP server
                Object.entries(toolsByServer).forEach(([serverName, tools]) => {
                    // Create server section container
                    const serverSection = document.createElement('div');
                    serverSection.className = 'mb-3 bg-white border border-gray-200 rounded-lg overflow-hidden';
                    
                    // Create server header (collapsible)
                    const serverHeader = document.createElement('div');
                    serverHeader.className = 'p-3 cursor-pointer select-none flex justify-between items-center bg-purple-50 border-b border-purple-100 hover:bg-purple-100 transition-colors duration-200';
                    serverHeader.innerHTML = 
                        '<span class="font-semibold text-purple-800">🔌 ' + serverName + ' (' + tools.length + ' tools)</span>' +
                        '<span class="expand-icon text-xs transition-transform duration-200 text-purple-600">▶</span>';
                    
                    // Create tools container (initially hidden)
                    const toolsContainer = document.createElement('div');
                    toolsContainer.className = 'hidden space-y-1 p-2';
                    
                    // Add tools to container
                    tools.forEach(tool => {
                        const toolItem = document.createElement('div');
                        toolItem.className = 'p-2 bg-gray-50 border border-gray-100 rounded cursor-pointer text-sm transition-all duration-200 hover:bg-purple-50 hover:border-purple-200';
                        toolItem.textContent = tool.name;
                        toolItem.title = tool.info?.description || 'No description available';
                        toolItem.onclick = () => insertToolCall(tool.name);
                        toolsContainer.appendChild(toolItem);
                    });
                    
                    // Add click handler for server header
                    serverHeader.onclick = function() {
                        const icon = serverHeader.querySelector('.expand-icon');
                        const isExpanded = !toolsContainer.classList.contains('hidden');
                        
                        if (isExpanded) {
                            toolsContainer.classList.add('hidden');
                            icon.classList.remove('rotate-90');
                        } else {
                            toolsContainer.classList.remove('hidden');
                            icon.classList.add('rotate-90');
                        }
                    };
                    
                    // Assemble server section
                    serverSection.appendChild(serverHeader);
                    serverSection.appendChild(toolsContainer);
                    toolsList.appendChild(serverSection);
                });
                
            } catch (error) {
                console.error('Error loading tools:', error);
                // Fallback to old method if grouped API fails
                try {
                    const response = await fetch('/api/tools');
                    const tools = await response.json();
                    
                    const toolsList = document.getElementById('tools-list');
                    toolsList.innerHTML = '<div class="text-red-500 text-sm mb-2">⚠️ Using fallback tool loading</div>';
                    
                    tools.forEach(tool => {
                        const toolItem = document.createElement('div');
                        toolItem.className = 'p-3 bg-white border border-gray-200 rounded-lg cursor-pointer text-sm transition-all duration-200 hover:bg-gray-50 hover:border-purple-300';
                        toolItem.textContent = tool.name;
                        toolItem.title = tool.info?.description || 'No description available';
                        toolItem.onclick = () => insertToolCall(tool.name);
                        toolsList.appendChild(toolItem);
                    });
                } catch (fallbackError) {
                    console.error('Error loading tools (fallback):', fallbackError);
                    const toolsList = document.getElementById('tools-list');
                    toolsList.innerHTML = '<div class="text-red-500 text-sm">❌ Failed to load tools</div>';
                }
            }
        }

        // Insert tool call template
        function insertToolCall(toolName) {
            const input = document.getElementById('message-input');
            input.value = 'Use the ' + toolName + ' tool';
            input.focus();
        }

        // Send message
        async function sendMessage() {
            if (isLoading) return;
            
            const input = document.getElementById('message-input');
            const message = input.value.trim();
            
            if (!message) return;
            
            // Add user message
            addMessage('user', message);
            input.value = '';
            
            // Show loading
            setLoading(true);
            
            try {
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ message })
                });
                
                const result = await response.json();
                
                if (result.error) {
                    // Show error with tool arguments if available
                    if (result.rawResponse) {
                        let argsText = '';
                        try {
                            const toolCall = JSON.parse(result.rawResponse);
                            if (toolCall.tool && toolCall.args) {
                                argsText = ' with args: ' + JSON.stringify(toolCall.args);
                                addMessage('tool', '🔧 Used tool: ' + toolCall.tool + argsText, null, result.rawResponse);
                            }
                        } catch (error) {
                            console.error('Error parsing raw response for error case:', error);
                        }
                    }
                    addMessage('assistant', '❌ Error: ' + result.error);
                } else if (result.toolUsed) {
                    addMessage('tool', '🔧 Used tool: ' + result.toolUsed, result.toolResult, result.rawResponse);
                    addMessage('assistant', result.finalResponse);
                } else {
                    addMessage('assistant', result.response);
                }
                
            } catch (error) {
                addMessage('assistant', '❌ Error: ' + error.message);
            } finally {
                setLoading(false);
            }
        }

        // Add message to chat
        function addMessage(type, content, toolResult = null, rawResponse = null) {
            const messages = document.getElementById('messages');
            const messageDiv = document.createElement('div');
            
            // Apply Tailwind classes based on message type
            if (type === 'user') {
                messageDiv.className = 'mb-5 p-4 bg-purple-500 text-white rounded-xl max-w-4xl ml-auto';
            } else if (type === 'tool') {
                messageDiv.className = 'mb-5 p-4 bg-green-50 border border-green-200 rounded-xl max-w-4xl';
            } else {
                messageDiv.className = 'mb-5 p-4 bg-white border border-gray-200 rounded-xl max-w-4xl';
            }
            
            let icon = type === 'user' ? '👤' : type === 'tool' ? '🔧' : '🤖';
            let label = type === 'user' ? 'You' : type === 'tool' ? '' : 'Assistant';
            
            // Client-side markdown rendering for assistant messages
            if (type === 'assistant' && typeof marked !== 'undefined') {
                try {
                    const renderedContent = marked.parse(content);
                    messageDiv.innerHTML = '<div class="font-semibold text-gray-800 mb-2">' + icon + ' ' + label + ':</div><div class="text-gray-700 leading-relaxed prose prose-sm max-w-none">' + renderedContent + '</div>';
                } catch (error) {
                    console.error('Markdown rendering error:', error);
                    messageDiv.innerHTML = '<div class="font-semibold text-gray-800 mb-2">' + icon + ' ' + label + ':</div><div class="text-gray-700 leading-relaxed">' + content + '</div>';
                }
            } else if (type === 'user') {
                messageDiv.innerHTML = '<div class="font-semibold mb-2">' + icon + ' ' + label + ':</div><div class="leading-relaxed">' + content + '</div>';
            } else {
                messageDiv.innerHTML = '<div class="font-semibold text-gray-800 mb-2">' + icon + ' ' + label + ':</div><div class="text-gray-700 leading-relaxed">' + content + '</div>';
            }
            
            // Add collapsible sections for tool messages
            if (type === 'tool' && rawResponse) {
                let thinking = '';
                let toolCallRaw = rawResponse;
                const thinkingMatch = rawResponse.match(/<think>([\\s\\S]*?)<\\/think>/);
                if (thinkingMatch) {
                    thinking = thinkingMatch[1].trim();
                    toolCallRaw = rawResponse.replace(thinkingMatch[0], '').trim();
                }
                
                if (thinking) {
                    const thinkingDiv = createCollapsibleSection('🤔 Thinking Process', thinking, 'bg-purple-50 border border-purple-200 rounded-lg mt-3');
                    messageDiv.appendChild(thinkingDiv);
                }
                
                // For now, just show the raw response
                const rawCallDiv = createCollapsibleSection('📋 Raw Tool Call', toolCallRaw, 'bg-yellow-50 border border-yellow-200 rounded-lg mt-3');
                messageDiv.appendChild(rawCallDiv);
            }
            
            // Add collapsible tool result section
            if (toolResult) {
                const resultDiv = createCollapsibleSection('🔧 Tool Result', JSON.stringify(toolResult, null, 2), 'bg-gray-50 border border-gray-200 rounded-lg mt-3');
                messageDiv.appendChild(resultDiv);
            }
            
            messages.appendChild(messageDiv);
            messages.scrollTop = messages.scrollHeight;
        }
        
        // Create collapsible section
        function createCollapsibleSection(title, content, className) {
            const container = document.createElement('div');
            container.className = className;
            
            const header = document.createElement('div');
            header.className = 'p-3 cursor-pointer select-none flex justify-between items-center bg-black/5 border-b border-black/10 hover:bg-black/10 transition-colors duration-200';
            header.innerHTML = 
                '<span class="font-medium">' + title + '</span>' +
                '<span class="expand-icon text-xs transition-transform duration-200">▶</span>';
            
            const contentDiv = document.createElement('div');
            contentDiv.className = 'p-3 whitespace-pre-wrap hidden font-mono text-xs';
            contentDiv.textContent = content;
            
            header.onclick = function() {
                const icon = header.querySelector('.expand-icon');
                const isExpanded = !contentDiv.classList.contains('hidden');
                
                if (isExpanded) {
                    contentDiv.classList.add('hidden');
                    icon.classList.remove('rotate-90');
                } else {
                    contentDiv.classList.remove('hidden');
                    icon.classList.add('rotate-90');
                }
            };
            
            container.appendChild(header);
            container.appendChild(contentDiv);
            
            return container;
        }

        // Set loading state
        function setLoading(loading) {
            isLoading = loading;
            document.getElementById('loading').style.display = loading ? 'block' : 'none';
        }

        // Clear chat
        function clearChat() {
            // Clear conversation history on server side
            fetch('/api/clear-history', { method: 'POST' })
                .then(() => {
                    const messages = document.getElementById('messages');
                    messages.innerHTML = '<div class="mb-5 p-4 bg-white border border-gray-200 rounded-xl max-w-4xl"><div class="font-semibold text-gray-800 mb-2">🤖 Assistant:</div><div class="text-gray-700 leading-relaxed">Chat and conversation history cleared! How can I help you?</div></div>';
                })
                .catch(error => {
                    console.error('Error clearing history:', error);
                    const messages = document.getElementById('messages');
                    messages.innerHTML = '<div class="mb-5 p-4 bg-white border border-gray-200 rounded-xl max-w-4xl"><div class="font-semibold text-gray-800 mb-2">🤖 Assistant:</div><div class="text-gray-700 leading-relaxed">Chat cleared! How can I help you?</div></div>';
                });
        }

        // Handle Enter key
        document.getElementById('message-input').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });

        // Settings Modal Functions
        let currentConfig = {};
        let availableModels = [];

        async function openSettings() {
            try {
                // Load current config
                const configResponse = await fetch('/api/config');
                currentConfig = await configResponse.json();
                
                // Load available models
                const modelsResponse = await fetch('/api/models');
                const modelsData = await modelsResponse.json();
                availableModels = modelsData.models || [];
                
                // Populate form
                document.getElementById('ollama-host').value = currentConfig.ollama.host || '';
                document.getElementById('config-path').value = currentConfig.configPath || '';
                document.getElementById('system-instructions').value = currentConfig.instructions.system || '';
                document.getElementById('followup-instructions').value = currentConfig.instructions.followUp || '';
                
                // Populate model dropdown
                const modelSelect = document.getElementById('ollama-model');
                modelSelect.innerHTML = '';
                
                if (availableModels.length === 0) {
                    modelSelect.innerHTML = '<option value="">No models found</option>';
                } else {
                    availableModels.forEach(model => {
                        const option = document.createElement('option');
                        option.value = model.name;
                        option.textContent = model.name + ' (' + (model.size ? formatBytes(model.size) : 'Unknown size') + ')';
                        if (model.name === currentConfig.ollama.defaultModel) {
                            option.selected = true;
                        }
                        modelSelect.appendChild(option);
                    });
                }
                
                // Update current model display
                document.getElementById('current-model').textContent = '🦙 ' + (currentConfig.ollama.defaultModel || 'No model set');
                
                // Populate MCP servers list
                const serversList = document.getElementById('mcp-servers-list');
                if (currentConfig.mcpServers.length === 0) {
                    serversList.innerHTML = '<em>No MCP servers configured</em>';
                } else {
                    serversList.innerHTML = currentConfig.mcpServers.map(server => 
                        '<div style="padding: 5px; background: #f8f9fa; margin: 2px 0; border-radius: 3px;">• ' + server + '</div>'
                    ).join('');
                }
                
                // Show modal
                document.getElementById('settingsModal').style.display = 'block';
                
            } catch (error) {
                console.error('Error loading settings:', error);
                alert('Error loading settings: ' + error.message);
            }
        }

        function closeSettings() {
            document.getElementById('settingsModal').style.display = 'none';
        }

        // Handle settings form submission
        document.getElementById('settingsForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            try {
                const formData = {
                    ollama: {
                        host: document.getElementById('ollama-host').value,
                        defaultModel: document.getElementById('ollama-model').value
                    },
                    instructions: {
                        system: document.getElementById('system-instructions').value,
                        followUp: document.getElementById('followup-instructions').value
                    }
                };
                
                const configPath = document.getElementById('config-path').value;
                if (configPath) {
                    formData.configPath = configPath;
                }
                
                // Debug logging
                console.log('🔧 Settings form data:', formData);
                console.log('🔧 Sending to /api/config...');
                
                const response = await fetch('/api/config', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(formData)
                });
                
                console.log('🔧 Response status:', response.status);
                const result = await response.json();
                console.log('🔧 Response data:', result);
                
                if (result.success) {
                    // Update the current model display immediately
                    const newModelName = document.getElementById('ollama-model').value || 'No model set';
                    document.getElementById('current-model').textContent = '🦙 ' + newModelName;
                    
                    closeSettings();
                    alert('Settings saved successfully!');
                } else {
                    alert('Error saving settings: ' + (result.error || 'Unknown error'));
                }
                
            } catch (error) {
                console.error('❌ Error saving settings:', error);
                alert('Error saving settings: ' + error.message);
            }
        });

        // Refresh models from current Ollama host
        async function refreshModels() {
            const refreshBtn = document.getElementById('refresh-models-btn');
            const modelSelect = document.getElementById('ollama-model');
            const currentHost = document.getElementById('ollama-host').value || 'http://localhost:11434';
            
            try {
                // Show loading state
                refreshBtn.disabled = true;
                refreshBtn.innerHTML = '<svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>Loading...';
                modelSelect.innerHTML = '<option value="">Loading models from ' + currentHost + '...</option>';
                
                // Create a temporary Ollama client with the current host
                const tempOllamaConfig = { host: currentHost };
                
                // Make a direct request to the Ollama API
                const response = await fetch(currentHost + '/api/tags');
                
                if (!response.ok) {
                    throw new Error('Failed to connect to Ollama server at ' + currentHost);
                }
                
                const data = await response.json();
                const models = data.models || [];
                
                // Update the models dropdown
                modelSelect.innerHTML = '';
                
                if (models.length === 0) {
                    modelSelect.innerHTML = '<option value="">No models found on ' + currentHost + '</option>';
                } else {
                    const currentSelectedModel = currentConfig.ollama?.defaultModel;
                    
                    models.forEach(model => {
                        const option = document.createElement('option');
                        option.value = model.name;
                        option.textContent = model.name + ' (' + (model.size ? formatBytes(model.size) : 'Unknown size') + ')';
                        if (model.name === currentSelectedModel) {
                            option.selected = true;
                        }
                        modelSelect.appendChild(option);
                    });
                }
                
                // Update availableModels global variable
                availableModels = models;
                
                console.log('✅ Refreshed models from ' + currentHost + ': ' + models.length + ' models found');
                
            } catch (error) {
                console.error('❌ Error refreshing models:', error);
                modelSelect.innerHTML = '<option value="">Error loading models: ' + error.message + '</option>';
            } finally {
                // Restore button state
                refreshBtn.disabled = false;
                refreshBtn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>Refresh';
            }
        }

        // Close modal when clicking outside
        window.onclick = function(event) {
            const modal = document.getElementById('settingsModal');
            if (event.target === modal) {
                closeSettings();
            }
        }


        // Format bytes helper function
        function formatBytes(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }

        // Mobile menu functionality
        document.getElementById('mobile-menu-btn').addEventListener('click', function() {
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('sidebar-overlay');
            
            sidebar.classList.remove('-translate-x-full');
            overlay.classList.remove('hidden');
        });

        document.getElementById('close-sidebar').addEventListener('click', function() {
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('sidebar-overlay');
            
            sidebar.classList.add('-translate-x-full');
            overlay.classList.add('hidden');
        });

        document.getElementById('sidebar-overlay').addEventListener('click', function() {
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('sidebar-overlay');
            
            sidebar.classList.add('-translate-x-full');
            overlay.classList.add('hidden');
        });

        // Initialize on load
        init();
    </script>
</body>
</html>
    `;
  }

  async start() {
    this.app.listen(this.port, () => {
      console.log(`\n🌐 Web GUI running at: http://localhost:${this.port}`);
      console.log('💡 Open this URL in your browser to use the GUI');
      console.log('🔧 Press Ctrl+C to stop the server\n');
    });
  }
}

// Start the web GUI
const webGUI = new OllamaMCPWebGUI();
await webGUI.initialize();
await webGUI.start();
