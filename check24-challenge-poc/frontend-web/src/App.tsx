import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Callout, Card, Code, Container, Flex, Grid, Heading, Text } from '@radix-ui/themes';
import { ClockIcon, ExclamationTriangleIcon, ReloadIcon } from '@radix-ui/react-icons';
import { fetchHome, getApiBaseUrl, login, register } from './api';
import type { HomeResponse } from './types';
import { LoginScreen } from './components/LoginScreen';
import { Navbar } from './components/Navbar';
import { StatusChip } from './components/StatusChip';
import { WelcomeCard } from './components/WelcomeCard';
import { FeedSkeleton } from './components/FeedSkeleton';
import { WidgetRenderer, isBaselineWidget } from './components/WidgetRenderer';

const TOKEN_STORAGE_KEY = 'c24_token';
const USER_STORAGE_KEY = 'c24_user';

type User = { email: string };

/**
 * Normalizes URLs by removing trailing slashes for consistent deeplink construction.
 * Prevents duplicate slashes when appending query params (e.g., ?handoff=code).
 */
function normalizeUrl(value: string | undefined): string {
  const v = (value ?? '').trim();
  if (!v) return '';
  return v.endsWith('/') ? v.slice(0, -1) : v;
}

/** Retrieves JWT token from localStorage for session persistence. */
function loadToken(): string {
  return localStorage.getItem(TOKEN_STORAGE_KEY) ?? '';
}

