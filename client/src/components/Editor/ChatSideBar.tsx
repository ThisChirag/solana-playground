import { useState, useCallback } from "react";
import styled from "styled-components";

// ↑ You can use whichever UI library or components you already have

// 1. This function can talk to Anthropic’s API (Claude).
async function callAnthropic(prompt: string): Promise<string> {
  // Example: fetch your Claude endpoint or proxy
  const response = await fetch("/api/anthropic", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  const data = await response.json();
  // Adjust to whatever structure your API returns
  return data?.completion ?? "";
}

export const ChatSidebar = ({ onReplaceCode }: { onReplaceCode: (code: string) => void }) => {
  const [input, setInput] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(async () => {
    setLoading(true);
    try {
      const result = await callAnthropic(input);
      setAnswer(result);
    } catch (error) {
      console.error("Anthropic call failed:", error);
    }
    setLoading(false);
  }, [input]);

  const handleApplyCode = useCallback(() => {
    // This is called when user wants to replace code in the editor.
    // We'll rely on an external callback prop to do the actual replacement.
    onReplaceCode(answer);
  }, [answer, onReplaceCode]);

  return (
    <SidebarContainer>
      <h2>Chat with Claude</h2>
      <ChatBox>
        <input
          value={input}
          onChange={ev => setInput(ev.target.value)}
          placeholder="Ask for code changes..."
        />
        <button onClick={handleSubmit} disabled={loading || !input}>
          {loading ? "Loading..." : "Send"}
        </button>
      </ChatBox>

      {answer && (
        <AnswerBox>
          <pre>{answer}</pre>
          <button onClick={handleApplyCode}>Apply to Editor</button>
        </AnswerBox>
      )}
    </SidebarContainer>
  );
};

// Basic styled components, or your own CSS
const SidebarContainer = styled.div`
  width: 300px;
  background: #1a1a1a;
  color: #fff;
  display: flex;
  flex-direction: column;
  padding: 1rem;
`;

const ChatBox = styled.div`
  margin-bottom: 1rem;
`;

const AnswerBox = styled.div`
  margin-top: 1rem;
`;