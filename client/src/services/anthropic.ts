import { PgExplorer } from "../utils/pg";

const ANTHROPIC_API_KEY = process.env.VITE_ANTHROPIC_API_KEY || 'your-api-key';


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

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: "claude-3-sonnet-20240229",
          max_tokens: 4096,
          temperature: 0.7,
          messages: [{ role: "user", content: structuredPrompt }]
        })
      });

      if (!response.ok) {
        throw new Error(`Anthropic API error: ${response.statusText}`);
      }

      const data: AnthropicResponse = await response.json();
      return data.content[0].text;

    } catch (error) {
      console.error('Error calling Anthropic API:', error);
      throw error;
    }
  }

  static extractCodeBlock(response: string): string {
    const codeBlockRegex = /```(?:[\w-]*\n)?([\s\S]*?)```/;
    const match = response.match(codeBlockRegex);
    return match ? match[1].trim() : response;
  }
} 