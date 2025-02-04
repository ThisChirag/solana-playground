import React, { useState, useCallback, useEffect, useRef } from "react";
import styled from "styled-components";
import { OpenAIService } from "../../../services/openai";
import { ChatStorageManager } from "../../../utils/storage";
import type { ChatHistory } from "../../../utils/storage";
import {
  Copy as CopyIcon,
  Checkmark as CheckIcon,
  Close as CloseIcon,
} from "../../../components/Icons";

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

export const ChatSidebar: React.FC<ChatSidebarProps> = ({
  onReplaceCode,
  getCurrentCode,
  currentFilePath,
  width = DEFAULT_WIDTH,
  onWidthChange,
  onClose,
}) => {
  // Input and chat history state
  const [input, setInput] = useState("");
  const [useCodeContext, setUseCodeContext] = useState(false);
  const [history, setHistory] = useState<ChatHistory[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [appliedIndex, setAppliedIndex] = useState<number | null>(null);
  // Loading state per message (keys are strings)
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});

  // Ref to keep track of the next message index (each new prompt gets its own ID)
  const nextMessageIndex = useRef(0);

  // Timer refs for copy and apply indicators
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resizing
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<HTMLDivElement>(null);
  const startResizeX = useRef<number>(0);
  const startWidth = useRef<number>(width);

  // Chat history scrolling
  const chatHistoryRef = useRef<HTMLDivElement>(null);
  // Track whether auto-scroll is enabled (i.e. user hasn’t scrolled away from the bottom)
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);

  const handleScroll = () => {
    if (chatHistoryRef.current) {
      const { scrollTop, clientHeight, scrollHeight } = chatHistoryRef.current;
      const atBottom = scrollHeight - scrollTop - clientHeight < 50;
      setAutoScrollEnabled(atBottom);
    }
  };

  // -------------------- Resizing Logic --------------------
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      setIsResizing(true);
      startResizeX.current = e.clientX;
      startWidth.current = width;
    },
    [width]
  );

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
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, onWidthChange]);

  // -------------------- Chat History Logic --------------------
  useEffect(() => {
    if (currentFilePath) {
      const savedHistory = ChatStorageManager.loadHistory(currentFilePath);
      setHistory(savedHistory);
      // Reset index and loading states when loading history
      nextMessageIndex.current = savedHistory.length;
      setLoadingMap({});
    }
  }, [currentFilePath]);

  const handleClearChat = useCallback(() => {
    if (currentFilePath) {
      ChatStorageManager.clearHistory(currentFilePath);
      setHistory([]);
      setLoadingMap({});
      nextMessageIndex.current = 0;
    }
  }, [currentFilePath]);

  // -------------------- Copy & Apply Logic --------------------
  const handleCopyCode = useCallback((code: string, index: number) => {
    navigator.clipboard.writeText(code).catch(console.error);
    setCopiedIndex(index);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopiedIndex(null), 2000);
  }, []);

  const handleApplyCode = useCallback(
    (code: string, index: number) => {
      if (code.trim()) {
        onReplaceCode(code.trim());
        setAppliedIndex(index);
        if (applyTimerRef.current) clearTimeout(applyTimerRef.current);
        applyTimerRef.current = setTimeout(() => setAppliedIndex(null), 1000);
      }
    },
    [onReplaceCode]
  );

  // -------------------- Formatting GPT Response --------------------
  const formatMessage = useCallback(
    (content: string) => {
      const parts = content.split("```");
      return parts.map((part, idx) => {
        // Even index: regular text
        if (idx % 2 === 0) {
          return <TextContent key={idx}>{part}</TextContent>;
        } else {
          // Odd index: code block
          const [language, ...codeParts] = part.split("\n");
          const code = codeParts.join("\n").trim();
          return (
            <CodeBlock key={idx}>
              <CodeHeader>
                <Language>{language || "code"}</Language>
                <CodeActions>
                  <ActionButton
                    onClick={() => handleCopyCode(code, idx)}
                    title="Copy code"
                    aria-label="Copy code"
                  >
                    {copiedIndex === idx ? <CheckIcon /> : <CopyIcon />}
                  </ActionButton>
                  <ActionButton
                    onClick={() => handleApplyCode(code, idx)}
                    title="Apply code to editor"
                    aria-label="Apply code"
                  >
                    {appliedIndex === idx ? <CheckIcon /> : "Apply"}
                  </ActionButton>
                </CodeActions>
              </CodeHeader>
              <Pre>{code}</Pre>
            </CodeBlock>
          );
        }
      });
    },
    [handleCopyCode, handleApplyCode, copiedIndex, appliedIndex]
  );

  // -------------------- Sending to GPT with Streaming --------------------
  const handleSubmit = useCallback(async () => {
    if (!input.trim()) return;

    const userPrompt = input;
    // Get a unique index for this new message
    const currentIndex = nextMessageIndex.current;
    nextMessageIndex.current += 1;

    // Add a new chat entry with an empty response.
    setHistory((prev) => {
      const newHistory = [...prev, { prompt: userPrompt, response: "" }];
      ChatStorageManager.saveHistory(currentFilePath, newHistory);
      return newHistory;
    });
    // Mark this message as loading (convert the key to a string)
    setLoadingMap((prev) => ({ ...prev, [currentIndex]: true }));
    setInput("");

    let finalResponse = "";
    try {
      await OpenAIService.analyzeCode(
        userPrompt,
        getCurrentCode(),
        useCodeContext,
        history, // (Used for context; it may be slightly stale but works in most cases)
        (partialResponse) => {
          if (partialResponse !== finalResponse) {
            finalResponse = partialResponse;
            setHistory((prev) => {
              const newHistory = [...prev];
              newHistory[currentIndex] = { prompt: userPrompt, response: finalResponse };
              return newHistory;
            });
          }
        }
      );
      // Save the final response
      setHistory((prev) => {
        const newHistory = [...prev];
        newHistory[currentIndex] = { prompt: userPrompt, response: finalResponse };
        ChatStorageManager.saveHistory(currentFilePath, newHistory);
        return newHistory;
      });
    } catch (error) {
      console.error("GPT-4 API failed:", error);
    }
    // Mark this message as finished loading
    setLoadingMap((prev) => {
      const newMap = { ...prev };
      delete newMap[currentIndex];
      return newMap;
    });
  }, [input, getCurrentCode, useCodeContext, currentFilePath, history]);

  // -------------------- Auto-Scroll to Bottom --------------------
  useEffect(() => {
    if (chatHistoryRef.current && autoScrollEnabled) {
      chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
    }
  }, [history, autoScrollEnabled]);

  // -------------------- Cleanup --------------------
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      if (applyTimerRef.current) clearTimeout(applyTimerRef.current);
    };
  }, []);

  // -------------------- RENDER --------------------
  return (
    <Container style={{ width: `${width}px` }}>
      <ResizeHandle ref={resizeRef} onMouseDown={handleMouseDown} />

      <Header>
        <HeaderContent>
          <HeaderTitle>Solana PG Assistant</HeaderTitle>
          <HeaderActions>
            <ClearButton onClick={handleClearChat}>Clear Chat</ClearButton>
            <CloseButton onClick={onClose} aria-label="Close Chat Sidebar">
              <CloseIcon />
            </CloseButton>
          </HeaderActions>
        </HeaderContent>
      </Header>

      {/* Chat History */}
      <ChatHistoryContainer ref={chatHistoryRef} onScroll={handleScroll}>
        {history.map((entry, index) => (
          <MessageGroup key={index}>
            {/* User Message */}
            <UserMessage>
              <Avatar>
                <UserAvatar>You</UserAvatar>
              </Avatar>
              <MessageContent>{entry.prompt}</MessageContent>
            </UserMessage>

            {/* AI Message */}
            <AIMessage>
              <Avatar>
                <SolanaLogo
                  src="/icons/platforms/Solana Logomark - Color.svg"
                  alt="Solana Logo"
                />
              </Avatar>
              {entry.response === "" && loadingMap[index] ? (
                <LoadingDots>
                  <span>.</span>
                  <span>.</span>
                  <span>.</span>
                </LoadingDots>
              ) : (
                <MessageContent>{formatMessage(entry.response)}</MessageContent>
              )}
            </AIMessage>
          </MessageGroup>
        ))}
      </ChatHistoryContainer>

      {/* Input Area */}
      <InputArea>
        <CodeContextToggle>
          <input
            type="checkbox"
            id="codeContextToggle"
            checked={useCodeContext}
            onChange={(e) => setUseCodeContext(e.target.checked)}
          />
          <span>Include Current Code Context</span>
        </CodeContextToggle>

        <TextArea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about the code or request changes..."
          // Allow typing even while responses are streaming
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />

        <SendButton onClick={handleSubmit} disabled={!input.trim()}>
          {Object.keys(loadingMap).length > 0 ? "Sending..." : "Send"}
        </SendButton>
      </InputArea>
    </Container>
  );
};

/* ==================== STYLED COMPONENTS ==================== */
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

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
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

const CloseButton = styled.button`
  padding: 6px;
  background: transparent;
  border: none;
  cursor: pointer;
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
  align-items: flex-start;
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
  display: flex;
  align-items: flex-start;
  justify-content: center;
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

const SolanaLogo = styled.img`
  width: 28px;
  height: 28px;
  border-radius: 50%;
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
  font-family: "Open Sans", "Helvetica Neue", sans-serif;
  font-size: 0.95rem;
  line-height: 1.4;
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
    0%,
    100% {
      opacity: 0.2;
    }
    50% {
      opacity: 1;
    }
  }
`;

export default ChatSidebar;
