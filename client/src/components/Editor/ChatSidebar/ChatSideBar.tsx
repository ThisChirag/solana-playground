import { useState, useCallback, useEffect, useRef } from "react";
import styled from "styled-components";
import { OpenAIService } from "../../../services/openai";
import { ChatStorageManager } from "../../../utils/storage";
import type { ChatHistory } from "../../../utils/storage";
import { Copy as CopyIcon, Checkmark as CheckIcon, Close as CloseIcon } from "../../../components/Icons";

interface ChatSidebarProps {
  onReplaceCode: (code: string) => void;
  getCurrentCode: () => string;
  currentFilePath: string;
  width?: number;
  onWidthChange?: (width: number) => void;
  onClose: () => void;
}

const MIN_WIDTH = 300;
const MAX_WIDTH = 800;
const DEFAULT_WIDTH = 400;

export const ChatSidebar = ({ 
  onReplaceCode, 
  getCurrentCode, 
  currentFilePath,
  width = DEFAULT_WIDTH,
  onWidthChange,
  onClose
}: ChatSidebarProps) => {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [useCodeContext, setUseCodeContext] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [history, setHistory] = useState<ChatHistory[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<HTMLDivElement>(null);
  const startResizeX = useRef<number>(0);
  const startWidth = useRef<number>(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsResizing(true);
    startResizeX.current = e.clientX;
    startWidth.current = width || 400;
  }, [width]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      
      const diff = startResizeX.current - e.clientX;
      const newWidth = Math.min(Math.max(startWidth.current + diff, MIN_WIDTH), MAX_WIDTH);
      onWidthChange?.(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, onWidthChange]);

  // Load chat history when component mounts or file changes
  useEffect(() => {
    if (currentFilePath) {
      const savedHistory = ChatStorageManager.loadHistory(currentFilePath);
      setHistory(savedHistory);
    }
  }, [currentFilePath]);

  const handleClearChat = useCallback(() => {
    if (currentFilePath) {
      // Clear from localStorage
      ChatStorageManager.clearHistory(currentFilePath);
      // Clear from state
      setHistory([]);
    }
  }, [currentFilePath]);

  const handleCopyCode = useCallback((code: string, index: number) => {
    navigator.clipboard.writeText(code);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  }, []);

  const handleApplyCode = useCallback((code: string) => {
    if (code && code.trim()) {
      onReplaceCode(code.trim());
    }
  }, [onReplaceCode]);

  const formatMessage = useCallback((content: string) => {
    const parts = content.split('```');
    return parts.map((part, index) => {
      if (index % 2 === 0) {
        return <TextContent key={index}>{part}</TextContent>;
      } else {
        const [language, ...codeParts] = part.split('\n');
        const code = codeParts.join('\n').trim();
        return (
          <CodeBlock key={index}>
            <CodeHeader>
              <Language>{language}</Language>
              <CodeActions>
                <ActionButton 
                  onClick={() => handleCopyCode(code, index)}
                  title="Copy code"
                >
                  {copiedIndex === index ? <CheckIcon /> : <CopyIcon />}
                </ActionButton>
                <ActionButton 
                  onClick={() => handleApplyCode(code)}
                  title="Apply to editor"
                >
                  Apply
                </ActionButton>
              </CodeActions>
            </CodeHeader>
            <Pre>{code}</Pre>
          </CodeBlock>
        );
      }
    });
  }, [handleCopyCode, handleApplyCode, copiedIndex]);

  const handleSubmit = useCallback(async () => {
    if (!input.trim()) return;
    
    setLoading(true);
    try {
      const result = await OpenAIService.analyzeCode(
        input, 
        getCurrentCode(), 
        useCodeContext,
        history
      );
      
      const newHistoryEntry = { prompt: input, response: result };
      setHistory(prev => [...prev, newHistoryEntry]);
      ChatStorageManager.saveHistory(currentFilePath, [...history, newHistoryEntry]);
      setInput("");
    } catch (error) {
      console.error("GPT-4 API failed:", error);
    }
    setLoading(false);
  }, [input, getCurrentCode, useCodeContext, history, currentFilePath]);

  return (
    <Container style={{ width: `${width}px` }}>
      <ResizeHandle
        ref={resizeRef}
        onMouseDown={handleMouseDown}
      />
      <Header>
        <HeaderContent>
          <HeaderTitle>Solana PG Assistant</HeaderTitle>
          <HeaderActions>
            <ClearButton onClick={handleClearChat}>
              Clear Chat
            </ClearButton>
            <CloseButton onClick={onClose}>
              <CloseIcon />
            </CloseButton>
          </HeaderActions>
        </HeaderContent>
      </Header>
      
      <ChatHistoryContainer>
        {history.map((entry, index) => (
          <MessageGroup key={index}>
            <UserMessage>
              <Avatar>
                <UserAvatar>You</UserAvatar>
              </Avatar>
              <MessageContent>{entry.prompt}</MessageContent>
            </UserMessage>
            <AIMessage>
              <Avatar>
                <AIAvatar>AI</AIAvatar>
              </Avatar>
              <MessageContent>
                {formatMessage(entry.response)}
              </MessageContent>
            </AIMessage>
          </MessageGroup>
        ))}
        {loading && (
          <LoadingMessage>
            <AIMessage>
              <Avatar>
                <AIAvatar>AI</AIAvatar>
              </Avatar>
              <LoadingDots><span>.</span><span>.</span><span>.</span></LoadingDots>
            </AIMessage>
          </LoadingMessage>
        )}
      </ChatHistoryContainer>

      <InputArea>
        <CodeContextToggle>
          <input
            type="checkbox"
            checked={useCodeContext}
            onChange={(e) => setUseCodeContext(e.target.checked)}
          />
          <span>Include Current Code Context</span>
        </CodeContextToggle>
        
        <TextArea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about the code or request changes..."
          disabled={loading}
        />
        
        <SendButton onClick={handleSubmit} disabled={loading || !input.trim()}>
          {loading ? "Sending..." : "Send"}
        </SendButton>
      </InputArea>
    </Container>
  );
};

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  background: ${({ theme }) => theme.colors.default.bgPrimary};
  color: ${({ theme }) => theme.colors.default.textPrimary};
  position: relative;
  min-width: ${MIN_WIDTH}px;
  max-width: ${MAX_WIDTH}px;
  border-left: 1px solid ${({ theme }) => theme.colors.default.border};
  animation: slideIn 0.3s ease;

  @keyframes slideIn {
    from {
      transform: translateX(100%);
    }
    to {
      transform: translateX(0);
    }
  }
