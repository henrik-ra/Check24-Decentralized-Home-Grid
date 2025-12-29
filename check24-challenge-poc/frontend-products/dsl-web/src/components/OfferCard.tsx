/**
 * OfferCard Component
 * Reusable card for displaying DSL offers
 */

import { Badge, Button, Card, Flex, Text } from '@radix-ui/themes';

export type Offer = {
	id: string;
	title: string;
	subtitle: string;
	imageUrl: string;
};

type OfferCardProps = {
	offer: Offer;
	onSelect: (offerId: string) => void;
	badge?: string;
	badgeColor?: 'orange' | 'blue' | 'green' | 'purple';
};

export function OfferCard({ offer, onSelect, badge = 'DSL', badgeColor = 'purple' }: OfferCardProps) {
	return (
		<Card key={offer.id} size="2" style={{ cursor: 'pointer' }} onClick={() => onSelect(offer.id)}>
			<Flex direction="column" gap="2">
				<img
					src={offer.imageUrl}
					alt=""
					style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 10 }}
				/>
				<Flex direction="column" gap="1">
					<Text weight="bold" size="3">
						{offer.title}
					</Text>
					<Text size="2" color="gray">
						{offer.subtitle}
					</Text>
				</Flex>
				<Flex align="center" justify="between" gap="2">
					<Badge color={badgeColor}>{badge}</Badge>
					<Button
						size="1"
						variant="soft"
						onClick={(e) => {
							e.stopPropagation();
							onSelect(offer.id);
						}}
					>
						Details
					</Button>
				</Flex>
			</Flex>
		</Card>
	);
}
