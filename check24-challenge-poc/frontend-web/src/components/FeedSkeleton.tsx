// FeedSkeleton — Lade-Zustand mit layoutidentischer Anatomie zum Live-Grid
// (Featured-Hero full-width + Kompakt-Cards, null Layout-Shift). Die Skeletons
// erben den Entrance-Stagger (--i), damit Lade- und Live-Zustand sich wie
// EIN System anfühlen. Rein dekorativ, daher aria-hidden.

import type { CSSProperties } from 'react';
import { Card, Flex, Grid, Skeleton } from '@radix-ui/themes';

// Pill-Skeleton in Badge-Größe (Produkt-Chip / 'Für dich'-Badge).
function BadgeSkeleton() {
  return <Skeleton style={{ height: 20, width: 72, borderRadius: 999 }} />;
}

export function FeedSkeleton() {
  return (
    <Grid columns={{ initial: '1', sm: '2' }} gap="4" aria-hidden>
      {/* Hero-Skeleton — Nachbau des full-width Featured-Heros: Card size="4" und
          Bild-Zone als erstes Kind mit c24-hero-img, exakt wie im echten Hero
          (mobil Bild oben, ab 768px rechts — dieselbe order-Regel aus theme.css). */}
      <Card
        size="4"
        className="c24-enter"
        style={{ gridColumn: '1 / -1', '--i': 0 } as CSSProperties}
      >
        <Flex direction="column" gap="3">
          <Flex gap="2">
            <BadgeSkeleton />
            <BadgeSkeleton />
          </Flex>
          <div className="c24-hero-grid">
            <div className="c24-hero-img">
              <Skeleton style={{ height: 180, borderRadius: 12 }} />
            </div>
            <Flex direction="column" gap="3">
              <Skeleton style={{ height: 24, width: '60%' }} />
              <Skeleton style={{ height: 14, width: '40%' }} />
              <Skeleton style={{ height: 36, width: 96, borderRadius: 'var(--radius-2)' }} />
            </Flex>
          </div>
        </Flex>
      </Card>

      {/* 4× Kompakt-Skeleton — Nachbau der Widget-Cards (Badge, 44px-Thumb, Fußzeile) */}
      {[1, 2, 3, 4].map((i) => (
        <Card key={i} size="3" className="c24-enter" style={{ '--i': i } as CSSProperties}>
          <Flex direction="column" gap="3">
            <Flex gap="2">
              <BadgeSkeleton />
            </Flex>
            <Flex gap="3" align="center">
              <Skeleton style={{ width: 44, height: 44, borderRadius: 999, flexShrink: 0 }} />
              <Flex direction="column" gap="2" style={{ flexGrow: 1 }}>
                <Skeleton style={{ height: 16, width: '70%' }} />
                <Skeleton style={{ height: 12, width: '50%' }} />
              </Flex>
            </Flex>
            <Skeleton style={{ height: 12, width: '30%' }} />
          </Flex>
        </Card>
      ))}
    </Grid>
  );
}
