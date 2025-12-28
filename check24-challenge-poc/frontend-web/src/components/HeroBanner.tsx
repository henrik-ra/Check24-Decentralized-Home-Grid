import type { SduiComponent } from '../types';
import { Box, Button, Flex, Heading, Text } from '@radix-ui/themes';
import { navigateWithSso } from '../sso';

type Props = {
  component: SduiComponent;
};

export function HeroBanner({ component }: Props) {
  const props = component.props ?? {};
  const title = typeof props.title === 'string' ? props.title : 'Untitled';
  const subtitle = typeof props.subtitle === 'string' ? props.subtitle : undefined;
  const price = typeof props.price === 'string' ? props.price : undefined;
  const imageUrl = typeof props.imageUrl === 'string' ? props.imageUrl : undefined;
  const cta = typeof props.cta === 'object' && props.cta !== null ? (props.cta as Record<string, unknown>) : undefined;
  const ctaLabel = cta && typeof cta.label === 'string' ? cta.label : undefined;
  const ctaDeeplink = cta && typeof cta.deeplink === 'string' ? cta.deeplink : undefined;

  return (
    <Box>
      <Flex gap="3" align="center" justify="between" wrap="wrap">
        <Flex gap="3" align="center" style={{ minWidth: 0 }}>
          {imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }}
            />
          ) : (
            <Box
              aria-hidden="true"
              style={{
                width: 56,
                height: 56,
                borderRadius: 12,
                background: 'var(--gray-a4)',
                display: 'grid',
                placeItems: 'center',
                color: 'var(--gray-11)',
                fontWeight: 800,
                flexShrink: 0,
              }}
            >
              C24
            </Box>
          )}

          <Flex direction="column" gap="1" style={{ minWidth: 0 }}>
            <Heading size="4" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {title}
            </Heading>
            {subtitle ? (
              <Text size="2" color="gray" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {subtitle}
              </Text>
            ) : null}
            {price ? (
              <Text size="3" weight="bold">
                {price}
              </Text>
            ) : null}
          </Flex>
        </Flex>

        {ctaDeeplink ? (
          <Button
            onClick={() => {
              navigateWithSso(ctaDeeplink);
            }}
          >
            {ctaLabel || 'Ansehen'}
          </Button>
        ) : null}
      </Flex>
    </Box>
  );
}
