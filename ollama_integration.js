import { Ollama } from 'ollama';

export class OllamaWithMCP {
  constructor(mcpManager, configManager) {
    const ollamaConfig = configManager.getOllamaConfig();
    this.ollama = new Ollama({ host: ollamaConfig.host });
    this.mcp = mcpManager;
    this.configManager = configManager;
    this.conversationHistory = [];
    this.defaultModel = ollamaConfig.defaultModel;
  }

  async chat(message, model = null) {
    const useModel = model || this.defaultModel;
    const instructions = this.configManager.getInstructions();
    
    // Build messages array with conversation history
    const messages = [
      {
        role: 'system',
        content: `${instructions.system}

Available tools: ${this.mcp.getAvailableTools().join(', ')}
Available resources: ${this.mcp.getAvailableResources().join(', ')}`
      },
      // Add conversation history
      ...this.conversationHistory,
      {
        role: 'user',
        content: message
      }
    ];

    let response = await this.ollama.chat({
      model: useModel,
      messages,
      stream: false
    });

    let assistantMessage = response.message.content;
    
    // Check if the response contains a tool call
    if (this.isToolCall(assistantMessage)) {
      try {
        const toolCall = this.parseToolCall(assistantMessage);
        console.log('Tool call detected:', toolCall);
        
        const toolResult = await this.mcp.callTool(toolCall.tool, toolCall.args);
        
        // Follow up with the tool result
        messages.push({ role: 'assistant', content: assistantMessage });
        messages.push({ 
          role: 'user', 
          content: instructions.followUp.replace('{TOOL_RESULT}', JSON.stringify(toolResult, null, 2))
        });

        const finalResponse = await this.ollama.chat({
          model: useModel,
          messages,
          stream: false
        });

        // Clean up the response by removing <think> tags and their content
        let cleanedResponse = finalResponse.message.content;
        cleanedResponse = cleanedResponse.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

        // Store conversation history
        this.conversationHistory.push({ role: 'user', content: message });
        this.conversationHistory.push({ role: 'assistant', content: `Used tool ${toolCall.tool} with result: ${cleanedResponse}` });

        // Keep only last 10 exchanges (20 messages) to prevent context overflow
        if (this.conversationHistory.length > 20) {
          this.conversationHistory = this.conversationHistory.slice(-20);
        }

        return {
          toolUsed: toolCall.tool,
          toolResult: toolResult,
          finalResponse: cleanedResponse,
          rawResponse: assistantMessage
        };
      } catch (error) {
        // Store error in history too
        this.conversationHistory.push({ role: 'user', content: message });
        this.conversationHistory.push({ role: 'assistant', content: `Error: ${error.message}` });

        return {
          error: `Tool call failed: ${error.message}`,
          rawResponse: assistantMessage
        };
      }
    }

    // Store regular conversation
    this.conversationHistory.push({ role: 'user', content: message });
    this.conversationHistory.push({ role: 'assistant', content: assistantMessage });

    // Keep only last 10 exchanges (20 messages) to prevent context overflow
    if (this.conversationHistory.length > 20) {
      this.conversationHistory = this.conversationHistory.slice(-20);
    }

    return {
      response: assistantMessage,
      toolUsed: null
    };
  }

  isToolCall(text) {
    try {
      // Find JSON block with proper brace counting
      let startIndex = text.indexOf('{"action":"tool_call"');
      if (startIndex === -1) startIndex = text.indexOf('{ "action": "tool_call"');
      if (startIndex === -1) startIndex = text.indexOf('{\n  "action": "tool_call"');
      
      if (startIndex === -1) {
        // Try more flexible search
        const actionIndex = text.indexOf('"action"');
        const toolCallIndex = text.indexOf('"tool_call"');
        if (actionIndex > -1 && toolCallIndex > -1) {
          // Find the opening brace before "action"
          for (let i = actionIndex; i >= 0; i--) {
            if (text[i] === '{') {
              startIndex = i;
              break;
            }
          }
        }
      }
      
      if (startIndex > -1) {
        let braceCount = 0;
        let endIndex = -1;
        
        for (let i = startIndex; i < text.length; i++) {
          if (text[i] === '{') braceCount++;
          if (text[i] === '}') braceCount--;
          if (braceCount === 0) {
            endIndex = i;
            break;
          }
        }
        
        if (endIndex > -1) {
          const jsonText = text.substring(startIndex, endIndex + 1);
          try {
            const parsed = JSON.parse(jsonText);
            return parsed.action === 'tool_call' && parsed.tool && parsed.args !== undefined;
          } catch (e) {
            console.log('JSON parse error in isToolCall:', e.message);
            console.log('JSON text:', jsonText);
          }
        }
      }
      
      // Fallback: Check if the entire text is a JSON tool call
      const trimmed = text.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        const parsed = JSON.parse(trimmed);
        return parsed.action === 'tool_call' && parsed.tool && parsed.args !== undefined;
      }
    } catch (error) {
      // Not JSON, continue
    }
    return false;
  }

  parseToolCall(text) {
    try {
      const trimmed = text.trim();
      
      // First try to parse the entire text as JSON
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        return JSON.parse(trimmed);
      }
      
      // Use the same logic as isToolCall
      let startIndex = text.indexOf('{"action":"tool_call"');
      if (startIndex === -1) startIndex = text.indexOf('{ "action": "tool_call"');
      if (startIndex === -1) startIndex = text.indexOf('{\n  "action": "tool_call"');
      
      if (startIndex === -1) {
        // Try more flexible search
        const actionIndex = text.indexOf('"action"');
        const toolCallIndex = text.indexOf('"tool_call"');
        if (actionIndex > -1 && toolCallIndex > -1) {
          // Find the opening brace before "action"
          for (let i = actionIndex; i >= 0; i--) {
            if (text[i] === '{') {
              startIndex = i;
              break;
            }
          }
        }
      }
      
      if (startIndex > -1) {
        let braceCount = 0;
        let endIndex = -1;
        
        for (let i = startIndex; i < text.length; i++) {
          if (text[i] === '{') braceCount++;
          if (text[i] === '}') braceCount--;
          if (braceCount === 0) {
            endIndex = i;
            break;
          }
        }
        
        if (endIndex > -1) {
          const jsonText = text.substring(startIndex, endIndex + 1);
          return JSON.parse(jsonText);
        }
      }
      
    } catch (error) {
      console.log('Parse error:', error.message);
      console.log('Text to parse:', text.substring(0, 200) + '...');
    }
    
    throw new Error('Could not parse tool call');
  }

  async streamChat(message, model = null, onChunk) {
    const useModel = model || this.defaultModel;
    const instructions = this.configManager.getInstructions();
    
    const messages = [
      {
        role: 'system',
        content: `${instructions.system}

Available tools: ${this.mcp.getAvailableTools().join(', ')}
Available resources: ${this.mcp.getAvailableResources().join(', ')}`
      },
      {
        role: 'user',
        content: message
      }
    ];

    const response = await this.ollama.chat({
      model: useModel,
      messages,
      stream: true
    });

    let fullResponse = '';
    for await (const chunk of response) {
      fullResponse += chunk.message.content;
      if (onChunk) onChunk(chunk.message.content);
    }

    return fullResponse;
  }

  async listModels() {
    return await this.ollama.list();
  }

  clearConversationHistory() {
    this.conversationHistory = [];
    console.log('Conversation history cleared');
  }

  getConversationHistory() {
    return this.conversationHistory;
  }
}
