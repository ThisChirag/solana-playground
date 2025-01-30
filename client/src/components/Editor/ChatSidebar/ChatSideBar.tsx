import { useState, useCallback, useEffect } from "react";
import styled from "styled-components";
import { OpenAIService } from "../../../services/openai";

interface ChatSidebarProps {
  onReplaceCode: (code: string) => void;
  getCurrentCode: () => string;
}

export const ChatSidebar = ({ onReplaceCode, getCurrentCode }: ChatSidebarProps) => {
  const [input, setInput] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [history, setHistory] = useState<Array<{prompt: string, response: string}>>([]);

  // Loading messages in sequence
  const loadingMessages = [
    "Assistant is thinking",
    "Analyzing your code",
    "Processing your request",
    "Generating response"
  ];

  useEffect(() => {
    if (loading) {
      // Set up sequential messages with fixed timing
      const messageTimings = [0, 1000, 2000, 3000]; // Timing for each message in ms
      
      // Clear any existing timeouts
      const timeouts: NodeJS.Timeout[] = [];
      
      // Schedule each message to appear once
      loadingMessages.forEach((message, index) => {
        const timeout = setTimeout(() => {
          setLoadingMessage(message);
        }, messageTimings[index]);
        timeouts.push(timeout);
      });

      // Cleanup function
      return () => {
        timeouts.forEach(timeout => clearTimeout(timeout));
      };
    }
  }, [loading]);

  const handleSubmit = useCallback(async () => {
    if (!input.trim()) return;
    
    setLoading(true);
    setLoadingMessage(loadingMessages[0]); // Set initial message immediately
    
    try {
      const currentCode = getCurrentCode();
      const result = await OpenAIService.analyzeCode(input, currentCode);
      setAnswer(result);
      setHistory(prev => [...prev, { prompt: input, response: result }]);
      setInput("");
    } catch (error) {
      console.error("GPT-4 API failed:", error);
      setAnswer("Error: Failed to get response from GPT-4. Please try again.");
    }
    setLoading(false);
  }, [input, getCurrentCode]);

  const handleKeyPress = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSubmit();
    }
  }, [handleSubmit]);

  const handleApplyCode = useCallback(() => {
    const codeToApply = OpenAIService.extractCodeBlock(answer);
    onReplaceCode(codeToApply);
  }, [answer, onReplaceCode]);

  const detectLanguage = (code: string): string => {
    if (code.includes('fn ') || code.includes('impl ') || code.includes('pub struct')) {
      return 'RUST';
    }
    if (code.includes('function ') || code.includes('const ') || code.includes('let ')) {
      return 'JAVASCRIPT';
    }
    if (code.includes('def ') || code.includes('class ') || code.includes('import ')) {
      return 'PYTHON';
    }
    if (code.includes('public class') || code.includes('private ') || code.includes('void ')) {
      return 'JAVA';
    }
    return 'CODE'; // Default label if language can't be detected
  };

  const renderCodeBlock = (code: string) => {
    const language = detectLanguage(code);
    return (
      <CodeBlockContainer>
        <CodeHeader>
          <LanguageLabel>{language}</LanguageLabel>
          <ButtonGroup>
            <CodeButton onClick={() => navigator.clipboard.writeText(code)}>
              <CopyIcon /> Copy code
            </CodeButton>
            <CodeButton onClick={() => onReplaceCode(code)}>
              <ApplyIcon /> Apply to Editor
            </CodeButton>
          </ButtonGroup>
        </CodeHeader>
        <CodeContent>
          <pre>
            <code>{code}</code>
          </pre>
        </CodeContent>
      </CodeBlockContainer>
    );
  };

  const renderResponse = (response: string) => {
    const parts = response.split(/(```[\s\S]*?```)/g);
    return parts.map((part, index) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        const code = part.slice(3, -3).replace(/^[a-z]+\n/, ''); // Remove language identifier
        return renderCodeBlock(code);
      }
      return <ResponseText key={index}>{part}</ResponseText>;
    });
  };

  return (
    <SidebarContainer>
      <Header>Solana PG Assistant</Header>
      <ChatContainer>
        <MessagesContainer>
          {history.map((item, index) => (
            <MessageGroup key={index}>
              <UserMessage>
                <AvatarContainer>
                  <Avatar>👤</Avatar>
                  <SenderLabel>You</SenderLabel>
                </AvatarContainer>
                <MessageContent>
                  <MessageText>{item.prompt}</MessageText>
                </MessageContent>
              </UserMessage>
              
              <AIMessage>
                <AvatarContainer>
                  <Avatar>🤖</Avatar>
                  <SenderLabel>AI</SenderLabel>
                </AvatarContainer>
                <MessageContent>
                  {item.response.split(/(```[\s\S]*?```)/g).map((part, idx) => {
                    if (part.startsWith('```') && part.endsWith('```')) {
                      const code = part.slice(3, -3).replace(/^[a-z]+\n/, '');
                      return renderCodeBlock(code);
                    }
                    return <MessageText key={idx}>{part}</MessageText>;
                  })}
                </MessageContent>
              </AIMessage>
            </MessageGroup>
          ))}
          {loading && (
            <LoadingMessage>
              <AIMessage>
                <AvatarContainer>
                  <Avatar>🤖</Avatar>
                  <SenderLabel>AI</SenderLabel>
                </AvatarContainer>
                <MessageContent>
                  <LoadingText>
                    {loadingMessage}
                    <LoadingDots><span>.</span><span>.</span><span>.</span></LoadingDots>
                  </LoadingText>
                </MessageContent>
              </AIMessage>
            </LoadingMessage>
          )}
        </MessagesContainer>
      </ChatContainer>

      <InputContainer>
        <StyledTextArea
          value={input}
          onChange={ev => setInput(ev.target.value)}
          placeholder="Ask about the code or request changes..."
          disabled={loading}
        />
        <SendButton onClick={handleSubmit} disabled={loading || !input.trim()}>
          {loading ? "Loading..." : "Send"}
        </SendButton>
      </InputContainer>
    </SidebarContainer>
  );
};

