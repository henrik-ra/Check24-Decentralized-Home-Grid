import type { HomeWidget, SduiComponent } from '../types';
import { CompactRow } from './CompactRow';
import { HeroBanner } from './HeroBanner';
import { TextCard } from './TextCard';

type Props = {
  widgets: HomeWidget[];
};

function renderComponent(component: SduiComponent) {
  switch (component.type) {
    case 'CompactRow':
      return <CompactRow key={component.type + JSON.stringify(component.props ?? {})} component={component} />;
    case 'HeroBanner':
      return <HeroBanner key={component.type + JSON.stringify(component.props ?? {})} component={component} />;
    case 'TextCard':
      return <TextCard key={component.type + JSON.stringify(component.props ?? {})} component={component} />;
    default:
      return null;
  }
}

export function WidgetRenderer({ widgets }: Props) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {widgets.map((widget) => (
        <div key={`${widget.productId}:${widget.widgetId}`}>
          {widget.meta?.isPersonalized === true ? (
            <div style={{ fontSize: 12, fontWeight: 600, color: '#6b21a8', marginBottom: 6 }}>
              ✨ Für dich ausgewählt
            </div>
          ) : null}
          {widget.components.map((component, index) => (
            <div key={`${widget.productId}:${widget.widgetId}:${component.type}:${index}`}>{renderComponent(component)}</div>
          ))}
        </div>
      ))}
    </div>
  );
}
