import { useState, useEffect, useMemo, useRef } from 'react';
import { Copy, CheckCheck, ChevronDown, ChevronRight, Terminal } from 'lucide-react';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../stores/appStore';
import { parseExecutionOutput } from '../../utils/outputParser';

interface OutputPanelProps {
  modelId: string;
  pipelineTag?: string | null;
  inputValue?: string;
}

interface ShellCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  cwd: string;
}

export default function OutputPanel({ modelId, pipelineTag, inputValue = '' }: OutputPanelProps) {
  const executionOutput = useAppStore((s) => s.executionOutput);
  const stderrOutput = useAppStore((s) => s.stderrOutput);
  const executionState = useAppStore((s) => s.executionState);
  const executionError = useAppStore((s) => s.executionError);
  const downloadStats = useAppStore((s) => s.downloadStats);
  const settings = useAppStore((s) => s.settings);
  const activeExecutionModelId = useAppStore((s) => s.activeExecutionModelId);
  const activeExecutionEnvModelId = useAppStore((s) => s.activeExecutionEnvModelId);
  const appendExecutionOutput = useAppStore((s) => s.appendExecutionOutput);
  const appendStderrOutput = useAppStore((s) => s.appendStderrOutput);

  const [stderrOpen, setStderrOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const [terminalInput, setTerminalInput] = useState('');
  const [terminalBusy, setTerminalBusy] = useState(false);
  const [terminalCwd, setTerminalCwd] = useState<string | null>(null);
  const [hasTerminalActivity, setHasTerminalActivity] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isRunning = executionState === 'running' || executionState === 'installing';
  const hasOutput = executionOutput.length > 0;
  const envModelIdForTerminal =
    activeExecutionModelId === modelId && activeExecutionEnvModelId
      ? activeExecutionEnvModelId
      : modelId;
  const parsed = parseExecutionOutput(executionOutput, pipelineTag);
  const imageSource = useMemo(() => {
    if (inputValue.startsWith('__HBIMG__:')) return inputValue.slice('__HBIMG__:'.length);
    if (inputValue.startsWith('data:image/')) return inputValue;
    return '';
  }, [inputValue]);

  function renderStructuredOutput() {
    if (parsed.kind === 'audio_transcript' && parsed.data && typeof parsed.data === 'object') {
      const transcript = parsed.data as {
        text?: string;
        chunks?: Array<{ text?: string; timestamp?: [number | null, number | null] | null }>;
      };
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div
            style={{
              fontFamily: '"Inter", sans-serif',
              fontSize: '14px',
              color: 'var(--text-primary)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {transcript.text?.trim() || executionOutput}
          </div>
          {Array.isArray(transcript.chunks) && transcript.chunks.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {transcript.chunks.map((chunk, idx) => {
                const start = chunk.timestamp?.[0];
                const end = chunk.timestamp?.[1];
                const range =
                  start !== undefined && start !== null
                    ? `${Number(start).toFixed(2)}s${end !== undefined && end !== null ? ` -> ${Number(end).toFixed(2)}s` : ''}`
                    : null;
                return (
                  <div
                    key={`chunk-${idx}`}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      padding: '8px',
                      backgroundColor: 'var(--bg-secondary)',
                    }}
                  >
                    {range && (
                      <div
                        style={{
                          fontFamily: '"JetBrains Mono", monospace',
                          fontSize: '11px',
                          color: 'var(--text-muted)',
                          marginBottom: '4px',
                        }}
                      >
                        {range}
                      </div>
                    )}
                    <div
                      style={{
                        fontFamily: '"Inter", sans-serif',
                        fontSize: '13px',
                        color: 'var(--text-secondary)',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {chunk.text?.trim() || '(no text)'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    if (parsed.kind === 'audio_file' && typeof parsed.data === 'string' && parsed.data.trim()) {
      const audioPath = parsed.data.trim();
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <audio controls src={convertFileSrc(audioPath)} style={{ width: '100%' }} />
          <div
            style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: '11px',
              color: 'var(--text-muted)',
              wordBreak: 'break-all',
            }}
          >
            {audioPath}
          </div>
        </div>
      );
    }

    if (parsed.kind === 'classification' && Array.isArray(parsed.data)) {
      const items = [...parsed.data]
        .filter((x) => x && typeof x === 'object')
        .map((x) => x as { label?: string; score?: number })
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {pipelineTag === 'image-classification' && imageSource && (
            <img
              src={imageSource}
              alt="Classification input"
              style={{ maxHeight: '180px', objectFit: 'contain', borderRadius: '4px', border: '1px solid var(--border)' }}
            />
          )}
          {items.map((item, idx) => {
            const score = Math.max(0, Math.min(1, item.score ?? 0));
            return (
              <div key={`${item.label ?? 'label'}-${idx}`} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 56px', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontFamily: '"Inter", sans-serif', fontSize: '13px', color: 'var(--text-primary)' }}>{item.label ?? 'unknown'}</span>
                <div style={{ height: '8px', borderRadius: '999px', backgroundColor: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                  <div style={{ width: `${score * 100}%`, height: '100%', backgroundColor: idx === 0 ? 'var(--accent-primary)' : 'var(--text-muted)' }} />
                </div>
                <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '12px', color: 'var(--text-secondary)' }}>{(score * 100).toFixed(1)}%</span>
              </div>
            );
          })}
        </div>
      );
    }

    if (parsed.kind === 'detection' && Array.isArray(parsed.data)) {
      const detections = parsed.data as Array<{
        label?: string;
        score?: number;
        box?: { xmin?: number; ymin?: number; xmax?: number; ymax?: number };
      }>;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {imageSource && (
            <div style={{ border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
              <img src={imageSource} alt="Detection input" style={{ width: '100%', maxHeight: '220px', objectFit: 'contain' }} />
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {detections.map((d, idx) => (
              <div key={`${d.label ?? 'det'}-${idx}`} style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '12px' }}>
                {d.label ?? 'object'} {(Math.max(0, Math.min(1, d.score ?? 0)) * 100).toFixed(1)}%
                {d.box ? ` • [${d.box.xmin ?? 0}, ${d.box.ymin ?? 0}] -> [${d.box.xmax ?? 0}, ${d.box.ymax ?? 0}]` : ''}
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (parsed.kind === 'segmentation') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {imageSource && (
            <img src={imageSource} alt="Segmentation input" style={{ maxHeight: '180px', objectFit: 'contain', borderRadius: '4px', border: '1px solid var(--border)' }} />
          )}
          <span style={{ fontFamily: '"Inter", sans-serif', fontSize: '13px', color: 'var(--text-secondary)' }}>
            Segmentation output received.
          </span>
        </div>
      );
    }

    if (parsed.kind === 'depth') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {imageSource && (
            <img src={imageSource} alt="Depth input" style={{ maxHeight: '180px', objectFit: 'contain', borderRadius: '4px', border: '1px solid var(--border)' }} />
          )}
          <span style={{ fontFamily: '"Inter", sans-serif', fontSize: '13px', color: 'var(--text-secondary)' }}>
            Depth-estimation output received.
          </span>
        </div>
      );
    }

    if (parsed.kind === 'summarization') {
      const result = Array.isArray(parsed.data) ? parsed.data[0] : parsed.data;
      const summary = (result as { summary_text?: string })?.summary_text ?? executionOutput;
      const cleanInput = inputValue.startsWith('__HBJSON__:') ? '' : inputValue;
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div style={{ borderRight: '1px solid var(--border)', paddingRight: '12px', color: 'var(--text-secondary)' }}>
            {cleanInput || 'No input captured.'}
          </div>
          <div style={{ paddingLeft: '12px', color: 'var(--text-primary)' }}>{summary}</div>
        </div>
      );
    }

    if (parsed.kind === 'embedding') {
      let vector: number[] = [];
      if (Array.isArray(parsed.data) && typeof parsed.data[0] === 'number') vector = parsed.data as number[];
      else if (Array.isArray(parsed.data) && Array.isArray(parsed.data[0])) vector = parsed.data[0] as number[];
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '12px', color: 'var(--text-secondary)' }}>
            Dimensions: {vector.length}
          </span>
          <code style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '12px', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
            [{vector.slice(0, 10).map((v) => Number(v).toFixed(4)).join(', ')}{vector.length > 10 ? ', ...' : ''}]
          </code>
        </div>
      );
    }

    if (parsed.kind === 'qa' && parsed.data && typeof parsed.data === 'object') {
      const qa = parsed.data as { answer?: string; score?: number };
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontFamily: '"Inter", sans-serif', fontSize: '14px', color: 'var(--text-primary)' }}>
            {qa.answer ?? executionOutput}
          </div>
          {qa.score !== undefined && (
            <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '12px', color: 'var(--text-muted)' }}>
              Confidence: {(qa.score * 100).toFixed(1)}%
            </span>
          )}
        </div>
      );
    }

    if (parsed.kind === 'ner' && Array.isArray(parsed.data)) {
      const entities = parsed.data as Array<{ word?: string; entity_group?: string; score?: number }>;
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {entities.map((e, idx) => (
            <span key={`${e.word ?? 'entity'}-${idx}`} style={{ border: '1px solid var(--border)', borderRadius: '4px', padding: '4px 8px', fontFamily: '"JetBrains Mono", monospace', fontSize: '12px' }}>
              {e.word ?? '?'} <b style={{ color: 'var(--accent-primary)' }}>{e.entity_group ?? 'ENTITY'}</b>
            </span>
          ))}
        </div>
      );
    }

    return null;
  }

  const hasStderr = stderrOutput.length > 0;
  const isDownloading = executionState === 'downloading';

  function formatBytes(bytes: number): string {
    if (bytes <= 0) return '0 B';
    const gb = bytes / 1024 ** 3;
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    const mb = bytes / 1024 ** 2;
    if (mb >= 1) return `${mb.toFixed(1)} MB`;
    return `${Math.round(bytes / 1024)} KB`;
  }

  function formatMB(bytes: number): string {
    if (bytes <= 0) return '0.0 MB';
    return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  }

  // Auto-scroll to bottom as output streams in
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [executionOutput]);

  useEffect(() => {
    if (!executionOutput) {
      setHasTerminalActivity(false);
    }
  }, [executionOutput]);

  function handleCopy() {
    navigator.clipboard.writeText(executionOutput).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleTerminalRun() {
    const command = terminalInput.trim();
    if (!command || terminalBusy) return;

    setTerminalBusy(true);
    setHasTerminalActivity(true);
    appendExecutionOutput(`\n$ ${command}\n`);

    try {
      const result = await invoke<ShellCommandResult>('run_model_shell_command', {
        modelId,
        venvModelId: envModelIdForTerminal,
        command,
        modelStoragePath: settings.modelStoragePath || null,
        envStoragePath: settings.envStoragePath || null,
        cwd: terminalCwd,
        hfToken: settings.hfToken || null,
      });

      setTerminalCwd(result.cwd || terminalCwd);
      if (result.stdout) appendExecutionOutput(result.stdout.endsWith('\n') ? result.stdout : `${result.stdout}\n`);
      if (result.stderr) appendStderrOutput(result.stderr.endsWith('\n') ? result.stderr : `${result.stderr}\n`);
      appendExecutionOutput(`[shell exit ${result.exitCode}] cwd=${result.cwd || terminalCwd || '<unknown>'}\n`);
    } catch (error) {
      appendStderrOutput(`${String(error)}\n`);
      appendExecutionOutput('[shell exit -1]\n');
    } finally {
      setTerminalBusy(false);
      setTerminalInput('');
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        backgroundColor: 'var(--bg-primary)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 var(--space-md)',
          height: '36px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
          backgroundColor: 'var(--bg-secondary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
          <Terminal size={13} strokeWidth={1.5} color="var(--text-muted)" />
          <span
            style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: '11px',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            Output
          </span>
          {executionState === 'completed' && (
            <span
              style={{
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: '10px',
                color: 'var(--success)',
                marginLeft: '4px',
              }}
            >
              ✓ done
            </span>
          )}
          {executionState === 'error' && (
            <span
              style={{
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: '10px',
                color: 'var(--error)',
                marginLeft: '4px',
              }}
            >
              ✗ error
            </span>
          )}
          {executionState === 'cancelled' && (
            <span
              style={{
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: '10px',
                color: 'var(--text-muted)',
                marginLeft: '4px',
              }}
            >
              ■ cancelled
            </span>
          )}
        </div>
        {hasOutput && (
          <button
            onClick={handleCopy}
            title="Copy output"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              padding: '4px',
              borderRadius: '2px',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
            }}
          >
            {copied ? <CheckCheck size={13} strokeWidth={1.5} /> : <Copy size={13} strokeWidth={1.5} />}
          </button>
        )}
      </div>

      {/* stdout area */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 'var(--space-md)',
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: '13px',
          color: 'var(--text-primary)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          lineHeight: 1.6,
        }}
      >
        {isDownloading && downloadStats && (
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: 'var(--space-sm)',
              marginBottom: 'var(--space-md)',
              backgroundColor: 'var(--bg-secondary)',
            }}
          >
            <div
              style={{
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: '11px',
                color: 'var(--text-secondary)',
                marginBottom: '6px',
              }}
            >
              Downloading model... {Math.max(0, Math.min(100, downloadStats.percent)).toFixed(1)}%
            </div>
            <div
              style={{
                width: '100%',
                height: '8px',
                borderRadius: '999px',
                backgroundColor: 'var(--bg-tertiary)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${Math.max(0, Math.min(100, downloadStats.percent))}%`,
                  height: '100%',
                  backgroundColor: 'var(--accent-primary)',
                  transition: 'width 200ms',
                }}
              />
            </div>
            <div
              style={{
                marginTop: '6px',
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: '11px',
                color: 'var(--text-muted)',
              }}
            >
              {downloadStats.totalBytes > 0
                ? `${formatBytes(downloadStats.downloadedBytes)} / ${formatBytes(downloadStats.totalBytes)}`
                : `Size unknown${downloadStats.filesTotal > 0 ? ` • ${downloadStats.filesDone}/${downloadStats.filesTotal} files` : ''}`}
              {`  •  ${formatMB(downloadStats.downloadedBytes)} downloaded`}
              {downloadStats.speedBps > 0 ? `  •  ${formatBytes(downloadStats.speedBps)}/s` : ''}
              {downloadStats.totalBytes > 0 && downloadStats.etaSeconds !== null
                ? `  •  ETA ${Math.max(0, Math.round(downloadStats.etaSeconds))}s`
                : ''}
            </div>
          </div>
        )}
        {!hasOutput && !isRunning && (
          <span
            style={{
              color: 'var(--text-muted)',
              fontFamily: '"Inter", sans-serif',
              fontSize: '13px',
            }}
          >
            No output yet. Click Run to execute the code.
          </span>
        )}
        {isRunning && !hasOutput && (
          <span style={{ color: 'var(--text-muted)', fontFamily: '"Inter", sans-serif', fontSize: '13px' }}>
            {executionState === 'installing' ? 'Installing packages...' : 'Running...'}
          </span>
        )}
        {!hasOutput && executionState === 'error' && executionError && (
          <span
            style={{
              color: 'var(--error)',
              fontFamily: '"Inter", sans-serif',
              fontSize: '13px',
            }}
          >
            {executionError}
          </span>
        )}
        {hasTerminalActivity ? executionOutput : (renderStructuredOutput() ?? executionOutput)}
        {isRunning && (
          <span
            style={{
              display: 'inline-block',
              width: '8px',
              animation: 'cursorBlink 1s step-end infinite',
              color: 'var(--accent-primary)',
            }}
          >
            ▋
          </span>
        )}
      </div>

      <div
        style={{
          flexShrink: 0,
          borderTop: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px var(--space-md)',
          backgroundColor: 'var(--bg-secondary)',
        }}
      >
        <span
          style={{
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: '12px',
            color: 'var(--text-muted)',
          }}
        >
          $
        </span>
        <input
          type="text"
          value={terminalInput}
          disabled={terminalBusy}
          onChange={(e) => setTerminalInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void handleTerminalRun();
            }
          }}
          placeholder={`Run command in ${envModelIdForTerminal} environment`}
          style={{
            flex: 1,
            height: '28px',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            padding: '0 8px',
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: '12px',
            outline: 'none',
          }}
        />
        <button
          onClick={() => {
            void handleTerminalRun();
          }}
          disabled={terminalBusy || !terminalInput.trim()}
          style={{
            height: '28px',
            padding: '0 10px',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            backgroundColor: 'var(--bg-tertiary)',
            color: terminalBusy ? 'var(--text-muted)' : 'var(--text-primary)',
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: '12px',
            cursor: terminalBusy ? 'default' : 'pointer',
          }}
        >
          {terminalBusy ? '...' : 'Run'}
        </button>
      </div>

      {/* stderr collapsible section */}
      {hasStderr && (
        <div style={{ flexShrink: 0, borderTop: '1px solid var(--border)' }}>
          <button
            onClick={() => setStderrOpen((v) => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              width: '100%',
              padding: '6px var(--space-md)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--success)',
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            {stderrOpen
              ? <ChevronDown size={12} strokeWidth={1.5} />
              : <ChevronRight size={12} strokeWidth={1.5} />
            }
            Console
          </button>
          {stderrOpen && (
            <div
              style={{
                maxHeight: '180px',
                overflowY: 'auto',
                padding: 'var(--space-sm) var(--space-md)',
                backgroundColor: 'rgba(16,185,129,0.10)',
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: '12px',
                color: 'var(--success)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                lineHeight: 1.5,
              }}
            >
              {stderrOutput}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
