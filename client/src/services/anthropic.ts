import { PgExplorer } from "../utils/pg";

const PROXY_URL = 'http://localhost:3001';

interface AnthropicResponse {
  content: Array<{ text: string; type: string }>;
}

export class AnthropicService {
  static async analyzeCode(prompt: string, currentCode: string): Promise<string> {
    try {
      const currentLang = PgExplorer.getCurrentFileLanguage()?.name || 'Unknown';
      
      const structuredPrompt = `
You are a Solana development assistant. The current file is in ${currentLang}.

Current code:
\`\`\`${currentLang}
${currentCode}
\`\`\`

User request: ${prompt}

Please analyze the code and respond to the request. If suggesting changes:
1. Explain the changes briefly
2. Provide the complete modified code in a code block
3. Use the same language as the input code`;

      console.log('Sending request to proxy server...');
      
      const response = await fetch(`${PROXY_URL}/api/anthropic`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: "claude-3-sonnet-20240229",
          max_tokens: 4096,
          temperature: 0.7,
          messages: [{ 
            role: "user", 
            content: structuredPrompt 
          }]
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        console.error('API Error:', errorData);
        throw new Error(`API error: ${errorData?.error || response.statusText}`);
      }

      const data: AnthropicResponse = await response.json();
      if (!data.content || !data.content[0]) {
        throw new Error('Invalid response format from API');
      }
      
      return data.content[0].text;

    } catch (error) {
      console.error('Error calling API:', error);
      if (error instanceof Error) {
        throw new Error(`Claude API error: ${error.message}`);
      }
      throw new Error('Failed to communicate with Claude API');
    }
  }

  static extractCodeBlock(response: string): string {
    const codeBlockRegex = /```(?:[\w-]*\n)?([\s\S]*?)```/;
    const match = response.match(codeBlockRegex);
    return match ? match[1].trim() : response;
  }
}