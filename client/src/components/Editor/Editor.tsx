import { useEffect, lazy, Suspense, useState, useCallback } from "react";
import styled, { css } from "styled-components";

import { SpinnerWithBg } from "../Loading";
import { Id } from "../../constants";
import { PgCommon, PgExplorer, PgTheme } from "../../utils/pg";
import { ChatSidebar } from "./ChatSidebar/ChatSideBar";
import type * as Monaco from 'monaco-editor';
import { ChatErrorBoundary } from './ChatSidebar/ErrorBoundary';

const Home = lazy(() => import("./Home"));
const MonacoEditor = lazy(() => import("./Monaco"));

export const Editor = () => {
  const [showHome, setShowHome] = useState<boolean>();
  const [editor, setEditor] = useState<Monaco.editor.IStandaloneCodeEditor>();

  const getCurrentCode = useCallback(() => {
    if (!editor) return "";
    return editor.getValue();
  }, [editor]);

  const handleReplaceCode = useCallback((newCode: string) => {
    if (!editor) return;
    editor.setValue(newCode);
  }, [editor]);

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

  if (showHome === undefined) return null;

  return (
    <Suspense fallback={<SpinnerWithBg loading size="2rem" />}>
      <Wrapper>
        {showHome ? (
          <Home />
        ) : (
          <EditorContainer>
            <MonacoEditorContainer>
              <MonacoEditor 
                onMount={(editor: Monaco.editor.IStandaloneCodeEditor) => setEditor(editor)} 
              />
            </MonacoEditorContainer>

            <ChatErrorBoundary>
              <ChatSidebar 
                onReplaceCode={handleReplaceCode}
                getCurrentCode={getCurrentCode}
              />
            </ChatErrorBoundary>
          </EditorContainer>
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
const EditorContainer = styled.div`
  display: flex;
  flex-direction: row;
  height: 100%;
`;

const MonacoEditorContainer = styled.div`
  flex: 1;
  /* Additional styling if needed */
`;