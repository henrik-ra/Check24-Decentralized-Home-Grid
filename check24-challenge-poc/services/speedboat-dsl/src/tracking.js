/**
 * Click Tracking Logic for DSL
 */

// Map<email, { totalCount: number, lastOfferId: string, lastOfferTitle?: string, lastOfferSubtitle?: string, offerCounts: Map<string, number>, offerTitles?: Map<string, string>, offerSubtitles?: Map<string, string> }>
const clickCounts = new Map();

/* 
------------------------------------------------------------------------
Example internal state:

Clickcount example per user: 
{
  totalCount: 0,                // Gesamtzahl aller Klicks dieses Users
  lastOfferId: id,              // Die zuletzt geklickte offerId
  offerCounts: new Map(),       // Map: Wie oft wurde jedes Angebot geklickt?
  offerTitles: new Map(),       // Map: Titel pro Angebot (optional, erst bei Klick mit Titel)
  offerSubtitles: new Map(),    // Map: Subtitle pro Angebot (optional)
  lastOfferTitle: undefined,    // Titel des zuletzt geklickten Angebots (optional)
  lastOfferSubtitle: undefined  // Subtitle des zuletzt geklickten Angebots (optional)
}

clickCounts = Map {
  "alice@example.com" => {
    totalCount: 7,                // Alice hat insgesamt 7x geklickt
    lastOfferId: "202",           // Zuletzt DSL 100 geklickt
    lastOfferTitle: "DSL 100",
    lastOfferSubtitle: "ab 24,99€",
    offerCounts: Map {            // Wie oft pro Angebot?
      "201" => 2,                 // DSL 50: 2x
      "202" => 5                  // DSL 100: 5x
    },
    offerTitles: Map {
      "201" => "DSL 50",
      "202" => "DSL 100"
    },
    offerSubtitles: Map {
      "201" => "ab 19,99€",
      "202" => "ab 24,99€"
    }
  },
  "bob@example.com" => {
    totalCount: 3,
    lastOfferId: "201",
    lastOfferTitle: "DSL 50",
    lastOfferSubtitle: "ab 19,99€",
    offerCounts: Map {
      "201" => 3
    },
    offerTitles: Map {
      "201" => "DSL 50"
    },
    offerSubtitles: Map {
      "201" => "ab 19,99€"
    }
  }
}
------------------------------------------------------------------------
*/

// Increments click counters and updates offer/title/subtitle for a user
function incClickCount(email, offerId, offerTitle, offerSubtitle) {
	const id = String(offerId || '123').trim() || '123'; // defensive fallback 123
	const state = clickCounts.get(email) || { totalCount: 0, lastOfferId: id, offerCounts: new Map() }; // initialize if missing

	state.totalCount = (state.totalCount || 0) + 1;
	state.lastOfferId = id;

	if (typeof offerTitle === 'string' && offerTitle.trim()) { // check for non-empty title
		if (!state.offerTitles) state.offerTitles = new Map(); // initialize if missing
		state.offerTitles.set(id, offerTitle.trim()); // store title for this offer id
		state.lastOfferTitle = offerTitle.trim(); // update last title
	}

	if (typeof offerSubtitle === 'string' && offerSubtitle.trim()) {
		if (!state.offerSubtitles) state.offerSubtitles = new Map();
		state.offerSubtitles.set(id, offerSubtitle.trim());
		state.lastOfferSubtitle = offerSubtitle.trim();
	}

	if (!state.offerCounts) state.offerCounts = new Map();
	const nextOffer = (state.offerCounts.get(id) || 0) + 1;
	state.offerCounts.set(id, nextOffer);

	clickCounts.set(email, state); // save back updated state to ClickCounts map

	const titleFromMap = state.offerTitles ? state.offerTitles.get(id) : undefined;
	const subtitleFromMap = state.offerSubtitles ? state.offerSubtitles.get(id) : undefined;
	const resolvedOfferTitle = typeof offerTitle === 'string' && offerTitle.trim() ? offerTitle.trim() : titleFromMap; // prefer passed title over stored title
	const resolvedOfferSubtitle =
		typeof offerSubtitle === 'string' && offerSubtitle.trim() ? offerSubtitle.trim() : subtitleFromMap;
	
	return {
		offerId: id,
		offerTitle: resolvedOfferTitle,
		offerSubtitle: resolvedOfferSubtitle,
		offerClicks: nextOffer,
		totalClicks: state.totalCount,
	};
}


// Returns all tracked users and their click data
function getClickCounts(productId) {
	return Array.from(clickCounts.entries()).map(([email, state]) => ({
		email,
		totalClicks: state.totalCount || 0,
		lastOfferId: state.lastOfferId,
		lastOfferTitle: state.lastOfferTitle,
		lastOfferSubtitle: state.lastOfferSubtitle,
		offers: Object.fromEntries(Array.from((state.offerCounts || new Map()).entries())),
	}));
}

module.exports = { incClickCount, getClickCounts };
