export default function SkeletonCard() {
  return (
    <div
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      {/* Badge placeholder */}
      <div className="skeleton" style={{ height: '20px', width: '80px' }} />
      {/* Title placeholder */}
      <div className="skeleton" style={{ height: '18px', width: '70%' }} />
      {/* Description line 1 */}
      <div className="skeleton" style={{ height: '14px', width: '100%' }} />
      {/* Description line 2 */}
      <div className="skeleton" style={{ height: '14px', width: '85%' }} />
      {/* Metadata row */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
        <div className="skeleton" style={{ height: '12px', width: '80px' }} />
        <div className="skeleton" style={{ height: '12px', width: '60px' }} />
      </div>
    </div>
  );
}
