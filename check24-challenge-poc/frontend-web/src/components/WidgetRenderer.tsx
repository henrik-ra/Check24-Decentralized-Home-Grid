import type { HomeWidget, SduiComponent } from '../types';
import { HeroBanner } from './HeroBanner';

type Props = {
  widgets: HomeWidget[];
};

function renderComponent(component: SduiComponent) {
  switch (component.type) {
    case 'HeroBanner':
      return <HeroBanner key={component.type + JSON.stringify(component.props ?? {})} component={component} />;
    default:
      return null;
  }
}

export function WidgetRenderer({ widgets }: Props) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {widgets.map((widget) => (
        <div key={`${widget.productId}:${widget.widgetId}`}>
          {widget.components.map((component, index) => (
            <div key={`${widget.productId}:${widget.widgetId}:${component.type}:${index}`}>{renderComponent(component)}</div>
          ))}
        </div>
      ))}
    </div>
  );
}
