import { Badge, Box, Button, Card, Container, Flex, Heading, Text, TextField } from '@radix-ui/themes';
import { PersonIcon } from '@radix-ui/react-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { simulateInterest, getSpeedboatUrl, getHomeUrl, getCoreUrl } from './api';
import { useSSO, type User } from './hooks/useSSO';
import { OfferCard, type Offer } from './components/OfferCard';

function useIsMobile(breakpointPx = 720) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < breakpointPx);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpointPx);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpointPx]);

  return isMobile;
}

function getOfferIdFromPathname(pathname: string): string | null {
	const match = pathname.match(/^\/offer\/(.+)$/);
	return match?.[1] ?? null;
}

const MOCK_OFFERS: Offer[] = [
	{
		id: '201',
		title: 'DSL 50 (Starter)',
		subtitle: 'ab 19,99€ / Monat · 24 Monate',
		imageUrl: 'https://images.unsplash.com/photo-1606904825846-647eb07f5be2?w=640&h=360&fit=crop',
	},
	{
		id: '202',
		title: 'DSL 100 (Spar-Tarif)',
		subtitle: 'ab 24,99€ / Monat · WLAN Router',
		imageUrl: 'https://images.unsplash.com/photo-1558346490-a72e53ae2d4f?w=640&h=360&fit=crop',
	},
	{
		id: '203',
		title: 'DSL 250 (Top Deal)',
		subtitle: 'ab 29,99€ / Monat · Top Preis/Leistung',
		imageUrl: 'https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=640&h=360&fit=crop',
	},
	{
		id: '204',
		title: 'Glasfaser 500',
		subtitle: 'ab 39,99€ / Monat · Highspeed',
		imageUrl: 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=640&h=360&fit=crop',
	},
	{
		id: '205',
		title: 'Glasfaser 1000',
		subtitle: 'ab 49,99€ / Monat · Max Speed',
		imageUrl: 'https://images.unsplash.com/photo-1593642532973-d31b6557fa68?w=640&h=360&fit=crop',
	},
];

