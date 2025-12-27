import type { SduiComponent } from '../types';

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
    <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {imageUrl ? (
          <img src={imageUrl} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8 }} />
        ) : null}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{title}</div>
          {subtitle ? <div style={{ opacity: 0.8, marginTop: 2 }}>{subtitle}</div> : null}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {price ? <div style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{price}</div> : null}
          {ctaLabel && ctaDeeplink ? (
            <a href={ctaDeeplink} style={{ whiteSpace: 'nowrap' }}>
              {ctaLabel}
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}
