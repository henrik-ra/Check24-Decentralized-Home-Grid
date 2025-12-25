import type { SduiComponent } from '../types';

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
    <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16 }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8 }}
          />
        ) : null}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>{title}</div>
          {subtitle ? <div style={{ opacity: 0.8, marginTop: 4 }}>{subtitle}</div> : null}
          {price ? <div style={{ marginTop: 8, fontWeight: 600 }}>{price}</div> : null}
        </div>
        {ctaLabel && ctaDeeplink ? (
          <a href={ctaDeeplink} style={{ whiteSpace: 'nowrap' }}>
            {ctaLabel}
          </a>
        ) : null}
      </div>
    </section>
  );
}
