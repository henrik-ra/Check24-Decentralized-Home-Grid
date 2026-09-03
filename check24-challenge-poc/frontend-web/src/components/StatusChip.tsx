// StatusChip — macht den 3-Layer-Fallback (Live → Last-Known-Good → Baseline) als
// Pill sichtbar. meta existiert laut home-core NUR im Degraded-Pfad, daher gilt
// defensiv: degraded !== true ⇒ Live. Zustand nie NUR über Farbe — der Text trägt
// immer die Bedeutung. Bewusst KEINE Live-Region: der 30s-Relativzeit-Tick würde
// Screenreader minütlich unterbrechen; Statuswechsel melden die Callouts in App.tsx.

import { useEffect, useState, type ReactNode } from 'react';
import { Flex, Text } from '@radix-ui/themes';
import { ReloadIcon } from '@radix-ui/react-icons';
import type { HomeResponseMeta } from '../types';
import { formatRelativeTime } from '../ui/format';

type StatusChipProps = {
  meta?: HomeResponseMeta;
  generatedAt?: string;
  isLoading: boolean;
  hasError?: boolean;
};

// Kleiner Status-Punkt — rein dekorativ, die Bedeutung steht im Text daneben.
function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      style={{ width: 8, height: 8, borderRadius: 999, background: color, flexShrink: 0 }}
    />
  );
}

export function StatusChip({ meta, generatedAt, isLoading, hasError = false }: StatusChipProps) {
  // 30s-Tick, damit die Relativzeit ('gerade eben' → 'vor 2 Minuten') mitläuft.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  let background = 'var(--gray-a3)';
  let content: ReactNode;

  if (isLoading) {
    content = (
      <>
        <ReloadIcon width={12} height={12} className="c24-spin" />
        <Text size="1" weight="medium">
          Aktualisiere…
        </Text>
      </>
    );
  } else if (hasError) {
    background = 'var(--red-a3)';
    content = (
      <>
        <Dot color="var(--red-9)" />
        <Text size="1" weight="medium" style={{ color: 'var(--red-11)' }}>
          Verbindungsproblem
        </Text>
      </>
    );
  } else if (meta?.degraded && meta.source === 'lkg') {
    background = 'var(--amber-a3)';
    content = (
      <>
        <Dot color="var(--c24-yellow-deep)" />
        <Text size="1" weight="medium" style={{ color: 'var(--amber-11)' }}>
          Offline-Modus · gespeicherte Inhalte
        </Text>
      </>
    );
  } else if (meta?.degraded && meta.source === 'empty') {
    content = (
      <>
        <Dot color="var(--gray-9)" />
        <Text size="1" weight="medium">
          Basis-Empfehlungen
        </Text>
      </>
    );
  } else {
    const relative = generatedAt ? formatRelativeTime(generatedAt, now) : '';
    content = (
      <>
        <Dot color="var(--c24-live)" />
        <Text size="1" weight="medium">
          {relative ? `Live · ${relative}` : 'Live'}
        </Text>
      </>
    );
  }

  return (
    <Flex align="center" gap="2" style={{ height: 28, borderRadius: 999, padding: '4px 12px', background }}>
      {content}
    </Flex>
  );
}
