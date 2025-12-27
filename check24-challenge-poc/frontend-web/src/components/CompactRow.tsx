import React from 'react';
import { SduiComponent } from '../types';

export function CompactRow({ component }: { component: SduiComponent }) {
  const props = component.props as any;
  const { title, subtitle, price, cta, imageUrl } = props;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      background: 'white',
      borderRadius: 8,
      padding: 12,
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      gap: 12
    }}>
      {imageUrl && (
        <img 
          src={imageUrl} 
          alt={title} 
          style={{ width: 40, height: 40, borderRadius: 4, objectFit: 'cover' }} 
        />
      )}
      
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 'bold', fontSize: 14 }}>{title}</div>
        <div style={{ fontSize: 12, color: '#666' }}>{subtitle}</div>
      </div>

      <div style={{ textAlign: 'right' }}>
        <div style={{ fontWeight: 'bold', color: '#005ea8' }}>{price}</div>
        {cta && (
          <a 
            href={cta.deeplink}
            style={{ 
              fontSize: 12, 
              color: '#005ea8', 
              textDecoration: 'none',
              display: 'block',
              marginTop: 2
            }}
          >
            {cta.label} &rsaquo;
          </a>
        )}
      </div>
    </div>
  );
}
