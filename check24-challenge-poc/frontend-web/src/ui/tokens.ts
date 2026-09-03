// Web/Android-Parität (undokumentiert, nicht ändern): Bildmaße 44px (CompactRow) /
// 56px (HeroBanner row) / 120px (TextCard), Bild-Radius 12px = var(--radius-3).

export const productLabels: Record<string, string> = {
  TRAVEL: 'Reisen',
  DSL: 'Internet',
  INSURANCE: 'Versicherung',
  BASELINE: 'CHECK24',
};

// Radix-Palettennamen statt Hex — soft-Badges sind so automatisch abgestuft,
// ohne mit dem Brand-Blau zu konkurrieren.
export const productBadgeColors: Record<string, 'cyan' | 'indigo' | 'teal' | 'gray'> = {
  TRAVEL: 'cyan',
  DSL: 'indigo',
  INSURANCE: 'teal',
  BASELINE: 'gray',
};

// Client-Side-Copy-Override für den PoC — in Produktion serverseitig.
export const labelOverrides: Record<string, string> = {
  'Personalized hint': 'Warum sehe ich das?',
};
