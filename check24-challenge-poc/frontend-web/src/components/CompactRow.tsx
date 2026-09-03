// Rendert die Baseline-Widgets ('Beliebte Vergleiche'). Android-Parität: Thumb 44px, Radius 12px.

import type { SduiComponent } from '../types';
import { Badge, Box, Button, Flex, Text } from '@radix-ui/themes';
import { navigateWithSso } from '../sso';

type Props = {
  component: SduiComponent;
};

export function CompactRow({ component }: Props) {
  const props = component.props ?? {};
  const title = typeof props.title === 'string' ? props.title : 'Empfehlung';
  const subtitle = typeof props.subtitle === 'string' ? props.subtitle : undefined;
  const price = typeof props.price === 'string' ? props.price : undefined;
  const imageUrl = typeof props.imageUrl === 'string' ? props.imageUrl : undefined;

  const cta = typeof props.cta === 'object' && props.cta !== null ? (props.cta as Record<string, unknown>) : undefined;
  const ctaLabel = cta && typeof cta.label === 'string' ? cta.label : undefined;
  const ctaDeeplink = cta && typeof cta.deeplink === 'string' ? cta.deeplink : undefined;

  return (
    <Flex align="center" gap="3" justify="between" wrap="wrap" style={{ minHeight: 44 }}>
      <Flex gap="3" align="center" style={{ minWidth: 0 }}>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            style={{ width: 44, height: 44, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }}
          />
        ) : (
          <Box
            aria-hidden="true"
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'var(--accent-3)',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
            }}
          >
            <img src="/Logo_CHECK24.png" alt="" aria-hidden="true" style={{ height: 20, opacity: 0.6 }} />
          </Box>
        )}

        <Flex direction="column" gap="1" style={{ minWidth: 0 }}>
          <Text size="2" weight="bold" className="c24-truncate">
            {title}
          </Text>
          {subtitle ? (
            <Text size="1" color="gray" className="c24-truncate">
              {subtitle}
            </Text>
          ) : null}
        </Flex>
      </Flex>

      <Flex align="center" gap="3">
        {/* Der price-Slot trägt bei Baseline Marketing-Text ('Top Deals', 'Sparpotenzial') —
            deshalb Badge statt Bold-Preis-Optik. */}
        {price ? (
          <Badge color="gray" variant="soft" style={{ whiteSpace: 'nowrap' }}>
            {price}
          </Badge>
        ) : null}
        {ctaDeeplink ? (
          <Button
            size="2"
            variant="soft"
            style={{ minHeight: 36 }}
            onClick={() => {
              navigateWithSso(ctaDeeplink);
            }}
          >
            {ctaLabel || 'Vergleichen'}
          </Button>
        ) : null}
      </Flex>
    </Flex>
  );
}
