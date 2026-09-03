// Rendert die SDUI-HeroBanner-Komponente in zwei Varianten:
// - 'row' (Default): kompakte Zeile mit 56px-Thumb (Android-Parität, Radius 12px).
// - 'hero': nüchternes Zwei-Zonen-Layout für das Featured-Widget — mobil Bild oben,
//   ab 768px Text links / Bild rechts (Grid-Layout kommt aus theme.css: .c24-hero-grid).
import type { SduiComponent } from '../types';
import { Box, Button, Flex, Heading, Text } from '@radix-ui/themes';
import { ArrowRightIcon } from '@radix-ui/react-icons';
import { navigateWithSso } from '../sso';

type Props = {
  component: SduiComponent;
  variant?: 'hero' | 'row';
};

export function HeroBanner({ component, variant = 'row' }: Props) {
  const props = component.props ?? {};
  const title = typeof props.title === 'string' ? props.title : 'Empfehlung';
  const subtitle = typeof props.subtitle === 'string' ? props.subtitle : undefined;
  const price = typeof props.price === 'string' ? props.price : undefined;
  const imageUrl = typeof props.imageUrl === 'string' ? props.imageUrl : undefined;
  const cta = typeof props.cta === 'object' && props.cta !== null ? (props.cta as Record<string, unknown>) : undefined;
  const ctaLabel = cta && typeof cta.label === 'string' ? cta.label : undefined;
  const ctaDeeplink = cta && typeof cta.deeplink === 'string' ? cta.deeplink : undefined;

  if (variant === 'hero') {
    return (
      <div className="c24-hero-grid">
          <div className="c24-hero-img" style={{ overflow: 'hidden', borderRadius: 'var(--radius-3)' }}>
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={title}
                style={{
                  display: 'block',
                  width: '100%',
                  aspectRatio: '16 / 9',
                  maxHeight: 200,
                  objectFit: 'cover',
                  borderRadius: 'var(--radius-3)',
                }}
              />
            ) : (
              <div
                style={{
                  width: '100%',
                  aspectRatio: '16 / 9',
                  maxHeight: 200,
                  borderRadius: 'var(--radius-3)',
                  background: 'var(--accent-3)',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <img src="/Logo_CHECK24.png" alt="" aria-hidden="true" style={{ height: 48, opacity: 0.5 }} />
              </div>
            )}
          </div>

          <Flex direction="column" gap="2" style={{ minWidth: 0 }}>
            <Heading as="h2" size="6" className="c24-truncate">
              {title}
            </Heading>
            {subtitle ? (
              <Text size="3" color="gray">
                {subtitle}
              </Text>
            ) : null}
            {price ? (
              <Flex direction="column" gap="1">
                <Text size="1" color="gray">
                  Angebot
                </Text>
                <Text size="6" weight="bold" style={{ color: 'var(--c24-navy)' }}>
                  {price}
                </Text>
              </Flex>
            ) : null}
            {ctaDeeplink ? (
              <Box mt="2">
                <Button
                  size="3"
                  onClick={() => {
                    navigateWithSso(ctaDeeplink);
                  }}
                >
                  {ctaLabel || 'Angebot ansehen'} <ArrowRightIcon />
                </Button>
              </Box>
            ) : null}
          </Flex>
      </div>
    );
  }

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
                background: 'var(--accent-3)',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <img src="/Logo_CHECK24.png" alt="" aria-hidden="true" style={{ height: 24, opacity: 0.6 }} />
            </Box>
          )}

          <Flex direction="column" gap="1" style={{ minWidth: 0 }}>
            <Heading as="h3" size="4" className="c24-truncate">
              {title}
            </Heading>
            {subtitle ? (
              <Text size="2" color="gray" className="c24-truncate">
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
