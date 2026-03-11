import { useRef } from 'react';
import MonacoEditor, { type OnMount } from '@monaco-editor/react';
import { useAppStore } from '../../stores/appStore';

interface CodeEditorProps {
  code: string;
  fileName?: string;
  statusText?: string;
  onCodeChange?: (value: string) => void;
  readOnly?: boolean;
}

export default function CodeEditor({
  code,
  fileName = 'generated_code.py',
  statusText = 'Python',
  onCodeChange,
  readOnly = false,
}: CodeEditorProps) {
  const theme = useAppStore((s) => s.settings.theme);
  const setGeneratedCode = useAppStore((s) => s.setGeneratedCode);
  const setCodeSource = useAppStore((s) => s.setCodeSource);
  const editorRef = useRef<unknown>(null);

  const monacoTheme = theme === 'dark' ? 'vs-dark' : 'vs';

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

  function handleChange(value: string | undefined) {
    if (value === undefined) return;
    if (onCodeChange) {
      onCodeChange(value);
      return;
    }
    setGeneratedCode(value);
    setCodeSource('edited');
  }

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        height: '100%',
        backgroundColor: 'var(--bg-editor)',
      }}
    >
      {/* Editor toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 var(--space-lg)',
          height: '36px',
          backgroundColor: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: '12px',
            color: 'var(--text-muted)',
          }}
        >
          {fileName}
        </span>
        <span
          style={{
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: '11px',
            color: 'var(--text-muted)',
          }}
        >
          {statusText}
        </span>
      </div>

      {/* Monaco editor */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <MonacoEditor
          height="100%"
          language="python"
          theme={monacoTheme}
          value={code}
          onChange={handleChange}
          onMount={handleMount}
          options={{
            fontSize: 14,
            fontFamily: '"JetBrains Mono", monospace',
            fontLigatures: true,
            minimap: { enabled: false },
            lineNumbers: 'on',
            readOnly,
            tabSize: 4,
            insertSpaces: true,
            wordWrap: 'off',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            renderLineHighlight: 'line',
            scrollbar: {
              vertical: 'auto',
              horizontal: 'auto',
              verticalScrollbarSize: 6,
              horizontalScrollbarSize: 6,
            },
            padding: { top: 12, bottom: 12 },
            cursorBlinking: 'smooth',
            smoothScrolling: true,
            bracketPairColorization: { enabled: true },
          }}
        />
      </div>
    </div>
  );
}
