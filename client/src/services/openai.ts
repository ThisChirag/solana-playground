import { PgExplorer } from "../utils/pg";

const PROXY_URL = 'http://localhost:3001';

interface OpenAIResponse {
  choices: Array<{ message: { content: string } }>;
}

export class OpenAIService {
  private static getSystemPrompt(currentLang: string): string {
    const isRustFile = currentLang === 'Rust';
    return `
You are an expert Solana development assistant. Follow these guidelines:

${isRustFile ? `
SOLANA PROGRAM GUIDELINES:
- Ensure account validation and security checks
- Consider compute unit limits (200k per transaction)
- Follow rent-exemption requirements
- Check for proper error handling with custom errors
- Validate cross-program invocation (CPI) safety
- Consider account size and data packing efficiency
` : `
CLIENT-SIDE GUIDELINES:
- Verify transaction confirmation strategy
- Implement proper error handling for RPC failures
- Consider wallet connection states
- Handle account data serialization correctly
- Implement proper transaction retry logic
`}

RESPONSE FORMAT:
1. For code analysis:
   - Explain issues or improvements briefly
   - Provide complete code solutions
   - Include error handling
   - Reference Solana documentation

2. For general questions:
   - Provide clear, concise explanations
   - Include practical examples
   - Reference official Solana concepts
`.trim();
  }

  static async analyzeCode(
    prompt: string,
    currentCode: string,
    useCodeContext: boolean = true
  ): Promise<string> {
    try {
      const currentLang = PgExplorer.getCurrentFileLanguage()?.name || 'Unknown';
      
      const response = await fetch(`${PROXY_URL}/api/openai`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: "gpt-4",
          messages: [
            { 
              role: "system", 
              content: this.getSystemPrompt(currentLang)
            },
            {
              role: "user",
              content: useCodeContext ? `
The current file is in ${currentLang}.

Current code:
\`\`\`${currentLang}
${currentCode}
\`\`\`

User request: ${prompt}

Please analyze the code and respond to the request.`.trim()
              : `User request: ${prompt}`
            }
          ],
          temperature: 0.7,
          max_tokens: 4000
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        console.error('API Error:', errorData);
        throw new Error(`API error: ${errorData?.error || response.statusText}`);
      }

      const data: OpenAIResponse = await response.json();
      if (!data.choices?.[0]?.message?.content) {
        throw new Error('Invalid response format from API');
      }
      
      return data.choices[0].message.content;
    } catch (error) {
      console.error('Error calling API:', error);
      throw error instanceof Error 
        ? new Error(`GPT-4 API error: ${error.message}`)
        : new Error('Failed to communicate with GPT-4 API');
    }
  }

  static extractCodeBlock(response: string): string {
    const codeBlockRegex = /```(?:[\w-]*\n)?([\s\S]*?)```/;
    const match = response.match(codeBlockRegex);
    return match ? match[1].trim() : response;
  }
} 