/** Deserializes user object from localStorage (null on missing/invalid — fail-safe). */
function loadUser(): User | null {
  try {
    const stored = localStorage.getItem(USER_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

/** Persists authentication state to localStorage after successful login/register. */
function saveAuth(token: string, user: User) {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
}

/** Removes authentication state from localStorage on logout. */
function clearAuth() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);
}

/**
 * Verwaltet den Widget-Feed: Auto-Fetch bei Login, manueller Refresh (mit
 * regenerateAI) und Fresh-Erkennung. prevStampsRef merkt sich pro Widget den
 * letzten generatedAt-Stempel — nach jedem Refresh sind genau die Widgets
 * 'fresh', die neu sind ODER einen neueren Stempel tragen (erkennt Re-Pushes).
 * Beim Erstladen pulst nichts (Ref ist noch null).
 */
function useHomeFeed(token: string, enabled: boolean) {
  const [data, setData] = useState<HomeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const prevStampsRef = useRef<Map<string, string> | null>(null);

  const applyResponse = (response: HomeResponse) => {
    const stamps = new Map(response.widgets.map((w) => [`${w.productId}:${w.widgetId}`, w.generatedAt]));
    const prev = prevStampsRef.current;
    if (prev !== null) {
      const fresh = new Set<string>();
      for (const widget of response.widgets) {
        // Baseline-Widgets stempelt das Backend bei jedem Request neu (generatedAt
        // = jetzt) — sie sind nie 'frisch gepusht' und dürfen nicht pulsen.
        if (isBaselineWidget(widget)) continue;
        const id = `${widget.productId}:${widget.widgetId}`;
        const prevStamp = prev.get(id);
        if (prevStamp === undefined) {
          fresh.add(id);
          continue;
        }
        const prevTs = Date.parse(prevStamp);
        const nextTs = Date.parse(widget.generatedAt);
        const isNewer =
          Number.isNaN(prevTs) || Number.isNaN(nextTs) ? widget.generatedAt !== prevStamp : nextTs > prevTs;
        if (isNewer) fresh.add(id);
      }
      setFreshIds(fresh);
    } else {
      setFreshIds(new Set());
    }
    prevStampsRef.current = stamps;
    setData(response);
  };

  // Harter Reset beim Nutzerwechsel — sonst sieht User B kurz User As Feed und
  // der komplette Feed pulst als 'Neu' (prevStampsRef wäre noch gefüllt).
  const reset = () => {
    setData(null);
    setError(null);
    setIsLoading(false);
    setFreshIds(new Set());
    prevStampsRef.current = null;
  };

  // Manueller Refresh — regenerateAI=true lässt Home-Core den Welcome-Text neu erzeugen.
  const refresh = async () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchHome(token, true);
      applyResponse(response);
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? 'Unbekannter Fehler');
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-Fetch, sobald ein Token vorliegt (cancelled-Flag gegen Unmount-Races).
  useEffect(() => {
    if (!enabled || !token) return;
    let cancelled = false;

    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetchHome(token);
        if (!cancelled) applyResponse(response);
      } catch (e: any) {
        if (!cancelled) {
          console.error(e);
          setError(e?.message ?? 'Unbekannter Fehler');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, token]);

  return { data, error, isLoading, refresh, freshIds, reset };
}

/**
 * Reine Orchestrierung: Auth-State + Feed-Hook, darunter LoginScreen ODER der
 * Feed aus Navbar/StatusChip/WelcomeCard/WidgetRenderer. Responsivität lebt
 * CSS-only in der Navbar; ?debug=1 schaltet widgetId/priority/meta.source frei.
 */
export function App() {
  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);

  // Speedboat-Frontend-URLs — einmal normalisiert, für SSO-Deeplinks genutzt
  const travelWebUrl = useMemo(() => normalizeUrl(import.meta.env.VITE_TRAVEL_WEB_URL), []);
  const dslWebUrl = useMemo(() => normalizeUrl(import.meta.env.VITE_DSL_WEB_URL), []);
  const insuranceWebUrl = useMemo(() => normalizeUrl(import.meta.env.VITE_INSURANCE_WEB_URL), []);

  const [token, setToken] = useState<string>(() => loadToken());
  const [user, setUser] = useState<User | null>(() => loadUser());

  // Debug-Modus als Feature (?debug=1): zeigt widgetId/priority, API-URL und meta.source.
  const isDebug = useMemo(() => new URLSearchParams(window.location.search).has('debug'), []);

  const { data, error, isLoading, refresh, freshIds, reset } = useHomeFeed(token, Boolean(token));

  // Screenreader-Ansage nach jedem Refresh (nicht beim Erstladen).
  const [announcement, setAnnouncement] = useState<string>('');
  const prevDataRef = useRef<HomeResponse | null>(null);
  useEffect(() => {
    if (data && prevDataRef.current) {
      setAnnouncement(`Startseite aktualisiert, ${data.widgets.length} Empfehlungen`);
    }
    prevDataRef.current = data;
  }, [data]);

  const logout = () => {
    clearAuth();
    setToken('');
    setUser(null);
    reset();
  };

  // Auth-Call für den LoginScreen — Fehler werden weitergeworfen, der Screen
  // fängt sie und zeigt eine deutsche Meldung.
  const handleAuth = async (mode: 'login' | 'register', email: string, password: string) => {
    const response = mode === 'login' ? await login(email, password) : await register(email, password);
    saveAuth(response.token, { email: response.user.email });
    setToken(response.token);
    setUser({ email: response.user.email });
  };

  if (!token) {
    return <LoginScreen onSubmit={handleAuth} isDebug={isDebug} apiBaseUrl={apiBaseUrl} />;
  }

  const navLinks = [
    { label: 'Reisen', url: travelWebUrl },
    { label: 'DSL', url: dslWebUrl },
    { label: 'Versicherung', url: insuranceWebUrl },
  ].filter((l) => l.url);

  return (
    <Box style={{ minHeight: '100vh' }}>
      <a href="#main" className="c24-skip-link">
        Zum Inhalt springen
      </a>

      <Navbar user={user} onLogout={logout} links={navLinks} />

      {/* Degraded-Banner: erklärt den 3-Layer-Fallback in Nutzersprache */}
      {data?.meta?.degraded ? (
        <Container size="3" px="4" style={{ paddingTop: 16 }}>
          <Callout.Root color="amber" variant="surface" role="status" className="c24-enter">
            <Callout.Icon>
              <ClockIcon />
            </Callout.Icon>
            <Callout.Text>
              {data.meta.source === 'lkg'
                ? 'Der Empfehlungsdienst ist gerade nicht erreichbar. Du siehst deine zuletzt geladenen Inhalte.'
                : 'Persönliche Empfehlungen sind gerade nicht verfügbar – hier sind unsere beliebtesten Vergleiche.'}{' '}
              <Button size="1" variant="ghost" onClick={refresh}>
                Erneut versuchen
              </Button>
            </Callout.Text>
          </Callout.Root>
        </Container>
      ) : null}

      <main id="main">
        <Container size="3" px="4" style={{ paddingTop: 24, paddingBottom: 48 }}>
          <Flex direction="column" gap="4">
            {/* Kopfzeile: Server-greeting als H1, rechts StatusChip + Refresh */}
            <Flex justify="between" align="center" wrap="wrap" gap="3">
              <Heading as="h1" size="7">
                {data?.greeting || 'Dein Home'}
              </Heading>
              <Flex gap="3" align="center">
                <StatusChip
                  meta={data?.meta}
                  generatedAt={data?.generatedAt}
                  isLoading={isLoading}
                  hasError={Boolean(error)}
                />
                {isDebug ? (
                  <Code size="1" color="gray">
                    source: {data?.meta?.source ?? 'live'}
                  </Code>
                ) : null}
                <Button variant="soft" size="2" disabled={isLoading} onClick={refresh}>
                  <ReloadIcon className={isLoading ? 'c24-spin' : undefined} /> Aktualisieren
                </Button>
              </Flex>
            </Flex>

            {data?.welcomeText ? <WelcomeCard welcomeText={data.welcomeText} /> : null}

            {/* Refresh fehlgeschlagen, alter Stand steht noch — clientseitige LKG-Spiegelung */}
            {error && data ? (
              <Callout.Root color="amber" variant="surface" role="status">
                <Callout.Icon>
                  <ExclamationTriangleIcon />
                </Callout.Icon>
                <Callout.Text>
                  Aktualisierung fehlgeschlagen – du siehst den letzten Stand.{' '}
                  <Button size="1" variant="ghost" onClick={refresh}>
                    Erneut versuchen
                  </Button>
                </Callout.Text>
              </Callout.Root>
            ) : null}

            {error && !data ? (
              <Callout.Root color="red" role="alert">
                <Callout.Icon>
                  <ExclamationTriangleIcon />
                </Callout.Icon>
                <Callout.Text>
                  Deine Startseite konnte gerade nicht geladen werden.
                  <Box style={{ marginTop: 10 }}>
                    <Button variant="soft" onClick={refresh}>
                      Erneut versuchen
                    </Button>
                  </Box>
                </Callout.Text>
              </Callout.Root>
            ) : null}

            {isLoading && !data ? <FeedSkeleton /> : null}

            {/* Leerer Feed — sollte dank Baseline-on-read (min. 3 Widgets) nie eintreten */}
            {!isLoading && data && data.widgets.length === 0 ? (
              <Card size="4" className="c24-enter">
                <Flex direction="column" align="center" gap="3" style={{ padding: 24, textAlign: 'center' }}>
                  <img src="/Logo_CHECK24.png" alt="" aria-hidden="true" style={{ height: 40, opacity: 0.25 }} />
                  <Heading as="h2" size="4">
                    Gerade keine Empfehlungen
                  </Heading>
                  <Text color="gray">
                    Schau später wieder vorbei oder starte einen Vergleich über die Navigation.
                  </Text>
                  <Button variant="soft" onClick={refresh}>
                    Aktualisieren
                  </Button>
                </Flex>
              </Card>
            ) : null}

            {data && data.widgets.length > 0 ? (
              // KEIN key={generatedAt}-Remount: der Fresh-Puls einzelner Cards trägt
              // den Demo-Moment, der restliche Feed bleibt ruhig (Fokus/Scroll erhalten).
              <Grid
                columns={{ initial: '1', sm: '2' }}
                gap="4"
                aria-busy={isLoading}
                style={{ opacity: isLoading && data ? 0.7 : 1, transition: 'opacity 160ms ease' }}
              >
                <WidgetRenderer widgets={data.widgets} freshIds={freshIds} isDebug={isDebug} />
              </Grid>
            ) : null}

            <div role="status" aria-live="polite" className="sr-only">
              {announcement}
            </div>
          </Flex>
        </Container>
      </main>
    </Box>
  );
}
