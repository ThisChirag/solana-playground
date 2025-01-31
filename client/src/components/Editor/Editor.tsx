import { useEffect, lazy, Suspense, useState, useCallback } from "react";
import styled, { css } from "styled-components";

import { SpinnerWithBg } from "../Loading";
import { Id } from "../../constants";
import { PgCommon, PgExplorer, PgTheme } from "../../utils/pg";
import { ChatSidebar } from "./ChatSidebar/ChatSideBar";
import { ChatErrorBoundary } from "./ChatSidebar/ErrorBoundary";
import CodeMirror from "./CodeMirror/CodeMirror";
import { Edit as MessageIcon } from "../../components/Icons";

const Home = lazy(() => import("./Home"));

export const Editor = () => {
  const [showHome, setShowHome] = useState<boolean>();
  // We'll keep code in state and pass it to CodeMirror as a controlled value
  const [code, setCode] = useState("");
  const [currentFilePath, setCurrentFilePath] = useState("");
  const [chatWidth, setChatWidth] = useState(400);
  const [isChatVisible, setIsChatVisible] = useState(true);

  // Provide the current code to the ChatSidebar
  const getCurrentCode = useCallback(() => code, [code]);

  // When ChatSidebar wants to replace code, we update state
  const handleReplaceCode = useCallback((newCode: string) => {
    setCode(newCode);
  }, []);

  // Decide which view to show (Home or Editor)
  useEffect(() => {
    const { dispose } = PgExplorer.onNeedRender(
      PgCommon.debounce(() => setShowHome(!PgExplorer.tabs.length), { delay: 50 })
    );
    return dispose;
  }, []);

  // Save explorer metadata
  useEffect(() => {
    // Save metadata to IndexedDB every 5s
    const saveMetadataIntervalId = PgCommon.setIntervalOnFocus(() => {
      PgExplorer.saveMeta().catch();
    }, 5000);

    return () => clearInterval(saveMetadataIntervalId);
  }, []);

  // Listen for file-open events in PgExplorer
  useEffect(() => {
    const { dispose } = PgExplorer.onDidOpenFile((file) => {
      if (file) {
        setCurrentFilePath(file.path);
        setCode(file.content || "");
      }
    });

    return () => dispose();
  }, []);

  // Toggle the chat sidebar open/close
  const toggleChat = useCallback(() => {
    setIsChatVisible((prev) => !prev);
  }, []);

  if (showHome === undefined) {
    return null; // Not yet decided
  }

  return (
    <Suspense fallback={<SpinnerWithBg loading size="2rem" />}>
      <Wrapper>
        {showHome ? (
          <Home />
        ) : (
          <StyledEditorContainer>
            <StyledEditorContent
              style={{ width: isChatVisible ? `calc(100% - ${chatWidth}px)` : "100%" }}
            >
              {/*
                Use the CodeMirror component in a controlled way:
                - Pass `code` (the current editor text from state)
                - Pass `onChange` so we update state whenever user types
              */}
              <CodeMirror code={code} onChange={setCode} />

              <StyledChatToggleButton onClick={toggleChat} $isVisible={isChatVisible}>
                <MessageIcon />
              </StyledChatToggleButton>
            </StyledEditorContent>

            {isChatVisible && (
              <ChatErrorBoundary>
                <ChatSidebar
                  onReplaceCode={handleReplaceCode}
                  getCurrentCode={getCurrentCode}
                  currentFilePath={currentFilePath}
                  width={chatWidth}
                  onWidthChange={setChatWidth}
                  onClose={() => setIsChatVisible(false)}
                />
              </ChatErrorBoundary>
            )}
          </StyledEditorContainer>
        )}
      </Wrapper>
    </Suspense>
  );
};

/* -- STYLES -- */
const Wrapper = styled.div`
  ${({ theme }) => css`
    width: 100%;
    height: 100%;
    overflow: auto;

    &:has(> #${Id.HOME}) {
      background: ${theme.views.main.primary.home.default.bg ??
      theme.views.main.default.bg};
    }

    ${PgTheme.convertToCSS(theme.components.editor.wrapper)};
  `}
`;

const StyledEditorContainer = styled.div`
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;
`;

const StyledEditorContent = styled.div`
  height: 100%;
  overflow: auto;
  transition: width 0.3s ease;
  position: relative;
`;

const StyledChatToggleButton = styled.button<{ $isVisible: boolean }>`
  position: absolute;
  top: 12px;
  right: 12px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${({ theme }) => theme.colors.default.bgSecondary};
  border: 1px solid ${({ theme }) => theme.colors.default.border};
  border-radius: 4px;
  cursor: pointer;
  z-index: 10;
  transition: all 0.2s ease;
  opacity: ${({ $isVisible }) => ($isVisible ? 0 : 1)};

  &:hover {
    background: ${({ theme }) => theme.colors.default.bgPrimary};
  }

  svg {
    width: 16px;
    height: 16px;
    color: ${({ theme }) => theme.colors.default.textPrimary};
  }
`;

export default Editor;
