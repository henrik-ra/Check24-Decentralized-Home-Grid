// Rahmen-Karte um jedes Widget: Produkt-Chip, Personalisierungs-/Fresh-Badges,
// Begründungszeile (Signal-Ingestion sichtbar) und Freshness-Fußzeile.
// Gelb-Disziplin: max. EIN gelbes Badge pro Card — 'Neu' schlägt 'Für dich'.

import type { PropsWithChildren } from 'react';
import type { HomeWidget } from '../types';
import { Badge, Box, Card, Code, Flex, Text } from '@radix-ui/themes';
import { ClockIcon, TargetIcon } from '@radix-ui/react-icons';
import { productBadgeColors, productLabels } from '../ui/tokens';
import { formatRelativeTime, isExpired, isStale, mapReason } from '../ui/format';

type Props = PropsWithChildren<{
  widget: HomeWidget;
  variant?: 'featured' | 'default';
  isFresh?: boolean;
  isDebug?: boolean;
  enterIndex?: number;
}>;

function isTrue(value: unknown): boolean {
  return value === true;
}

function getProductLabel(productId: string): string {
  const normalized = String(productId || '').toUpperCase();
  return productLabels[normalized] ?? productId;
}

export function WidgetCard({
  widget,
  variant = 'default',
  isFresh = false,
  isDebug = false,
  enterIndex,
  children,
}: Props) {
  const isPersonalized = isTrue(widget.meta?.isPersonalized);
  const isBaseline = widget.productId === 'BASELINE' || isTrue((widget.data as any)?.baseline) || isTrue(widget.meta?.isBaseline);

  const normalizedProductId = String(widget.productId || '').toUpperCase();
  const productLabel = getProductLabel(widget.productId);
  const reason = isPersonalized ? mapReason(widget) : undefined;

  // hardExpiresAt-Defensive: Backend sollte abgelaufene Widgets filtern — rein defensiv.
  const expired = isExpired(widget.hardExpiresAt);
  const stale = !expired && isStale(widget.softExpiresAt);
  const relativeTime = formatRelativeTime(widget.generatedAt);
  const updatedLabel = expired ? 'Nicht mehr aktuell' : relativeTime ? `Aktualisiert ${relativeTime}` : undefined;

  return (
    <Card
      size={variant === 'featured' ? '4' : isBaseline ? '2' : '3'}
      className={`c24-card c24-enter${isFresh ? ' c24-fresh' : ''}`}
      style={{
        ...(variant === 'featured' ? { gridColumn: '1 / -1' } : {}),
        ...(expired ? { opacity: 0.55 } : {}),
        ['--i' as any]: Math.min(enterIndex ?? 0, 6),
      }}
    >
      <Flex direction="column" gap="3">
        <Flex justify="between" gap="3" align="start">
          <Flex direction="column" gap="1" align="start" style={{ minWidth: 0 }}>
            <Badge variant="soft" color={productBadgeColors[normalizedProductId] ?? 'gray'}>
              {productLabel}
            </Badge>
            {isDebug ? (
              <Code size="1" color="gray">
                {widget.widgetId} · P{Math.round(widget.priority)}
              </Code>
            ) : null}
          </Flex>

          <Flex gap="2" wrap="wrap" justify="end" style={{ flexShrink: 0 }}>
            {isFresh ? <Badge className="c24-badge-new">Neu</Badge> : null}
            {isPersonalized ? (
              isFresh ? (
                <Badge variant="soft" color="gray">
                  Für dich
                </Badge>
              ) : (
                <Badge className="c24-badge-personal">Für dich</Badge>
              )
            ) : null}
            {!isPersonalized && isBaseline ? (
              <Badge color="gray" variant="soft">
                Empfohlen
              </Badge>
            ) : null}
          </Flex>
        </Flex>

        {reason ? (
          <Flex gap="1" align="center">
            <TargetIcon width={12} height={12} color="var(--gray-9)" style={{ flexShrink: 0 }} />
            <Text size="1" color="gray" className="c24-truncate">
              {reason}
            </Text>
          </Flex>
        ) : null}

        <Box>{children}</Box>

        {updatedLabel || stale ? (
          <Flex justify="between" gap="3" align="center">
            {updatedLabel ? (
              <Text size="1" color="gray">
                {updatedLabel}
              </Text>
            ) : (
              <span />
            )}
            {stale ? (
              <Flex gap="1" align="center">
                <ClockIcon width={12} height={12} color="var(--amber-11)" style={{ flexShrink: 0 }} />
                <Text size="1" style={{ color: 'var(--amber-11)' }}>
                  möglicherweise nicht mehr aktuell
                </Text>
              </Flex>
            ) : null}
          </Flex>
        ) : null}
      </Flex>
    </Card>
  );
}
