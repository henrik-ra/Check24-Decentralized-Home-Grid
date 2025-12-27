import type { HomeWidget, SduiComponent } from '../types';
import { HeroBanner } from './HeroBanner';
import { TextCard } from './TextCard';
import { CompactRow } from './CompactRow';

type Props = {
  widgets: HomeWidget[];
};

function renderComponent(component: SduiComponent) {
  switch (component.type) {
    case 'HeroBanner':
      return <HeroBanner key={component.type + JSON.stringify(component.props ?? {})} component={component} />;
    case 'TextCard':
      return <TextCard key={component.type + JSON.stringify(component.props ?? {})} component={component} />;
    case 'CompactRow':
      return <CompactRow key={component.type + JSON.stringify(component.props ?? {})} component={component} />;
    default:
      return null;
  }
}

export function WidgetRenderer({ widgets }: Props) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {widgets.map((widget) => (
        <div key={`${widget.productId}:${widget.widgetId}`} style={{ position: 'relative' }}>
          {/* Personalized Badge: Shows if the backend flagged it as personalized */}
          {/* We check for the 'meta.isPersonalized' flag or high priority */}
          {((widget as any).meta?.isPersonalized || widget.priority >= 200) && (
            <div
              style={{
                position: 'absolute',
                top: -10,
                right: 10,
                background: '#673ab7', // Deep Purple for "Smart"
                color: 'white',
                padding: '4px 8px',
                borderRadius: 12,
                fontSize: 12,
                fontWeight: 'bold',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                zIndex: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span>✨</span>
              <span>Für dich ausgewählt</span>
            </div>
          )}
          {widget.components.map((component, index) => (
            <div key={`${widget.productId}:${widget.widgetId}:${component.type}:${index}`}>{renderComponent(component)}</div>
          ))}
        </div>
      ))}
    </div>
  );
}
