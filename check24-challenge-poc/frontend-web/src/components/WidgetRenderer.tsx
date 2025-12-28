import type { HomeWidget, SduiComponent } from '../types';
import { CompactRow } from './CompactRow';
import { HeroBanner } from './HeroBanner';
import { TextCard } from './TextCard';
import { WidgetCard } from './WidgetCard';

type Props = {
  widgets: HomeWidget[];
};

function renderComponent(component: SduiComponent) {
  switch (component.type) {
    case 'CompactRow':
      return <CompactRow component={component} />;
    case 'HeroBanner':
      return <HeroBanner component={component} />;
    case 'TextCard':
      return <TextCard component={component} />;
    default:
      return null;
  }
}

export function WidgetRenderer({ widgets }: Props) {
  return (
    <>
      {widgets.map((widget) => (
        <WidgetCard key={`${widget.productId}:${widget.widgetId}`} widget={widget}>
          {widget.components.map((component, index) => (
            <div key={`${component.type}:${index}`}>{renderComponent(component)}</div>
          ))}
        </WidgetCard>
      ))}
    </>
  );
}