`;

const Header = styled.div`
  padding: 1rem;
  border-bottom: 1px solid ${({ theme }) => theme.colors.default.border};
`;

const HeaderContent = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const HeaderTitle = styled.div`
  font-weight: bold;
`;

const ClearButton = styled.button`
  padding: 0.5rem 1rem;
  background: transparent;
  color: ${({ theme }) => theme.colors.default.textPrimary};
  border: 1px solid ${({ theme }) => theme.colors.default.border};
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s ease;

  &:hover {
    background: ${({ theme }) => theme.colors.default.bgSecondary};
  }

  &:active {
    transform: translateY(1px);
  }
`;

const ChatHistoryContainer = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const MessageGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const Message = styled.div`
  display: flex;
  gap: 0.5rem;
  padding: 0.5rem;
  border-radius: 4px;
`;

const UserMessage = styled(Message)`
  background: ${({ theme }) => theme.colors.default.bgSecondary};
`;

const AIMessage = styled(Message)`
  background: ${({ theme }) => theme.colors.default.bgSecondary};
`;

const Avatar = styled.div`
  font-size: 0.8rem;
  font-weight: bold;
  min-width: 30px;
`;

const MessageContent = styled.div`
  flex: 1;
  white-space: pre-wrap;
  word-break: break-word;
  max-width: 100%;
  overflow-x: hidden;
`;

const TextContent = styled.div`
  margin-bottom: 1rem;
`;

const CodeBlock = styled.div`
  margin: 1rem 0;
  background: ${({ theme }) => theme.colors.default.bgPrimary};
  border: 1px solid ${({ theme }) => theme.colors.default.border};
  border-radius: 4px;
  max-width: 100%;
`;

const CodeHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem;
  background: ${({ theme }) => theme.colors.default.bgSecondary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.default.border};
`;

const Language = styled.span`
  font-size: 0.8rem;
  color: ${({ theme }) => theme.colors.default.textSecondary};
`;

const CodeActions = styled.div`
  display: flex;
  gap: 0.5rem;
`;

const ActionButton = styled.button`
  padding: 0.25rem 0.5rem;
  background: transparent;
  color: ${({ theme }) => theme.colors.default.textPrimary};
  border: 1px solid ${({ theme }) => theme.colors.default.border};
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
  display: flex;
  align-items: center;
  gap: 0.25rem;

  &:hover {
    background: ${({ theme }) => theme.colors.default.bgSecondary};
  }
`;

const Pre = styled.pre`
  margin: 0;
  padding: 1rem;
  overflow-x: auto;
  font-family: monospace;
  white-space: pre-wrap;
  word-break: break-word;
  max-width: 100%;
  
  code {
    display: block;
    width: 100%;
  }
`;

const InputArea = styled.div`
  padding: 1rem;
  border-top: 1px solid ${({ theme }) => theme.colors.default.border};
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const CodeContextToggle = styled.label`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  user-select: none;
`;

const TextArea = styled.textarea`
  width: 100%;
  min-height: 100px;
  padding: 0.5rem;
  border: 1px solid ${({ theme }) => theme.colors.default.border};
  border-radius: 4px;
  background: ${({ theme }) => theme.colors.default.bgSecondary};
  color: ${({ theme }) => theme.colors.default.textPrimary};
  resize: vertical;
`;

const SendButton = styled.button`
  padding: 0.5rem 1rem;
  background: ${({ theme }) => theme.colors.default.primary};
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  &:hover:not(:disabled) {
    opacity: 0.9;
  }
`;

const ResizeHandle = styled.div`
  position: absolute;
  left: -5px;
  top: 0;
  bottom: 0;
  width: 10px;
  cursor: col-resize;
  z-index: 10;

  &:hover {
    background: rgba(0, 0, 0, 0.1);
  }

  &:active {
    background: rgba(0, 0, 0, 0.2);
  }
`;

const CloseButton = styled.button`
  padding: 6px;
  background: transparent;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;

  &:hover {
    background: ${({ theme }) => theme.colors.default.bgSecondary};
  }

  svg {
    width: 16px;
    height: 16px;
    color: ${({ theme }) => theme.colors.default.textPrimary};
  }
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const UserAvatar = styled.div`
  background: ${({ theme }) => theme.colors.default.primary};
  color: white;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: bold;
`;

const AIAvatar = styled.div`
  background: #10a37f;
  color: white;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: bold;
`;

const LoadingMessage = styled.div`
  opacity: 0.7;
`;

const LoadingDots = styled.div`
  display: flex;
  gap: 4px;
  
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
    0%, 100% {
      opacity: 0.2;
    }
    50% {
      opacity: 1;
    }
  }
`;

export default ChatSidebar;