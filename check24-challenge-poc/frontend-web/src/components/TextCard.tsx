import type { SduiComponent } from '../types';

type Props = {
  component: SduiComponent;
};

export function TextCard({ component }: Props) {
  const props = component.props ?? {};
  const title = typeof props.title === 'string' ? props.title : 'Info';
  const text = typeof props.text === 'string' ? props.text : '';
  const label = typeof props.label === 'string' ? props.label : undefined;

  return (
    <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16 }}>
      {label ? <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>{label}</div> : null}
      <div style={{ fontSize: 16, fontWeight: 600 }}>{title}</div>
      {text ? <div style={{ marginTop: 6, opacity: 0.9 }}>{text}</div> : null}
    </section>
  );
}