export function App() {
	const speedboatUrl = useMemo(() => getSpeedboatUrl(), []);
	const homeUrl = useMemo(() => getHomeUrl(), []);
	const coreUrl = useMemo(() => getCoreUrl(), []);
	const offerId = useMemo(() => getOfferIdFromPathname(window.location.pathname), []);

  const isMobile = useIsMobile();
  const [isNavOpen, setIsNavOpen] = useState(false);

	const { user, ssoError } = useSSO(coreUrl);
	const [email, setEmail] = useState(() => user?.email ?? 'demo@example.com');
	const [message, setMessage] = useState<string | null>(ssoError);

	const lastAutoSignaledOfferIdRef = useRef<string | null>(null);
	const signalSentFromClickRef = useRef<string | null>(null);

	// Send interest signal when offer is viewed
	const handleSimulateInterest = async (offerId?: string, options?: { keepalive?: boolean; silent?: boolean }) => {
		const effectiveEmail = (user?.email ?? email).trim();
		if (!effectiveEmail) {
			setMessage('Bitte E-Mail eingeben.');
			return;
		}

		if (!options?.silent) setMessage(null);

		const offer = MOCK_OFFERS.find((o) => o.id === offerId);
		const result = await simulateInterest(
			speedboatUrl,
			{
				email: effectiveEmail,
				vertical: 'dsl',
				offerId,
				offerTitle: offer?.title,
				offerSubtitle: offer?.subtitle,
			},
			options
		);

		if (!options?.silent) {
			setMessage(result.message ?? (result.success ? 'Interesse gesendet' : 'Fehler'));
		}
	};

	// Auto-signal interest when deep-linking to offer
	useEffect(() => {
		if (!offerId) return;
		if (lastAutoSignaledOfferIdRef.current === offerId) return;
		if (signalSentFromClickRef.current === offerId) {
			signalSentFromClickRef.current = null;
			return;
		}
		lastAutoSignaledOfferIdRef.current = offerId;
		void handleSimulateInterest(offerId, { silent: true });
	}, [offerId, user?.email]);

	const openOffer = (id: string) => {
		signalSentFromClickRef.current = id;
		void handleSimulateInterest(id, { keepalive: true, silent: true });
		window.location.href = `/offer/${id}`;
	};

  useEffect(() => {
    if (!isMobile) setIsNavOpen(false);
  }, [isMobile]);

  return (
    <Box style={{ minHeight: '100vh' }}>
      <Box style={{ backgroundColor: 'var(--c24-navbar-blue)', color: 'var(--gray-1)' }}>
        <Container size="3" style={{ paddingTop: 14, paddingBottom: 14 }}>
          <Flex direction="column" gap="2">
            <Flex align="center" gap="3" wrap="wrap">
              <Flex align="center" gap="2" style={{ minWidth: 220 }}>
                <Heading size="4" style={{ color: 'var(--gray-1)' }}>
                  CHECK24
                </Heading>
                <Text size="2" style={{ color: 'var(--gray-1)' }}>
                  DSL
                </Text>
              </Flex>

              {isMobile ? (
                <Button
                  variant="ghost"
                  style={{ color: 'var(--gray-1)', marginLeft: 'auto' }}
                  onClick={() => setIsNavOpen((v) => !v)}
                >
                  {isNavOpen ? 'Schließen' : 'Menü'}
                </Button>
              ) : (
                <Flex align="center" gap="3" style={{ marginLeft: 'auto' }} wrap="wrap">
                  {homeUrl ? (
                    <Button asChild variant="ghost" style={{ color: 'var(--gray-1)' }}>
                      <a className="c24-nav-link" href={homeUrl}>
                        Zur Home
                      </a>
                    </Button>
                  ) : null}
                  <Badge color="gray" style={{ color: 'var(--gray-1)', backgroundColor: 'var(--gray-a3)' }}>
                    Speedboat: {speedboatUrl}
                  </Badge>
                </Flex>
              )}
            </Flex>

            {isMobile && isNavOpen ? (
              <Flex direction="column" gap="2" style={{ paddingBottom: 6 }}>
                {homeUrl ? (
                  <Button asChild variant="ghost" style={{ color: 'var(--gray-1)', justifyContent: 'flex-start' }}>
                    <a className="c24-nav-link" href={homeUrl}>
                      Zur Home
                    </a>
                  </Button>
                ) : null}
                <Badge color="gray" style={{ color: 'var(--gray-1)', backgroundColor: 'var(--gray-a3)', alignSelf: 'flex-start' }}>
                  Speedboat: {speedboatUrl}
                </Badge>
              </Flex>
            ) : null}
          </Flex>
        </Container>
      </Box>

      <Container size="3" style={{ paddingTop: 24, paddingBottom: 40 }}>
        <Flex direction="column" gap="4">
          <Card size="4">
            <Flex direction="column" gap="3">
              <Heading size="5">{offerId ? `Tarif ${offerId}` : 'DSL Tarife'}</Heading>
              <Text size="2" color="gray">
                Minimaler Product-Site-PoC: signalisiert Interesse automatisch beim Klick auf ein Angebot und pusht ein Widget in Home.
              </Text>

              {user?.email ? (
                <Text size="2" color="gray">
                  Eingeloggt als <Text weight="bold">{user.email}</Text>
                </Text>
              ) : (
                <Flex direction="column" gap="2">
                  <Text as="label" size="2" weight="bold" color="gray">
                    E-Mail
                  </Text>
                  <TextField.Root value={email} onChange={(e) => setEmail(e.target.value)}>
                    <TextField.Slot>
                      <PersonIcon />
                    </TextField.Slot>
                  </TextField.Root>
                </Flex>
              )}

              <Flex gap="2" wrap="wrap">
                {homeUrl ? (
                  <Button
                    variant="soft"
                    onClick={() => {
                      window.location.href = homeUrl;
                    }}
                  >
                    Home öffnen
                  </Button>
                ) : null}
              </Flex>

              {message ? <Text size="2">{message}</Text> : null}
            </Flex>
          </Card>

          <Card size="3">
            <Flex direction="column" gap="2">
              <Heading size="4">Mock-Tarife</Heading>
              <Text size="2" color="gray">
                5 Beispiel-Tarife (Klicks werden gezählt)
              </Text>
              <Box
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr',
                  gap: 12,
                }}
              >
                {MOCK_OFFERS.map((offer) => (
                  <OfferCard key={offer.id} offer={offer} badgeColor="purple" badge="DSL" onSelect={() => openOffer(offer.id)} />
                ))}
              </Box>
            </Flex>
          </Card>
        </Flex>
      </Container>
    </Box>
  );
}
