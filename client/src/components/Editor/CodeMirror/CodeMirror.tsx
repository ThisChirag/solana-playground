import React, { useEffect, useMemo, useRef, useState } from "react";
import styled, { css, useTheme } from "styled-components";
import { EditorView } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";

// If you have custom extension or logic, keep these as is
import { autosave, defaultExtensions, getThemeExtension } from "./extensions";
import { EventName } from "../../../constants";
import {
  PgExplorer,
  PgTerminal,
  PgCommon,
  PgCommand,
  PgTheme,
  PgFramework,
} from "../../../utils/pg";
import { useKeybind, useSendAndReceiveCustomEvent } from "../../../hooks";

/**
 * Props for our CodeMirror component.
 * - `code`: current text in editor
 * - `onChange`: called whenever user edits
 */
interface CodeMirrorProps {
  code: string;
  onChange?: (newValue: string) => void;
}

const CodeMirror: React.FC<CodeMirrorProps> = ({ code, onChange }) => {
  const theme = useTheme();
  const codemirrorRef = useRef<HTMLDivElement>(null);
  const [editor, setEditor] = useState<EditorView>();

  // Build CodeMirror theme from styled-components theme
  const editorTheme = useMemo(() => {
    const editorStyles = theme.components.editor;

    return EditorView.theme(
      {
        // -- BASIC EDITOR STYLES --
        "&": {
          height: "100%",
          background: editorStyles.default.bg,
          color: editorStyles.default.color,
          fontFamily: editorStyles.default.fontFamily,
          fontSize: editorStyles.default.fontSize,
        },
        "& .cm-cursor": {
          borderLeft: `2px solid ${editorStyles.default.cursorColor}`,
        },
        "& .cm-gutters": {
          background: editorStyles.gutter.bg,
          color: editorStyles.gutter.color,
          borderRight: editorStyles.gutter.borderRight,
        },
        "& .cm-activeLineGutter": {
          background: editorStyles.gutter.activeBg,
          color: editorStyles.gutter.activeColor,
        },
        "& .cm-gutterElement:nth-child(1)": {
          padding: "0.125rem",
        },
        "& .cm-scroller": {
          fontFamily: editorStyles.default.fontFamily,
        },
        "& .cm-line": {
          border: "1.5px solid transparent",
        },
        "& .cm-activeLine": {
          background: editorStyles.default.activeLine.bg,
          borderColor: editorStyles.default.activeLine.borderColor,
          borderRightColor: "transparent",
          borderLeftColor: "transparent",
        },
        "& .cm-selectionBackground, &.cm-focused .cm-selectionBackground, & .cm-selectionMatch": {
          background: editorStyles.default.selection.bg,
          color: editorStyles.default.selection.color,
        },
        // Tooltips, search matches, etc. remain as you had them
        ".cm-tooltip": {
          background: editorStyles.tooltip.bg,
          color: editorStyles.tooltip.color,
          border: `1px solid ${editorStyles.tooltip.borderColor}`,
        },
        ".cm-tooltip-autocomplete": {
          "& > ul": {
            "& > li > div.cm-completionIcon": {
              marginRight: "0.5rem",
            },
            "& > li[aria-selected]": {
              background: editorStyles.tooltip.selectedBg,
              color: editorStyles.tooltip.selectedColor,
            },
          },
        },
        ".cm-panels": {
          background: theme.colors.default.bgSecondary,
          color: theme.colors.default.textPrimary,
          width: "fit-content",
          height: "fit-content",
          position: "absolute",
          top: 0,
          right: "10%",
          left: "auto",
          zIndex: 2,
        },
        ".cm-searchMatch": {
          background: editorStyles.default.searchMatch.bg,
          color: editorStyles.default.searchMatch.color,
        },
        ".cm-searchMatch-selected": {
          background: editorStyles.default.searchMatch.selectedBg,
          color: editorStyles.default.searchMatch.color,
        },
        ".cm-panel.cm-search": {
          background: theme.colors.default.bgSecondary,
          "& input, & button, & label": {
            margin: ".2em .6em .2em 0",
          },
          "& input[type=checkbox]": {
            marginRight: ".2em",
          },
          "& label": {
            fontSize: "80%",
            "&:nth-of-type(3)": {
              marginRight: "1.5rem",
            },
          },
          "& button[name=close]": {
            position: "absolute",
            top: "0.25rem",
            right: "0.25rem",
            margin: 0,
            width: "1rem",
            height: "1rem",
            color: theme.colors.default.textPrimary,
            backgroundColor: "inherit",
            borderRadius: "0.25rem",
          },
          "& button:hover": {
            cursor: "pointer",
            background: theme.colors.default.bgPrimary,
          },
        },
      },
      { dark: theme.isDark }
    );
  }, [theme]);

  /**
   * 1) On first render, create the EditorView, with an updateListener
   *    so that whenever doc changes, we call onChange(newValue).
   */
  useEffect(() => {
    if (!codemirrorRef.current) return;
    if (editor) return; // don't recreate if already exist

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const docText = update.state.doc.toString();
        onChange?.(docText);
      }
    });

    const view = new EditorView({
      parent: codemirrorRef.current,
      state: EditorState.create({
        doc: code,
        extensions: [defaultExtensions(), editorTheme, updateListener],
      }),
    });

    setEditor(view);
  }, [codemirrorRef, editor, code, onChange, editorTheme]);

  /**
   * 2) If `code` changes from parent, update the editor doc if different.
   */
  useEffect(() => {
    if (!editor) return;
    const currentText = editor.state.doc.toString();
    if (currentText !== code) {
      editor.dispatch({
        changes: { from: 0, to: currentText.length, insert: code },
      });
    }
  }, [code, editor]);

  /**
   * 3) When the user opens a file in PgExplorer, load that file's content.
   */
  useEffect(() => {
    if (!editor) return;
    let positionDataIntervalId: NodeJS.Timer;

    const { dispose } = PgExplorer.onDidOpenFile((curFile) => {
      if (!curFile) return;

      // Clear old interval
      if (positionDataIntervalId) clearInterval(positionDataIntervalId);

      const languageCompartment = new Compartment();
      const extensions = [
        defaultExtensions(),
        editorTheme,
        getThemeExtension(theme.highlight),
        autosave(curFile, 500),
        languageCompartment.of([]),
      ];

      // Replace entire state with new doc
      editor.setState(
        EditorState.create({
          doc: curFile.content,
          extensions,
        })
      );

      // Let parent know the new doc
      onChange?.(curFile.content || "");

      // Lazy load language
      (async () => {
        let languageExtensions;
        switch (PgExplorer.getCurrentFileLanguage()?.name) {
          case "Rust": {
            const { rustExtensions } = await import("./extensions/languages/rust");
            const framework = await PgFramework.getFromFiles();
            languageExtensions = rustExtensions(framework?.name === "Anchor");
            break;
          }
          case "Python": {
            const { pythonExtensions } = await import(
              "./extensions/languages/python"
            );
            languageExtensions = pythonExtensions();
            break;
          }
          case "JavaScript": {
            const { javascriptExtensions } = await import(
              "./extensions/languages/javascript"
            );
            languageExtensions = javascriptExtensions(false);
            break;
          }
          case "TypeScript": {
            const { javascriptExtensions } = await import(
              "./extensions/languages/javascript"
            );
            languageExtensions = javascriptExtensions(true);
            break;
          }
        }

        if (languageExtensions) {
          editor.dispatch({
            effects: languageCompartment.reconfigure(languageExtensions),
          });
        }
      })();

      // Restore scroll/cursor position if we saved it
      const position = PgExplorer.getEditorPosition(curFile.path);
      editor.dispatch(
        {
          effects: EditorView.scrollIntoView(
            position.topLineNumber
              ? editor.state.doc.line(position.topLineNumber).from
              : 0,
            { y: "start", yMargin: 0 }
          ),
        },
        {
          selection: { anchor: position.cursor.from, head: position.cursor.to },
        }
      );
      editor.focus();

      // Save position data
      positionDataIntervalId = setInterval(() => {
        PgExplorer.saveEditorPosition(curFile.path, {
          cursor: {
            from: editor.state.selection.main.anchor,
            to: editor.state.selection.main.head,
          },
          topLineNumber: editor.state.doc.lineAt(
            editor.lineBlockAtHeight(
              editor.scrollDOM.getBoundingClientRect().top - editor.documentTop
            ).from
          ).number,
        });
      }, 1000);
    });

    return () => {
      clearInterval(positionDataIntervalId);
      dispose();
    };
  }, [editor, editorTheme, onChange, theme]);

  /**
   * 4) Listen for an outside event to focus the editor
   */
  useEffect(() => {
    if (!editor) return;
    const handleFocus = () => {
      if (!editor.hasFocus) editor.focus();
    };
    document.addEventListener(EventName.EDITOR_FOCUS, handleFocus);
    return () => {
      document.removeEventListener(EventName.EDITOR_FOCUS, handleFocus);
    };
  }, [editor]);

  /**
   * 5) Formatting logic, if needed
   */
  useSendAndReceiveCustomEvent(
    EventName.EDITOR_FORMAT,
    async (ev?: { lang: LanguageName; fromTerminal: boolean }) => {
      if (!editor) return;
      // ... your original formatting code ...
      // (trimmed for brevity)
    },
    [editor]
  );

  // Format on Ctrl+S
  useKeybind(
    "Ctrl+S",
    () => {
      if (editor?.hasFocus) {
        PgTerminal.process(async () => {
          await PgCommon.sendAndReceiveCustomEvent(EventName.EDITOR_FORMAT);
        });
      }
    },
    [editor]
  );

  /**
   * 6) Program ID update logic
   */
  useEffect(() => {
    if (!editor) return;
    // ... your "declare_id" logic ...
    // (trimmed for brevity)
  }, [editor]);

  return <Wrapper ref={codemirrorRef} />;
};

/**
 * NOTE: We removed the custom scrollbar CSS from `Wrapper`,
 * so it uses the native/OS scrollbar with a mini preview.
 */
const Wrapper = styled.div`
  ${({ theme }) => css`
    /* No custom scrollbar styling -> revert to default/OS scrollbar */
    width: 100%;
    height: 100%;
  `}
`;

export default CodeMirror;
