// Formatierungs- und Freshness-Helfer für den Home-Feed. Keine React-Imports,
// alle Funktionen defensiv (ungültige Daten werfen nie, sie fallen leise zurück).

import type { HomeWidget } from '../types';

// 'gerade eben' (<45s), dann relative Zeit (Minuten/Stunden), älter: 'am 01.09.'.
export function formatRelativeTime(iso: string, now = Date.now()): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return '';
  const diff = now - ts;
  if (diff < 45_000) return 'gerade eben';
  const rtf = new Intl.RelativeTimeFormat('de', { numeric: 'auto' });
  const minutes = Math.round(diff / 60_000);
  if (minutes < 60) return rtf.format(-minutes, 'minute');
  const hours = Math.round(diff / 3_600_000);
  if (hours < 24) return rtf.format(-hours, 'hour');
  const day = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' }).format(ts);
  return `am ${day}`;
}

// Stale = softExpiresAt überschritten, mit 60s Toleranz für Uhr-Drift.
export function isStale(softExpiresAt: string, now = Date.now()): boolean {
  const ts = Date.parse(softExpiresAt);
  if (Number.isNaN(ts)) return false;
  return now > ts + 60_000;
}

// Expired = hardExpiresAt überschritten (ohne Toleranz — harte Grenze).
export function isExpired(hardExpiresAt: string, now = Date.now()): boolean {
  const ts = Date.parse(hardExpiresAt);
  if (Number.isNaN(ts)) return false;
  return now > ts;
}

// Fresh = in den letzten 2 Minuten generiert (steuert den Gelb-Puls).
export function isFreshTimestamp(generatedAt: string, now = Date.now()): boolean {
  const ts = Date.parse(generatedAt);
  if (Number.isNaN(ts)) return false;
  return now - ts < 120_000;
}

// Schneidet mid-word abgebrochene LLM-Texte ('Dein un…') an der letzten Satzgrenze ab.
// Liegt die vor Index 40 oder fehlt sie, bleibt der ganze Text stehen (+ '…').
export function trimToSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (/[.!?…]$/.test(trimmed)) return trimmed;
  const lastEnd = Math.max(
    trimmed.lastIndexOf('.'),
    trimmed.lastIndexOf('!'),
    trimmed.lastIndexOf('?')
  );
  if (lastEnd < 40) return `${trimmed}…`;
  return trimmed.slice(0, lastEnd + 1);
}

// Baut die Begründungszeile ('Weil du dir „…“ 3× angesehen hast') aus den
// Signaldaten (speedboat liefert data.offerTitle/intensity).
// Client-Side-Copy-Override — in Produktion liefert der Server lokalisierte Reasons.
export function mapReason(widget: HomeWidget): string | undefined {
  const t = widget.data?.offerTitle;
  const n = widget.data?.intensity;
  if (typeof t === 'string' && typeof n === 'number' && n > 0) {
    return n === 1
      ? `Weil du dir „${t}“ angesehen hast`
      : `Weil du dir „${t}“ ${n}× angesehen hast`;
  }
  if (widget.meta?.reason === 'Based on your recent interest') {
    return 'Basierend auf deinem letzten Interesse';
  }
  return typeof widget.meta?.reason === 'string' ? widget.meta.reason : undefined;
}
