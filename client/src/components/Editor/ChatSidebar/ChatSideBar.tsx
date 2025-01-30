import { useState, useCallback, useEffect } from "react";
import styled from "styled-components";
import { AnthropicService } from "../../../services/anthropic";

interface ChatSidebarProps {
  onReplaceCode: (code: string) => void;
  getCurrentCode: () => string;
}

export const ChatSidebar = ({ onReplaceCode, getCurrentCode }: ChatSidebarProps) => {
  const [input, setInput] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<Array<{prompt: string, response: string}>>([]);

  const handleSubmit = useCallback(async () => {
    setLoading(true);
    try {
      const currentCode = getCurrentCode();
      const result = await AnthropicService.analyzeCode(input, currentCode);
      setAnswer(result);
      setHistory(prev => [...prev, { prompt: input, response: result }]);
      setInput("");
    } catch (error) {
      console.error("Claude API failed:", error);
      setAnswer("Error: Failed to get response from Claude. Please try again.");
    }
    setLoading(false);
  }, [input, getCurrentCode]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        handleSubmit();
      }
    };
    
    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [handleSubmit]);

  const handleApplyCode = useCallback(() => {
    const codeToApply = AnthropicService.extractCodeBlock(answer);
    onReplaceCode(codeToApply);
  }, [answer, onReplaceCode]);

  return (
    <SidebarContainer>
      <Header>Solana PG Assistant</Header>
      <HistoryContainer>
        {history.map((item, index) => (
          <HistoryItem key={index}>
            <PromptText>You: {item.prompt}</PromptText>
            <ResponseText>Claude: {item.response}</ResponseText>
          </HistoryItem>
        ))}
      </HistoryContainer>
      <ChatBox>
        <StyledTextArea
          value={input}
          onChange={ev => setInput(ev.target.value)}
          placeholder="Ask about the code or request changes..."
        />
        <StyledButton onClick={handleSubmit} disabled={loading || !input}>
          {loading ? "Loading..." : "Send"}
        </StyledButton>
      </ChatBox>

      {answer && (
        <AnswerBox>
          <ResponseText>{answer}</ResponseText>
          <StyledButton onClick={handleApplyCode}>
            Apply Changes to Editor
          </StyledButton>
        </AnswerBox>
      )}
    </SidebarContainer>
  );
};

const SidebarContainer = styled.div`
  width: 400px;
  background: ${({ theme }) => theme.colors.default.bgPrimary};
  color: ${({ theme }) => theme.colors.default.textPrimary};
  display: flex;
  flex-direction: column;
  height: 100%;
  border-left: 1px solid ${({ theme }) => theme.colors.default.border};
`;

const Header = styled.h2`
  padding: 1rem;
  margin: 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.default.border};
`;

const ChatBox = styled.div`
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const StyledTextArea = styled.textarea`
  width: 100%;
  min-height: 100px;
  padding: 0.5rem;
  background: ${({ theme }) => theme.colors.default.bgPrimary};
  color: ${({ theme }) => theme.colors.default.textPrimary};
  border: 1px solid ${({ theme }) => theme.colors.default.border};
  border-radius: 4px;
  resize: vertical;
`;

const StyledButton = styled.button`
  padding: 0.5rem 1rem;
  background: ${({ theme }) => theme.colors.default.primary};
  color: ${({ theme }) => theme.colors.default.textPrimary};
  border: none;
  border-radius: 4px;
  cursor: pointer;
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  &:hover:not(:disabled) {
    opacity: 0.8;
    background: ${({ theme }) => theme.colors.state.hover.bg};
  }
`;

const AnswerBox = styled.div`
  padding: 1rem;
  border-top: 1px solid ${({ theme }) => theme.colors.default.border};
  overflow-y: auto;
  flex: 1;
`;

const ResponseText = styled.pre`
  white-space: pre-wrap;
  word-wrap: break-word;
  margin: 0 0 1rem 0;
  font-family: ${({ theme }) => theme.font.code.family};
  font-size: ${({ theme }) => theme.font.code.size.small};
`;

const HistoryContainer = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
`;

const HistoryItem = styled.div`
  margin-bottom: 1rem;
  padding: 0.5rem;
  border-radius: 4px;
  background: ${({ theme }) => theme.colors.default.bgSecondary};
`;

const PromptText = styled.div`
  margin-bottom: 0.5rem;
  color: ${({ theme }) => theme.colors.default.textSecondary};
`;