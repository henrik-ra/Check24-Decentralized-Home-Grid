/* 

-------------------------------------------------------------------
NOT ACUTALLY BEING USED RIGHT NOW, BUT KEPT FOR FUTURE REFERENCE
-------------------------------------------------------------------

*/



import type { SduiComponent } from '../types';
import { Box, Button, Flex, Text } from '@radix-ui/themes';
import { navigateWithSso } from '../sso';

type Props = {
  component: SduiComponent;
};

export function CompactRow({ component }: Props) {
  const props = component.props ?? {};
  const title = typeof props.title === 'string' ? props.title : 'Untitled';
  const subtitle = typeof props.subtitle === 'string' ? props.subtitle : undefined;
  const price = typeof props.price === 'string' ? props.price : undefined;
  const imageUrl = typeof props.imageUrl === 'string' ? props.imageUrl : undefined;

  const cta = typeof props.cta === 'object' && props.cta !== null ? (props.cta as Record<string, unknown>) : undefined;
  const ctaLabel = cta && typeof cta.label === 'string' ? cta.label : undefined;
  const ctaDeeplink = cta && typeof cta.deeplink === 'string' ? cta.deeplink : undefined;

  return (
    <Flex align="center" gap="3" justify="between" wrap="wrap">
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
          <Text size="2" weight="bold" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {title}
          </Text>
          {subtitle ? (
            <Text size="1" color="gray" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {subtitle}
            </Text>
          ) : null}
        </Flex>
      </Flex>

      <Flex align="center" gap="3">
        {price ? (
          <Text size="2" weight="bold">
            {price}
          </Text>
        ) : null}
        {ctaDeeplink ? (
          <Button
            size="2"
            variant="soft"
            onClick={() => {
              navigateWithSso(ctaDeeplink);
            }}
          >
            {ctaLabel || 'Öffnen'}
          </Button>
        ) : null}
      </Flex>
    </Flex>
  );
}
