export type SduiComponent = {
  type: string;
  props?: Record<string, unknown>;
};

/* 
-------------------------------------------------------------------------
Example data from backend (home-core service) :
{
  "type": "HeroBanner",
  "props": {
    "title": "Malediven-Urlaub",
    "subtitle": "7 Tage All-Inclusive",
    "price": "1.499 €",
    "cta": {
      "type": "deeplink",
      "target": "https://travel.check24.de/offer/123"
    }
  }
}
--------------------------------------------------------------------------
Warum type = string statt Enum?: 

// ❌ Problem mit Enum (zu strikt):
export type ComponentType = 'CompactRow' | 'HeroBanner' | 'TextCard';

// Wenn Backend neuen Typ hinzufügt:
{
  "type": "VideoPlayer"  // ← Frontend crasht (unbekannter Type)
}

// ✅ Mit string (flexibel):
export type ComponentType = string;

// Frontend kann gracefully degradieren:
if (type === 'VideoPlayer') {
  return <VideoPlayer {...props} />;
} else {
  return <FallbackComponent />;  // Generische Box
}
-------------------------------------------------------------------------

warum unkown statt any?:

// ❌ Mit any:
const props: Record<string, any> = component.props;
const price = props.price.toFixed(2);  // Kein Type-Error, aber Runtime-Crash wenn price=string

// ✅ Mit unknown:
const props: Record<string, unknown> = component.props;
const price = props.price.toFixed(2);  // ❌ Type-Error: unknown hat keine toFixed()

// Muss erst Type-Check machen:
if (typeof props.price === 'number') {
  const price = props.price.toFixed(2);  // ✅ TypeScript weiß: ist number
}

-------------------------------------------------------------------------
*/

export type HomeWidget = {
  schemaVersion: string;
  widgetId: string;
  productId: string;
  type: string;
  priority: number;
  components: SduiComponent[];
  data: Record<string, unknown>;
  meta?: Record<string, unknown>;
  softExpiresAt: string;
  hardExpiresAt: string;
  generatedAt: string;
};

/*
-------------------------------------------------------------------------
Example full home widget from backend:
{
  "schemaVersion": "1.0",
  "widgetId": "travel.primary.v1",
  "productId": "TRAVEL",
  "type": "hero_banner",
  "priority": 100,
  "components": [
    {  SduiComponent 1  },
    {  SduiComponent 2  }
  ],
  "data": { "offerId": "101" },
  "softExpiresAt": "2024-01-15T12:00:00.000Z",
  "hardExpiresAt": "2024-01-15T18:00:00.000Z",
  "generatedAt": "2024-01-15T10:30:00.000Z"
}
  -------------------------------------------------------------------------
*/




// complete API response from backend
export type HomeResponse = {
  schemaVersion: string;
  generatedAt: string;
  greeting: string;
  welcomeText?: string;
  widgets: HomeWidget[];
};

/* 
-------------------------------------------------------------------------
Example full home response from backend:
{
  "schemaVersion": "2.0",
  "generatedAt": "2024-01-15T10:35:00.000Z",
  "greeting": "Guten Tag, Max!",
  "welcomeText": "Basierend auf Ihren Suchen...",
  "widgets": [
    {  HomeWidget 1  }, also das von davor
    {  HomeWidget 2  } also das HomeWidget typo von davor
  ]
}
  -------------------------------------------------------------------------
*/