// Styled components
const SidebarContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  background: ${({ theme }) => theme.colors.default.bgPrimary};
`;

const Header = styled.div`
  padding: 1rem;
  font-size: 1.2rem;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.default.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.default.border};
`;

const ChatContainer = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
`;

const MessagesContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2rem;
`;

const MessageGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const Message = styled.div`
  display: flex;
  gap: 1rem;
  padding: 1rem;
  border-radius: 8px;
`;

const UserMessage = styled(Message)`
  background: transparent;
`;

const AIMessage = styled(Message)`
  background: ${({ theme }) => theme.colors.default.bgSecondary};
`;

const AvatarContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  min-width: 40px;
`;

const Avatar = styled.div`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  background: ${({ theme }) => theme.colors.default.bgPrimary};
`;

const SenderLabel = styled.div`
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.default.textSecondary};
`;

const MessageContent = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const MessageText = styled.div`
  color: ${({ theme }) => theme.colors.default.textPrimary};
  line-height: 1.5;
  white-space: pre-wrap;
`;

const CodeBlockContainer = styled.div`
  margin: 0.5rem 0;
  background: ${({ theme }) => theme.colors.default.bgPrimary};
  border: 1px solid ${({ theme }) => theme.colors.default.border};
  border-radius: 8px;
  overflow: hidden;
`;

const CodeHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  background: ${({ theme }) => theme.colors.default.bgSecondary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.default.border};
`;

const LanguageLabel = styled.span`
  color: ${({ theme }) => theme.colors.default.textSecondary};
  font-size: 0.9rem;
  text-transform: uppercase;
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 0.5rem;
`;

const CodeButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border: none;
  border-radius: 4px;
  background: ${({ theme }) => theme.colors.default.primary};
  color: white;
  font-size: 0.9rem;
  cursor: pointer;

  &:hover {
    opacity: 0.9;
  }
`;

const CodeContent = styled.div`
  padding: 1rem;
  overflow-x: auto;

  pre {
    margin: 0;
    code {
      font-family: 'Fira Code', monospace;
      font-size: 0.9rem;
      line-height: 1.5;
    }
  }
`;

const InputContainer = styled.div`
  padding: 1rem;
  border-top: 1px solid ${({ theme }) => theme.colors.default.border};
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const StyledTextArea = styled.textarea`
  width: 100%;
  min-height: 100px;
  padding: 0.75rem;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.default.border};
  background: ${({ theme }) => theme.colors.default.bgSecondary};
  color: ${({ theme }) => theme.colors.default.textPrimary};
  resize: vertical;
  font-size: 0.9rem;
  line-height: 1.5;

  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
`;

const SendButton = styled.button`
  padding: 0.75rem;
  border: none;
  border-radius: 8px;
  background: ${({ theme }) => theme.colors.default.primary};
  color: white;
  font-weight: 500;
  cursor: pointer;

  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  &:hover:not(:disabled) {
    opacity: 0.9;
  }
`;

// Optional: Add these icons if you want to use them
const CopyIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
  </svg>
);

const ApplyIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" />
  </svg>
);

const ResponseText = styled.pre`
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
  color: ${({ theme }) => theme.colors.default.textSecondary};
`;

const LoadingMessage = styled.div`
  margin-top: 1rem;
`;

const LoadingText = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: ${({ theme }) => theme.colors.default.textSecondary};
`;

const LoadingDots = styled.div`
  display: flex;
  gap: 2px;
  
  span {
    animation: loadingDots 1.4s infinite;
    
    &:nth-child(2) {
      animation-delay: 0.2s;
    }
    
    &:nth-child(3) {
      animation-delay: 0.4s;
    }
  }
  
  @keyframes loadingDots {
    0%, 80%, 100% { opacity: 0; }
    40% { opacity: 1; }
  }
`;