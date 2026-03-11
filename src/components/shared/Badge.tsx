import { getModelCategory, CATEGORY_BADGE_COLORS } from '../../services/huggingfaceApi';

interface BadgeProps {
  pipeline_tag: string | null | undefined;
  label?: string;
}

export default function Badge({ pipeline_tag, label }: BadgeProps) {
  const category = getModelCategory(pipeline_tag);
  const color = CATEGORY_BADGE_COLORS[category];
  const text = label ?? (pipeline_tag?.replace(/-/g, ' ') ?? 'unknown');

  return (
    <span
      style={{
        display: 'inline-block',
        backgroundColor: color,
        color: '#FFFFFF',
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: '11px',
        fontWeight: 500,
        padding: '2px 6px',
        borderRadius: '2px',
        letterSpacing: '0.02em',
        textTransform: 'capitalize',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {text}
    </span>
  );
}
