import { useEffect, lazy, Suspense, useState, useCallback, useRef } from "react";
import styled, { css } from "styled-components";

import { SpinnerWithBg } from "../Loading";
import { Id } from "../../constants";
import { PgCommon, PgExplorer, PgTheme } from "../../utils/pg";
import { ChatSidebar } from "./ChatSidebar/ChatSideBar";
import type * as Monaco from 'monaco-editor';
import { ChatErrorBoundary } from './ChatSidebar/ErrorBoundary';
import CodeMirror from "./CodeMirror/CodeMirror";
import { Edit as MessageIcon, Close as CloseIcon } from "../../components/Icons";
import { EditorView } from "@codemirror/view";

const Home = lazy(() => import("./Home"));
const MonacoEditor = lazy(() => import("./Monaco"));

export const Editor = () => {
  const [showHome, setShowHome] = useState<boolean>();
  const [editor, setEditor] = useState<Monaco.editor.IStandaloneCodeEditor>();
  const [code, setCode] = useState("");
  const [currentFilePath, setCurrentFilePath] = useState("");
  const [chatWidth, setChatWidth] = useState(400);
  const [isChatVisible, setIsChatVisible] = useState(true);
  const editorRef = useRef<EditorView | null>(null);

  const getCurrentCode = useCallback(() => code, [code]);

  const handleReplaceCode = useCallback((newCode: string) => {
    setCode(newCode);
    if (editorRef.current) {
      editorRef.current.dispatch({
        changes: {
          from: 0,
          to: editorRef.current.state.doc.length,
          insert: newCode
        }
      });
    }
  }, []);

  // Decide which editor to show
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

  useEffect(() => {
    // Subscribe to file changes
    const { dispose } = PgExplorer.onDidOpenFile((file) => {
      if (file) {
        setCurrentFilePath(file.path);
        setCode(file.content || "");
      }
    });

    return () => dispose();
  }, []);

  const toggleChat = useCallback(() => {
    setIsChatVisible(prev => !prev);
  }, []);

  if (showHome === undefined) return null;

  return (
    <Suspense fallback={<SpinnerWithBg loading size="2rem" />}>
      <Wrapper>
        {showHome ? (
          <Home />
        ) : (
          <StyledEditorContainer>
            <StyledEditorContent style={{ width: isChatVisible ? `calc(100% - ${chatWidth}px)` : '100%' }}>
              <CodeMirror />
              <StyledChatToggleButton onClick={toggleChat} $isVisible={isChatVisible}>
                <MessageIcon />
              </StyledChatToggleButton>
            </StyledEditorContent>
            
            {isChatVisible && (
              <ChatSidebar 
                onReplaceCode={handleReplaceCode}
                getCurrentCode={getCurrentCode}
                currentFilePath={currentFilePath}
                width={chatWidth}
                onWidthChange={setChatWidth}
                onClose={() => setIsChatVisible(false)}
              />
            )}
          </StyledEditorContainer>
        )}
      </Wrapper>
    </Suspense>
  );
};

const Wrapper = styled.div`
  ${({ theme }) => css`
    width: 100%;
    height: 100%;
    overflow: auto;

    /**
     * Changing the home background only changes the part that is in view and
     * the remaining parts still have 'main.default.bg' which causes problem if
     * they are different. This selector selects the current element when home
     * is in view and sets the background to 'home.default.bg'.
     *
     * The reason we are setting the background in this element is also partly
     * due to Monaco editor's incompatibility with background-image property.
     * We are able to solve this problem by seting the editor's background to
     * transparent and set this(wrapper) element's background to background-image.
     */
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