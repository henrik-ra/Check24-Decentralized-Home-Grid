export type SduiComponent = {
  type: string;
  props?: Record<string, unknown>;
};

/*
Beispiel: { "type": "HeroBanner", "props": { "title": "Malediven-Urlaub", "subtitle": "7 Tage All-Inclusive",
"price": "1.499 €", "cta": { "type": "deeplink", "target": "https://travel.check24.de/offer/123" } } }
type ist bewusst string statt Enum: Schickt das Backend einen neuen Typ (z. B. "VideoPlayer"), degradiert
das Frontend graceful zu einer Fallback-Komponente statt zu crashen (SDUI-Forward-Compat).
props ist Record<string, unknown> statt any: Jeder Zugriff erzwingt erst einen Type-Check.
*/

// Widget-Metadaten vom Server; offen für unbekannte Felder (Forward-Compat).
export type WidgetMeta = {
  isPersonalized?: boolean;
  isBaseline?: boolean;
  reason?: string;
} & Record<string, unknown>;

export type HomeWidget = {
  schemaVersion: string;
  widgetId: string;
  productId: string;
  type: string;
  priority: number;
  components: SduiComponent[];
  data: Record<string, unknown>;
  meta?: WidgetMeta;
  softExpiresAt: string;
  hardExpiresAt: string;
  generatedAt: string;
};

/*
Beispiel: { "schemaVersion": "1.0", "widgetId": "travel.primary.v1", "productId": "TRAVEL",
"type": "hero_banner", "priority": 100, "components": [ ...SduiComponents ], "data": { "offerId": "101" },
"softExpiresAt": "...", "hardExpiresAt": "...", "generatedAt": "..." }
*/

// Antwort-Metadaten: existieren NUR im Degraded-Pfad (home-core routes.js) —
// 'Live' = Abwesenheit von meta bzw. degraded !== true.
export type HomeResponseMeta = {
  degraded?: boolean;
  reason?: string;
  source?: 'lkg' | 'empty';
};

// complete API response from backend
export type HomeResponse = {
  schemaVersion: string;
  generatedAt: string;
  greeting: string;
  welcomeText?: string;
  widgets: HomeWidget[];
  meta?: HomeResponseMeta;
};

/*
Beispiel: { "schemaVersion": "2.0", "generatedAt": "...", "greeting": "Guten Tag, Max!",
"welcomeText": "Basierend auf Ihren Suchen...", "widgets": [ ...HomeWidgets ] }
*/
