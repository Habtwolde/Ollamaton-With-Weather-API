// ollama_integration.js
import ollama from 'ollama';

export class OllamaWithMCP {
  constructor(mcpManager, configManager) {
    const ollamaConfig = configManager.getOllamaConfig();

    // Point the npm client at your Ollama host
    if (ollamaConfig?.host) {
      process.env.OLLAMA_HOST = ollamaConfig.host;
    }

    // The npm package exports a default client object, not a class/constructor
    this.ollama = ollama;

    this.mcp = mcpManager;
    this.configManager = configManager;
    this.conversationHistory = [];
    this.defaultModel = ollamaConfig.defaultModel;
  }

  async chat(message, model = null) {
    const useModel = model || this.defaultModel;
    const instructions = this.configManager.getInstructions();

    // Build messages with history
    const messages = [
      {
        role: 'system',
        content: `${instructions.system}

Available tools: ${this.mcp.getAvailableTools().join(', ')}
Available resources: ${this.mcp.getAvailableResources().join(', ')}`
      },
      ...this.conversationHistory,
      { role: 'user', content: message }
    ];

    const response = await this.ollama.chat({
      model: useModel,
      messages,
      stream: false
    });

    let assistantMessage = response?.message?.content ?? '';

    // If the model requested a tool call (JSON blob detection)
    if (this.isToolCall(assistantMessage)) {
      try {
        const toolCall = this.parseToolCall(assistantMessage);
        console.log('Tool call detected:', toolCall);

        // Call the MCP tool (your MCPManager handles resolution)
        const toolResult = await this.mcp.callTool(toolCall.tool, toolCall.args);

        // Follow-up prompt to present tool result back to the model
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

        // Strip any <think> … </think> blocks
        let cleanedResponse = (finalResponse?.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();

        // Update history (compact to last 10 exchanges)
        this.conversationHistory.push({ role: 'user', content: message });
        this.conversationHistory.push({
          role: 'assistant',
          content: `Used tool ${toolCall.tool} with result: ${cleanedResponse}`
        });
        if (this.conversationHistory.length > 20) {
          this.conversationHistory = this.conversationHistory.slice(-20);
        }

        return {
          toolUsed: toolCall.tool,
          toolResult,
          finalResponse: cleanedResponse,
          rawResponse: assistantMessage
        };
      } catch (error) {
        // Log tool failure into the conversation as well
        this.conversationHistory.push({ role: 'user', content: message });
        this.conversationHistory.push({ role: 'assistant', content: `Error: ${error.message}` });

        return {
          error: `Tool call failed: ${error.message}`,
          rawResponse: assistantMessage
        };
      }
    }

    // Regular response path
    this.conversationHistory.push({ role: 'user', content: message });
    this.conversationHistory.push({ role: 'assistant', content: assistantMessage });
    if (this.conversationHistory.length > 20) {
      this.conversationHistory = this.conversationHistory.slice(-20);
    }

    return {
      response: assistantMessage,
      toolUsed: null
    };
  }

  // Heuristic: detect {"action":"tool_call", ...} JSON inside model text
  isToolCall(text) {
    try {
      // Try to find a JSON block starting with the signature
      let startIndex = text.indexOf('{"action":"tool_call"');
      if (startIndex === -1) startIndex = text.indexOf('{ "action": "tool_call"');
      if (startIndex === -1) startIndex = text.indexOf('{\n  "action": "tool_call"');

      if (startIndex === -1) {
        // More flexible: look for "action" and "tool_call" and backtrack to '{'
        const actionIndex = text.indexOf('"action"');
        const toolCallIndex = text.indexOf('"tool_call"');
        if (actionIndex > -1 && toolCallIndex > -1) {
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
          } catch {
            // ignore parse error; fall through
          }
        }
      }

      // Fallback: the whole message is the JSON
      const trimmed = text.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        const parsed = JSON.parse(trimmed);
        return parsed.action === 'tool_call' && parsed.tool && parsed.args !== undefined;
      }
    } catch {
      // Not JSON
    }
    return false;
  }

  parseToolCall(text) {
    // Try whole text first
    const trimmed = text.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      return JSON.parse(trimmed);
    }

    // Then try scanning as in isToolCall
    let startIndex = text.indexOf('{"action":"tool_call"');
    if (startIndex === -1) startIndex = text.indexOf('{ "action": "tool_call"');
    if (startIndex === -1) startIndex = text.indexOf('{\n  "action": "tool_call"');

    if (startIndex === -1) {
      const actionIndex = text.indexOf('"action"');
      const toolCallIndex = text.indexOf('"tool_call"');
      if (actionIndex > -1 && toolCallIndex > -1) {
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
      { role: 'user', content: message }
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
