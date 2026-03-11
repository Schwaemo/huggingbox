import { Folder, FileCode2, RefreshCw, FilePlus2, FolderPlus, ChevronLeft } from 'lucide-react';
import type { ModelWorkspaceEntry } from '../../services/modelWorkspace';

interface FileExplorerProps {
  currentDirectory: string;
  entries: ModelWorkspaceEntry[];
  loading: boolean;
  selectedFilePath: string | null;
  error: string | null;
  onOpenDirectory: (relativePath: string) => void;
  onSelectFile: (relativePath: string) => void;
  onRefresh: () => void;
  onCreateFile: () => void;
  onCreateFolder: () => void;
  onNavigateUp: () => void;
}

function prettySize(bytes: number | null): string {
  if (bytes === null || bytes <= 0) return '';
  if (bytes > 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes > 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export default function FileExplorer({
  currentDirectory,
  entries,
  loading,
  selectedFilePath,
  error,
  onOpenDirectory,
  onSelectFile,
  onRefresh,
  onCreateFile,
  onCreateFolder,
  onNavigateUp,
}: FileExplorerProps) {
  const canNavigateUp = Boolean(currentDirectory);

  return (
    <aside
      style={{
        width: '230px',
        minWidth: '190px',
        borderRight: '1px solid var(--border)',
        backgroundColor: 'var(--bg-secondary)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: '36px',
          borderBottom: '1px solid var(--border)',
          padding: '0 var(--space-sm)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '6px',
        }}
      >
        <span
          style={{
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: '11px',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Explorer
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          <button
            onClick={onCreateFile}
            title="New file"
            style={iconButtonStyle}
          >
            <FilePlus2 size={13} strokeWidth={1.5} />
          </button>
          <button
            onClick={onCreateFolder}
            title="New folder"
            style={iconButtonStyle}
          >
            <FolderPlus size={13} strokeWidth={1.5} />
          </button>
          <button
            onClick={onRefresh}
            title="Refresh"
            style={iconButtonStyle}
          >
            <RefreshCw size={13} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      <div
        style={{
          height: '30px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '0 var(--space-sm)',
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: '11px',
          color: 'var(--text-secondary)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        <button
          onClick={onNavigateUp}
          disabled={!canNavigateUp}
          title="Up"
          style={{
            ...iconButtonStyle,
            width: '20px',
            height: '20px',
            cursor: canNavigateUp ? 'pointer' : 'default',
            opacity: canNavigateUp ? 1 : 0.45,
          }}
        >
          <ChevronLeft size={12} strokeWidth={1.5} />
        </button>
        <span title={currentDirectory || '/'}>{currentDirectory || '/'}</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '6px' }}>
        {loading && (
          <div style={statusStyle}>Loading files...</div>
        )}
        {!loading && error && (
          <div style={{ ...statusStyle, color: 'var(--warning)' }}>{error}</div>
        )}
        {!loading && !error && entries.length === 0 && (
          <div style={statusStyle}>No files in this folder.</div>
        )}
        {!loading && !error && entries.map((entry) => {
          const isSelected = !entry.isDir && selectedFilePath === entry.relativePath;
          return (
            <button
              key={`${entry.relativePath}-${entry.isDir ? 'dir' : 'file'}`}
              onClick={() => {
                if (entry.isDir) onOpenDirectory(entry.relativePath);
                else onSelectFile(entry.relativePath);
              }}
              title={entry.relativePath}
              style={{
                width: '100%',
                border: 'none',
                backgroundColor: isSelected ? 'var(--bg-tertiary)' : 'transparent',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '6px',
                padding: '6px 8px',
                color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: '12px',
                textAlign: 'left',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                {entry.isDir ? (
                  <Folder size={13} strokeWidth={1.5} />
                ) : (
                  <FileCode2 size={13} strokeWidth={1.5} />
                )}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entry.name}
                </span>
              </span>
              {!entry.isDir && (
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0 }}>
                  {prettySize(entry.sizeBytes)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </aside>
  );
}

const iconButtonStyle: React.CSSProperties = {
  width: '24px',
  height: '24px',
  border: '1px solid var(--border)',
  backgroundColor: 'transparent',
  borderRadius: '4px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--text-muted)',
  cursor: 'pointer',
};

const statusStyle: React.CSSProperties = {
  padding: '8px',
  fontFamily: '"Inter", sans-serif',
  fontSize: '12px',
  color: 'var(--text-muted)',
};

