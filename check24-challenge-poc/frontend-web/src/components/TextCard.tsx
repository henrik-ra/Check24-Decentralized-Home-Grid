import type { SduiComponent } from '../types';
import { Button, Flex, Text } from '@radix-ui/themes';
import { navigateWithSso } from '../sso';
import { labelOverrides } from '../ui/tokens';

type Props = {
  component: SduiComponent;
  // Bild-Dedupe: true, wenn eine frühere Komponente im selben Widget bereits ein Bild zeigt
  // (killt das doppelte Bildmotiv Hero-Thumb + TextCard-Vollbild). Gesetzt vom WidgetRenderer.
  hideImage?: boolean;
};

export function TextCard({ component, hideImage }: Props) {
  const props = component.props ?? {};
  const title = typeof props.title === 'string' ? props.title : 'Info';
  const text = typeof props.text === 'string' ? props.text : '';
  const label = typeof props.label === 'string' ? props.label : undefined;
  const imageUrl = typeof props.imageUrl === 'string' ? props.imageUrl : undefined;

  // CTA-Parität zur Android-App: gleiches cta-Schema wie in HeroBanner (label/deeplink).
  const cta = typeof props.cta === 'object' && props.cta !== null ? (props.cta as Record<string, unknown>) : undefined;
  const ctaLabel = cta && typeof cta.label === 'string' ? cta.label : undefined;
  const ctaDeeplink = cta && typeof cta.deeplink === 'string' ? cta.deeplink : undefined;

  return (
    <Flex direction="column" gap="2">
      {/* Android-Parität: Bildhöhe 120px, Radius 12px — nicht ändern. */}
      {imageUrl && !hideImage ? (
        <img
          src={imageUrl}
          alt={title}
          style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 12 }}
        />
      ) : null}
      {label ? (
        <Text
          size="1"
          weight="bold"
          style={{ color: 'var(--accent-11)', letterSpacing: 0.4, textTransform: 'uppercase' }}
        >
          {labelOverrides[label] ?? label}
        </Text>
      ) : null}
      <Text size="3" weight="bold">
        {title}
      </Text>
      {text ? (
        <Text size="2" color="gray" className="c24-clamp-3">
          {text}
        </Text>
      ) : null}
      {ctaDeeplink ? (
        <Button
          size="2"
          variant="soft"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => {
            navigateWithSso(ctaDeeplink);
          }}
        >
          {ctaLabel || 'Mehr erfahren'}
        </Button>
      ) : null}
    </Flex>
  );
}
