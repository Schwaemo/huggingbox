import { useAppStore } from '../../stores/appStore';

function formatRam(bytes: number): string {
  return (bytes / (1024 ** 3)).toFixed(1);
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export default function StatusBar() {
  const systemInfo = useAppStore((s) => s.systemInfo);
  const executionState = useAppStore((s) => s.executionState);
  const executionElapsed = useAppStore((s) => s.executionElapsed);
  function getPythonStatus(): { label: string; color: string } {
    if (executionState === 'installing') {
      return { label: 'Installing packages...', color: 'var(--warning)' };
    }
    if (!systemInfo.pythonReady) {
      return { label: 'Environment Error', color: 'var(--error)' };
    }
    return { label: 'Python Ready', color: 'var(--success)' };
  }

  const pythonStatus = getPythonStatus();


  const usedRam = systemInfo.totalRam - systemInfo.availableRam;

  function getExecutionLabel(): string {
    switch (executionState) {
      case 'running':
        return `Running... ${formatElapsed(executionElapsed)}`;
      case 'installing':
        return 'Installing packages...';
      case 'downloading':
        return 'Downloading model...';
      case 'completed':
        return `Completed (${formatElapsed(executionElapsed)})`;
      case 'error':
        return 'Error';
      case 'cancelled':
        return 'Cancelled';
      default:
        return 'Idle';
    }
  }

  function getExecutionColor(): string {
    switch (executionState) {
      case 'running':
      case 'installing':
      case 'downloading':
        return 'var(--accent-primary)';
      case 'completed':
        return 'var(--success)';
      case 'error':
        return 'var(--error)';
      default:
        return 'var(--text-secondary)';
    }
  }

  const mono: React.CSSProperties = {
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '12px',
    color: 'var(--text-secondary)',
  };

  const divider = (
    <span style={{ color: 'var(--border)', margin: '0 var(--space-sm)' }}>|</span>
  );

  return (
    <footer
      style={{
        height: '28px',
        minHeight: '28px',
        backgroundColor: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 var(--space-lg)',
        gap: 0,
        flexShrink: 0,
      }}
      aria-live="polite"
      aria-label="Status bar"
    >
      {/* RAM */}
      <span style={mono}>
        RAM:{' '}
        {systemInfo.totalRam > 0 ? (
          <>
            {formatRam(usedRam)}/{formatRam(systemInfo.totalRam)} GB
          </>
        ) : (
          '...'
        )}
      </span>

      {divider}

      {/* GPU */}
      <span style={mono}>
        {systemInfo.gpuName
          ? `GPU: ${systemInfo.gpuName}${systemInfo.gpuVram ? ` ${systemInfo.gpuVram}GB` : ''}`
          : 'No GPU detected'}
      </span>

      {divider}

      {/* Execution state — center */}
      <span style={{ ...mono, flex: 1, textAlign: 'center', color: getExecutionColor() }}>
        {getExecutionLabel()}
      </span>

      {/* Python env status — right */}
      <span style={{ ...mono, color: pythonStatus.color }}>
        {pythonStatus.label}
      </span>
    </footer>
  );
}
