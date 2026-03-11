import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface Option {
  label: string;
  value: string;
}

interface FilterDropdownProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function FilterDropdown({
  options,
  value,
  onChange,
  placeholder = 'Filter...',
}: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);
  const label = selected ? selected.label : placeholder;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open]);

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', flexShrink: 0 }}
      role="combobox"
      aria-expanded={open}
      aria-haspopup="listbox"
    >
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          height: '36px',
          padding: '0 10px 0 12px',
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border)',
          borderRadius: '4px',
          color: value ? 'var(--text-primary)' : 'var(--text-secondary)',
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: '13px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          whiteSpace: 'nowrap',
          transition: 'border-color 150ms',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent-primary)';
        }}
        onMouseLeave={(e) => {
          if (!open) (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
        }}
      >
        {label}
        <ChevronDown
          size={14}
          strokeWidth={1.5}
          style={{
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 100ms',
            color: 'var(--text-muted)',
          }}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            minWidth: '100%',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            boxShadow: 'var(--shadow)',
            zIndex: 50,
            padding: '4px 0',
            margin: 0,
            listStyle: 'none',
            animation: 'fadeIn 100ms ease',
          }}
        >
          {options.map((opt) => (
            <li
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              style={{
                padding: '6px 12px',
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: '13px',
                color: opt.value === value ? 'var(--accent-primary)' : 'var(--text-primary)',
                cursor: 'pointer',
                backgroundColor: opt.value === value ? 'var(--bg-tertiary)' : 'transparent',
                transition: 'background-color 100ms',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-tertiary)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor =
                  opt.value === value ? 'var(--bg-tertiary)' : 'transparent';
              }}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}

      <style>{`@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }`}</style>
    </div>
  );
}
