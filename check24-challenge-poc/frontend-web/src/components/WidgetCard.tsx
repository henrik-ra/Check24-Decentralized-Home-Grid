import type { PropsWithChildren } from 'react';
import type { HomeWidget } from '../types';
import { Badge, Box, Card, Flex, Text } from '@radix-ui/themes';
import { productLabels } from '../ui/tokens';

type Props = PropsWithChildren<{
  widget: HomeWidget;
}>;

function isTrue(value: unknown): boolean {
  return value === true;
}

function getProductLabel(productId: string): string {
  const normalized = String(productId || '').toUpperCase();
  return productLabels[normalized] ?? productId;
}

export function WidgetCard({ widget, children }: Props) {
  const isPersonalized = isTrue(widget.meta?.isPersonalized);
  const isBaseline = widget.productId === 'BASELINE' || isTrue((widget.data as any)?.baseline) || isTrue(widget.meta?.isBaseline);

  const productLabel = getProductLabel(widget.productId);
  const updated = widget.generatedAt ? new Date(widget.generatedAt).toLocaleString() : undefined;

  return (
    <Card size="3">
      <Flex direction="column" gap="3">
        <Flex justify="between" gap="3" align="start">
          <Flex direction="column" gap="1" style={{ minWidth: 0 }}>
            <Text size="2" weight="bold" trim="both" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {productLabel}
            </Text>
            <Text size="1" color="gray" trim="both" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {widget.widgetId}
            </Text>
          </Flex>

          <Flex gap="2" wrap="wrap" justify="end" style={{ flexShrink: 0 }}>
            {isPersonalized ? (
              <Badge color="blue" variant="soft">
                Für dich
              </Badge>
            ) : null}
            {!isPersonalized && isBaseline ? (
              <Badge color="gray" variant="soft">
                Empfohlen
              </Badge>
            ) : null}
          </Flex>
        </Flex>

        <Box>{children}</Box>

        {updated ? (
          <Text size="1" color="gray">
            Aktualisiert: {updated}
          </Text>
        ) : null}
      </Flex>
    </Card>
  );
}
