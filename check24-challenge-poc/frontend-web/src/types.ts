export type SduiComponent = {
  type: string;
  props?: Record<string, unknown>;
};

export type HomeWidget = {
  schemaVersion: string;
  widgetId: string;
  productId: string;
  type: string;
  priority: number;
  components: SduiComponent[];
  data: Record<string, unknown>;
  softExpiresAt: string;
  hardExpiresAt: string;
  generatedAt: string;
};

export type HomeResponse = {
  schemaVersion: string;
  generatedAt: string;
  greeting: string;
  widgets: HomeWidget[];
};
