import type { ReactNode, CSSProperties } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps {
  children: ReactNode;
  variant?: ButtonVariant;
  onClick?: () => void;
  disabled?: boolean;
  icon?: ReactNode;
  style?: CSSProperties;
  type?: 'button' | 'submit' | 'reset';
  'aria-label'?: string;
  href?: string;
  target?: string;
  rel?: string;
}

const BASE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  height: '36px',
  padding: '0 16px',
  borderRadius: '4px',
  fontSize: '13px',
  fontWeight: 500,
  fontFamily: '"JetBrains Mono", monospace',
  cursor: 'pointer',
  border: '1px solid transparent',
  transition: 'background-color 150ms, border-color 150ms, color 150ms',
  textDecoration: 'none',
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

const VARIANTS: Record<ButtonVariant, CSSProperties> = {
  primary: {
    backgroundColor: 'var(--accent-primary)',
    color: '#FFFFFF',
    border: '1px solid var(--accent-primary)',
  },
  secondary: {
    backgroundColor: 'transparent',
    color: 'var(--accent-primary)',
    border: '1px solid var(--accent-primary)',
  },
  ghost: {
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
    border: '1px solid transparent',
  },
  danger: {
    backgroundColor: 'var(--error)',
    color: '#FFFFFF',
    border: '1px solid var(--error)',
  },
};

const HOVER_STYLES: Record<ButtonVariant, CSSProperties> = {
  primary: { backgroundColor: '#e85d28', borderColor: '#e85d28' },
  secondary: { backgroundColor: 'rgba(255, 107, 53, 0.08)' },
  ghost: { backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' },
  danger: { backgroundColor: '#d43b3b' },
};

export default function Button({
  children,
  variant = 'ghost',
  onClick,
  disabled,
  icon,
  style,
  type = 'button',
  'aria-label': ariaLabel,
  href,
  target,
  rel,
}: ButtonProps) {
  const combinedStyle: CSSProperties = {
    ...BASE,
    ...VARIANTS[variant],
    ...(disabled ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'none' } : {}),
    ...style,
  };

  if (href) {
    return (
      <a
        href={href}
        target={target}
        rel={rel}
        style={combinedStyle}
        aria-label={ariaLabel}
        onMouseEnter={(e) => {
          if (!disabled) Object.assign((e.currentTarget as HTMLElement).style, HOVER_STYLES[variant]);
        }}
        onMouseLeave={(e) => {
          if (!disabled) Object.assign((e.currentTarget as HTMLElement).style, VARIANTS[variant]);
        }}
      >
        {icon}
        {children}
      </a>
    );
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      style={combinedStyle}
      onMouseEnter={(e) => {
        if (!disabled) Object.assign((e.currentTarget as HTMLButtonElement).style, HOVER_STYLES[variant]);
      }}
      onMouseLeave={(e) => {
        if (!disabled) Object.assign((e.currentTarget as HTMLButtonElement).style, VARIANTS[variant]);
      }}
    >
      {icon}
      {children}
    </button>
  );
}
