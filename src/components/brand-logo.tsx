/**
 * IAgentics brand mark — node-network glyph + gradient wordmark.
 * Recreated from the official logo so it stays crisp and legible on both
 * light and dark (terminal) surfaces.
 */
export function BrandLogo({ size = 30, showWord = true }: { size?: number; showWord?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5 select-none">
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        aria-label="IAgentics"
        role="img"
        style={{ flex: 'none' }}
      >
        <defs>
          <linearGradient id="ia-logo-grad" x1="0" y1="0" x2="64" y2="64">
            <stop offset="0" stopColor="#6E8BF5" />
            <stop offset="1" stopColor="#9b6bff" />
          </linearGradient>
        </defs>
        <g stroke="url(#ia-logo-grad)" strokeWidth="3.4">
          <line x1="14" y1="20" x2="14" y2="44" />
          <line x1="14" y1="20" x2="32" y2="14" />
          <line x1="14" y1="44" x2="32" y2="50" />
          <line x1="32" y1="14" x2="32" y2="50" />
          <line x1="32" y1="32" x2="50" y2="44" />
        </g>
        <g fill="var(--background)" stroke="url(#ia-logo-grad)" strokeWidth="3.4">
          <circle cx="14" cy="18" r="5.4" />
          <circle cx="14" cy="46" r="5.4" />
          <circle cx="32" cy="13" r="5.4" />
          <circle cx="32" cy="32" r="6" />
          <circle cx="32" cy="51" r="5.4" />
          <circle cx="50" cy="45" r="5.4" />
        </g>
      </svg>
      {showWord && (
        <span
          className="brand-grad-text font-extrabold tracking-tight"
          style={{ fontSize: size * 0.62, lineHeight: 1, fontFamily: 'var(--font-sans)' }}
        >
          IAgentics
        </span>
      )}
    </span>
  )
}
