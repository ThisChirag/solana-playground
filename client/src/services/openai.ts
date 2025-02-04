import { PgExplorer } from "../utils/pg";

const PROXY_URL = "https://sol.chiragcodes.com/proxy";
const MAX_HISTORY_PAIRS = 4; // Keep last 4 pairs of messages

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

    if (isRustFile) {
      prompt += `

SOLANA RUST PROGRAM GUIDELINES:
• Validate accounts, seeds (PDAs), and CPIs carefully.
• Check rent exemption requirements and watch the ~200k compute budget.
• Provide robust error handling (custom errors or standard program errors).
• Ensure safe cross-program invocations if used (Anchor or Native).
`;
    } else if (isPythonFile) {
      prompt += `

SEAHORSE (PYTHON) GUIDELINES:
• Carefully manage PDAs and ephemeral accounts in Python.
• Provide strong error handling and security checks.
• Respect Solana's compute budget and rent rules, even in Python.
• Use Seahorse macros in a safe and consistent manner.
`;
    } else {
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
   * Analyzes user prompt plus (optionally) current code context and chat history,
   * then streams the GPT-4 response.
   *
   * @param prompt - The user's prompt.
   * @param currentCode - The current code from the editor.
   * @param useCodeContext - Whether to include current code context.
   * @param previousMessages - Previous chat messages.
   * @param onProgress - Callback invoked with the cumulative partial response.
   * @returns Final response string.
   */
  static async analyzeCode(
    prompt: string,
    currentCode: string,
    useCodeContext: boolean = true,
    previousMessages: Array<{ prompt: string; response: string }> = [],
    onProgress?: (partialResponse: string) => void
  ): Promise<string> {
    try {
      const currentLang = PgExplorer.getCurrentFileLanguage()?.name || "Unknown";

      const historyMessages: ChatMessage[] = previousMessages
        .slice(-MAX_HISTORY_PAIRS)
        .flatMap(({ prompt, response }) => [
          { role: "user", content: prompt },
          { role: "assistant", content: response },
        ]);

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

      const requestBody = {
        model: "gpt-4",
        messages: [
          { role: "system", content: this.getSystemPrompt(currentLang) },
          ...historyMessages,
          { role: "user", content: currentUserMessage },
        ],
        temperature: 0.7,
        max_tokens: 4000,
        stream: true,
      };

      const response = await fetch(`${PROXY_URL}/api/openai`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        console.error("API Error:", errorData);
        throw new Error(`API error: ${errorData?.error || response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader available from response body.");

      const decoder = new TextDecoder("utf-8");
      let done = false;
      let fullResponse = "";

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        const chunk = decoder.decode(value, { stream: true });
        // Split into lines and filter out empty ones
        const lines = chunk.split("\n").filter((line) => line.trim() !== "");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const dataStr = line.substring("data: ".length).trim();
            if (dataStr === "[DONE]") {
              done = true;
              break;
            }
            try {
              const parsed = JSON.parse(dataStr);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                fullResponse += delta;
                if (onProgress) onProgress(fullResponse);
              }
            } catch (error) {
              console.error("Error parsing stream chunk:", error);
            }
          }
        }
      }

      return fullResponse;
    } catch (error) {
      console.error("Error calling API:", error);
      throw error instanceof Error
        ? new Error(`GPT-4 API error: ${error.message}`)
        : new Error("Failed to communicate with GPT-4 API");
    }
  }

  /**
   * Extracts the first code block from the GPT-4 response.
   */
  static extractCodeBlock(response: string): string {
    const codeBlockRegex = /```(?:[\w-]*\n)?([\s\S]*?)```/;
    const match = response.match(codeBlockRegex);
    return match ? match[1].trim() : response;
  }
}
