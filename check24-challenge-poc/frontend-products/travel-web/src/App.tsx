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
		id: '101',
		title: 'Paris City Trip (3 Tage)',
		subtitle: 'ab 199€ · inkl. Hotel & Flug',
		imageUrl: 'https://images.unsplash.com/photo-1506929562872-bb421503ef21?w=640&h=360&fit=crop',
	},
	{
		id: '102',
		title: 'Mallorca Strandurlaub (7 Tage)',
		subtitle: 'ab 599€ · All Inclusive',
		imageUrl: 'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=640&h=360&fit=crop',
	},
	{
		id: '103',
		title: 'Italien Rundreise (10 Tage)',
		subtitle: 'ab 899€ · geführte Tour',
		imageUrl: 'https://images.unsplash.com/photo-1601581987809-a874a81309c9?w=640&h=360&fit=crop',
	},
	{
		id: '104',
		title: 'Familienpaket Gardasee (5 Tage)',
		subtitle: 'ab 449€ · Kids inklusive',
		imageUrl: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=640&h=360&fit=crop',
	},
	{
		id: '105',
		title: 'Dubai Luxus-Upgrade (4 Tage)',
		subtitle: 'ab 999€ · Premium Suite',
		imageUrl: 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=640&h=360&fit=crop',
	},
];

export function App() {
	const speedboatUrl = useMemo(() => getSpeedboatUrl(), []);
	const homeUrl = useMemo(() => getHomeUrl(), []);
	const coreUrl = useMemo(() => getCoreUrl(), []);
	const offerId = useMemo(() => getOfferIdFromPathname(window.location.pathname), []);

	const isMobile = useIsMobile();
	const [isNavOpen, setIsNavOpen] = useState(false);

	const { user, ssoError, ssoPending } = useSSO(coreUrl);
	const [email, setEmail] = useState(() => user?.email ?? 'demo@example.com');
	const [message, setMessage] = useState<string | null>(ssoError);

	// ssoError entsteht asynchron — als useState-Initialwert wäre er immer null.
	useEffect(() => {
		if (ssoError) setMessage('Anmeldung über CHECK24 fehlgeschlagen.');
	}, [ssoError]);

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
				vertical: 'travel',
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

	// Auto-signal interest when deep-linking to offer.
	// Wartet auf den SSO-Exchange (ssoPending) — sonst ginge das Signal mit der
	// Fallback-E-Mail statt des eingeloggten Users raus und der Re-Run würde
	// durch lastAutoSignaledOfferIdRef unterdrückt.
	useEffect(() => {
		if (!offerId || ssoPending) return;
		if (lastAutoSignaledOfferIdRef.current === offerId) return;
		if (signalSentFromClickRef.current === offerId) {
			signalSentFromClickRef.current = null;
			return;
		}
		lastAutoSignaledOfferIdRef.current = offerId;
		void handleSimulateInterest(offerId, { silent: true });
	}, [offerId, ssoPending, user?.email]);

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
									Travel
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
              <Heading size="5">{offerId ? `Angebot ${offerId}` : 'Travel Angebote'}</Heading>
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
					<Heading size="4">Mock-Angebote</Heading>
					<Text size="2" color="gray">
						5 Beispiel-Offers (Klicks werden gezählt)
					</Text>
					<Box
						style={{
							display: 'grid',
							gridTemplateColumns: '1fr',
							gap: 12,
						}}
					>
						{MOCK_OFFERS.map((offer) => (
							<OfferCard key={offer.id} offer={offer} onSelect={openOffer} />
						))}
					</Box>
				</Flex>
			</Card>
        </Flex>
      </Container>
    </Box>
  );
}
