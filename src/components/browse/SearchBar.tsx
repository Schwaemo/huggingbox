import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';

interface SearchBarProps {
  onSearch: (query: string) => void;
}

export default function SearchBar({ onSearch }: SearchBarProps) {
  const searchQuery = useAppStore((s) => s.searchQuery);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const [localValue, setLocalValue] = useState(searchQuery);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync external resets
  useEffect(() => {
    setLocalValue(searchQuery);
  }, [searchQuery]);

  function handleChange(value: string) {
    setLocalValue(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setSearchQuery(value);
      onSearch(value);
    }, 300);
  }

  function handleClear() {
    setLocalValue('');
    setSearchQuery('');
    onSearch('');
  }

  return (
    <div
      style={{
        position: 'relative',
        flex: 1,
        minWidth: 0,
      }}
    >
      <Search
        size={16}
        strokeWidth={1.5}
        style={{
          position: 'absolute',
          left: '12px',
          top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--text-muted)',
          pointerEvents: 'none',
          flexShrink: 0,
        }}
      />
      <input
        type="text"
        value={localValue}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Search models..."
        aria-label="Search Hugging Face models"
        style={{
          width: '100%',
          height: '36px',
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border)',
          borderRadius: '4px',
          padding: '0 36px 0 36px',
          fontFamily: '"Inter", sans-serif',
          fontSize: '14px',
          color: 'var(--text-primary)',
          outline: 'none',
          transition: 'border-color 150ms',
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'var(--accent-primary)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'var(--border)';
        }}
      />
      {localValue && (
        <button
          onClick={handleClear}
          aria-label="Clear search"
          style={{
            position: 'absolute',
            right: '8px',
            top: '50%',
            transform: 'translateY(-50%)',
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
          <X size={14} strokeWidth={1.5} />
        </button>
      )}
    </div>
  );
}
