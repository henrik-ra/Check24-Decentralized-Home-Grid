// Ordnet den Feed: gepushte Widgets zuerst (Backend-Sortierung bleibt), dann
// Baseline-Widgets hinter dem Sektions-Trenner 'Beliebte Vergleiche'. Das erste
// gepushte hero_banner-Widget wird zum Featured-Hero über volle Grid-Breite.
// Unbekannte SDUI-Typen degradieren zu UnknownComponent (Forward-Compat).

import type { HomeWidget, SduiComponent } from '../types';
import { Flex, Heading, Text } from '@radix-ui/themes';
import { CompactRow } from './CompactRow';
import { HeroBanner } from './HeroBanner';
import { TextCard } from './TextCard';
import { WidgetCard } from './WidgetCard';

type Props = {
  widgets: HomeWidget[];
  freshIds?: Set<string>;
  isDebug?: boolean;
};

export function isBaselineWidget(widget: HomeWidget): boolean {
  return (
    widget.productId === 'BASELINE' ||
    widget.meta?.isBaseline === true ||
    (widget.data as any)?.baseline === true
  );
}

// Fallback für SDUI-Typen, die dieses Frontend noch nicht kennt: rendert
// title/text, wenn vorhanden — statt zu crashen oder still zu verschwinden.
function UnknownComponent({ component }: { component: SduiComponent }) {
  const title = component.props?.title;
  const text = component.props?.text;
  if (typeof title === 'string') {
    return (
      <Flex direction="column" gap="1">
        <Text size="2" weight="bold">
          {title}
        </Text>
        {typeof text === 'string' ? (
          <Text size="2" color="gray">
            {text}
          </Text>
        ) : null}
      </Flex>
    );
  }
  return (
    <Text size="2" color="gray">
      Dieser Inhalt ist in der App verfügbar.
    </Text>
  );
}

function renderComponent(
  component: SduiComponent,
  opts: { heroVariant: 'hero' | 'row'; hideImage: boolean }
) {
  switch (component.type) {
    case 'CompactRow':
      return <CompactRow component={component} />;
    case 'HeroBanner':
      return <HeroBanner component={component} variant={opts.heroVariant} />;
    case 'TextCard':
      return <TextCard component={component} hideImage={opts.hideImage} />;
    default:
      return <UnknownComponent component={component} />;
  }
}

export function WidgetRenderer({ widgets, freshIds, isDebug }: Props) {
  const pushed = widgets.filter((widget) => !isBaselineWidget(widget));
  const baseline = widgets.filter(isBaselineWidget);

  // Featured-Hero nur, wenn das oberste gepushte Widget wirklich ein HeroBanner trägt.
  const featured =
    pushed[0] && pushed[0].type === 'hero_banner' && pushed[0].components.some((c) => c.type === 'HeroBanner')
      ? pushed[0]
      : null;

  const renderWidget = (widget: HomeWidget, enterIndex: number) => {
    const key = `${widget.productId}:${widget.widgetId}`;
    const isFresh = freshIds?.has(key) ?? false;
    const isFeatured = widget === featured;
    // Bild-Dedupe pro Widget: zeigt eine frühere Komponente bereits ein Bild,
    // blenden nachfolgende TextCards ihres nicht erneut ein.
    let imageShown = false;

    return (
      <WidgetCard
        // Bei frischen Widgets wandert generatedAt in den Key: Ein Re-Push desselben
        // Widgets remountet die Card, damit der Puls auch beim zweiten Mal feuert
        // (eine bereits gelaufene CSS-Animation restartet ohne Remount nicht).
        key={isFresh ? `${key}:${widget.generatedAt}` : key}
        widget={widget}
        variant={isFeatured ? 'featured' : 'default'}
        isFresh={isFresh}
        isDebug={isDebug}
        enterIndex={enterIndex}
      >
        {widget.components.map((component, index) => {
          const hideImage = component.type === 'TextCard' && imageShown;
          if (component.props?.imageUrl) {
            imageShown = true;
          }
          return (
            <div key={`${component.type}:${index}`}>
              {renderComponent(component, { heroVariant: isFeatured ? 'hero' : 'row', hideImage })}
            </div>
          );
        })}
      </WidgetCard>
    );
  };

  return (
    <>
      {pushed.map((widget, index) => renderWidget(widget, index))}

      {pushed.length > 0 && baseline.length > 0 ? (
        <Flex align="center" gap="3" style={{ gridColumn: '1 / -1' }}>
          <span aria-hidden style={{ flex: 1, height: 1, background: 'var(--gray-a5)' }} />
          <Heading as="h2" size="3" color="gray" id="baseline-heading">
            Beliebte Vergleiche
          </Heading>
          <span aria-hidden style={{ flex: 1, height: 1, background: 'var(--gray-a5)' }} />
        </Flex>
      ) : null}

      {baseline.map((widget, index) => renderWidget(widget, pushed.length + index))}
    </>
  );
}
