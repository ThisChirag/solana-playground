import { PgExplorer } from "../utils/pg";

const PROXY_URL = "http://localhost:3001";
const MAX_HISTORY_PAIRS = 4; // Keep last 4 pairs of messages

interface OpenAIResponse {
  choices: Array<{ message: { content: string } }>;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class OpenAIService {
  /**
   * Builds a system prompt that addresses:
   *  - Anchor (Rust), Native (Rust), Seahorse (Python), and client-side TS/JS
   *  - Mentions code changes with line references and thorough explanations
   */
  private static getSystemPrompt(currentLang: string): string {
    const lowerLang = currentLang.toLowerCase();
    const isRustFile = lowerLang.includes("rust");
    const isPythonFile = lowerLang.includes("python");

    // Intro that applies to all frameworks/languages
    let prompt = `
You are an **advanced Solana development assistant** with extensive expertise in:
 • Anchor (Rust)
 • Native (Rust)
 • Seahorse (Python)
 • Client-side (TypeScript/JavaScript)
 • General Solana blockchain best practices (PDAs, CPIs, rent exemption, security, performance, etc.)

**When providing answers**:
1. **If you propose code changes**, you must:
   • Clearly **mention which lines** changed (e.g. “Line 42 changed from ... to ...”).
   • Show the **modified code** in a code block, marking the exact lines or sections you altered.
   • Provide a **thorough explanation** for each change (why it was necessary or beneficial, what it adds, etc.).
2. For **code analysis**:
   • Identify issues and potential improvements.
   • Provide full updated code if needed, referencing official Solana or framework docs.
3. For **general questions**:
   • Give concise yet thorough explanations,
   • Provide relevant examples and references (docs, official resources).
4. Emphasize correctness, security, performance, and clarity in all solutions.
`.trim();

    // If it’s Rust, append extra program guidelines
    if (isRustFile) {
      prompt += `

SOLANA RUST PROGRAM GUIDELINES:
• Validate accounts, seeds (PDAs), and CPIs carefully.
• Check rent exemption requirements and watch the ~200k compute budget.
• Provide robust error handling (custom errors or standard program errors).
• Ensure safe cross-program invocations if used (Anchor or Native).
`;
    }
    // If it’s Python (Seahorse)
    else if (isPythonFile) {
      prompt += `

SEAHORSE (PYTHON) GUIDELINES:
• Carefully manage PDAs and ephemeral accounts in Python.
• Provide strong error handling and security checks.
• Respect Solana's compute budget and rent rules, even in Python.
• Use Seahorse macros in a safe and consistent manner.
`;
    }
    // Otherwise assume client-side or unknown
    else {
      prompt += `

CLIENT-SIDE / UNKNOWN LANGUAGE GUIDELINES:
• Handle transaction creation, signing, and confirmation robustly.
• Manage account data (serialization, deserialization) carefully.
• Use best practices for web3 calls, error handling, and wallet states.
• If relevant, mention how to handle PDAs and CPIs from the client side.
`;
    }

    return prompt.trim();
  }

  /**
   * Analyzes user prompt + optional current code context + chat history,
   * then returns GPT-4's response.
   */
  static async analyzeCode(
    prompt: string,
    currentCode: string,
    useCodeContext: boolean = true,
    previousMessages: Array<{ prompt: string; response: string }> = []
  ): Promise<string> {
    try {
      // Get the current language name from the Playground
      const currentLang = PgExplorer.getCurrentFileLanguage()?.name || "Unknown";

      // Convert your chat history into an array of system/user/assistant messages
      const historyMessages: ChatMessage[] = previousMessages
        .slice(-MAX_HISTORY_PAIRS) // keep only last N pairs
        .flatMap(({ prompt, response }) => [
          { role: "user", content: prompt },
          { role: "assistant", content: response },
        ]);

      // Build the user message, optionally including the current code snippet
      const currentUserMessage = useCodeContext
        ? `
The current file is in ${currentLang}.

Current code:
\`\`\`${currentLang}
${currentCode}
\`\`\`

User request: ${prompt}

Please analyze the code and respond with best practices, specifying changes if needed.
`.trim()
        : `User request: ${prompt}`;

      // Send request to your local proxy (which calls OpenAI behind the scenes)
      const response = await fetch(`${PROXY_URL}/api/openai`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4",
          messages: [
            { role: "system", content: this.getSystemPrompt(currentLang) },
            ...historyMessages,
            { role: "user", content: currentUserMessage },
          ],
          temperature: 0.7,
          max_tokens: 4000,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        console.error("API Error:", errorData);
        throw new Error(`API error: ${errorData?.error || response.statusText}`);
      }

      const data: OpenAIResponse = await response.json();
      if (!data.choices?.[0]?.message?.content) {
        throw new Error("Invalid response format from API");
      }

      return data.choices[0].message.content;
    } catch (error) {
      console.error("Error calling API:", error);
      throw error instanceof Error
        ? new Error(`GPT-4 API error: ${error.message}`)
        : new Error("Failed to communicate with GPT-4 API");
    }
  }

  /**
   * Extracts the first code block from the GPT-4 response.
   * e.g. If GPT says ```rust\n...```, it returns just the inside portion.
   */
  static extractCodeBlock(response: string): string {
    const codeBlockRegex = /```(?:[\w-]*\n)?([\s\S]*?)```/;
    const match = response.match(codeBlockRegex);
    return match ? match[1].trim() : response;
  }
}
