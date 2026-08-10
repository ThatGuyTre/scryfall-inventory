# MTG Inventory Tool

A [Next.js](https://nextjs.org/) app for keeping track of a Magic: The Gathering
collection. It imports a personal inventory from [ManaBox](https://www.manabox.app/),
illustrates it with card data from the [Scryfall API](https://scryfall.com/docs/api),
and scores it against popular Commander decks using [EDHREC](https://edhrec.com/).

| Page | Route | What it does |
| ---- | ----- | ------------ |
| Home | `/` | A sample of cards you actually own, with art, quantity and where each one is kept. |
| Inventory | `/inventory` | Searches and filters the collection, including by deck or binder. Also where importing starts. |
| My Binders | `/addadeck` | Lists every deck, binder and box in the collection, with a way into each. |
| Find a Commander Deck | `/findacommanderdeck` | Scores EDHREC's commanders against your cards. |
| Import from ManaBox | `/importfrommanabox` | Loads a `.csv` export, replacing or appending to what is stored. Reached from the Inventory page rather than the header. |

## Getting Started

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

Other scripts:

```bash
npm run build      # production build
npm run start      # serve the production build
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
```

## Finding a Commander deck

The finder scores [EDHREC](https://edhrec.com/)'s most played commanders against
what you own. A deck at 59% means 59% of an average deck for that commander is
already in your collection.

EDHREC does not publish a decklist per commander — it publishes how often each
card is played alongside it, plus the average number of creatures, instants,
lands and so on that its decks contain. Those two facts are combined into a
representative 100 card deck: each type's average slot count is filled with the
most played cards of that type. Basic lands are excluded from the score, since
everyone has those, and the commander itself is counted.

Three controls change the answer:

- **Card pool** — the whole collection, or only cards that are not already
  sleeved into a deck. The second is the default, because the useful question is
  usually what you could build without taking an existing deck apart.
- **Deck variant** — the aggregate average, one of the five Commander brackets,
  or EDHREC's budget and expensive tiers. These are genuinely different lists: a
  cEDH average runs 6 basic lands where an Exhibition average runs 15.
- **Colors** — commanders whose color identity fits inside your choice.

### What this costs EDHREC

EDHREC publishes no documented public API; the JSON behind its pages is read the
same way a browser would. That comes with obligations, and the client honors
them:

- One request for the hundred-commander ranking, then one per commander shown.
- Responses cached for a day, in memory, with identical concurrent requests
  collapsed into one.
- At most 3 requests in flight and one starting every 120ms, so a page is a
  steady trickle rather than a burst.
- Nothing is prefetched. Widening the color search pulls in one further ranking
  per click, and only when clicked.
- An honest `User-Agent`.

Because a hard color filter leaves very few commanders in the overall top 100,
**Find more** pulls in EDHREC's per-color rankings, which go far deeper. Mono
white goes from 2 candidates to 101 after one click, and 161 after two.

## Importing from ManaBox

Export your collection from the ManaBox app as a `.csv`, then open the Inventory
page and choose **Import from ManaBox**. Pick what should happen to the cards
already stored:

- **Append** — keep the current inventory and add the file's quantities on top.
- **Replace** — delete everything stored, then import the file as the whole
  inventory. This asks for a second click before it runs.

Columns are matched by name rather than by position, so ManaBox renaming or
reordering a column does not break the import. Only `Name` and `Quantity` are
required; anything else is optional. Rows with no name or an unusable quantity
are skipped and reported in the summary rather than failing the whole file.

Two rows are treated as the same card only when the printing, finish, condition,
language, alteration, misprint status **and location** all match — so the same
card in foil and non-foil stays on two separate rows, and so does a card that
sits in both a deck and a binder.

### Where cards are kept

Location comes from ManaBox's `Binder Name` and `Binder Type` columns, which
always win. Exports without those columns fall back to the deck or binder chosen
on the import form, and failing that the cards are filed as unassigned.

The Inventory page filters by location in two ways: a whole kind — every deck,
or every binder — or one named deck or binder. Both live in the URL, so a
filtered view can be linked to:

- `/inventory?kind=deck` — everything sleeved into a deck
- `/inventory?location=deck%23mono-red-burn` — one deck, which is how
  **My Binders** links into each of them

Naming a location beats asking for a kind, since it is the more specific of the
two.

## The inventory database

The inventory is stored in a single JSON document at `src/data/inventory.json`
(gitignored, created on first import). It is written atomically and writes are
serialized, which suits one person's collection on one machine.

Everything above storage talks to the `InventoryRepository` interface in
`src/lib/inventory/repository.ts` and nothing else, so the store can be swapped
without touching an API route or a component:

```
components + pages/api
        |
        v
InventoryRepository          <- src/lib/inventory/repository.ts
   |               |
   v               v
jsonRepository   dynamoRepository
(bundled)        (planned, AWS)
```

`getInventoryRepository()` in `src/lib/inventory/index.ts` picks the driver from
the `INVENTORY_DRIVER` environment variable.

Three constraints in the interface exist to keep it implementable on a NoSQL
store rather than only on a filesystem:

1. Every method is scoped by `ownerId` — the natural partition key.
2. Reads page by opaque cursor, never by offset, matching DynamoDB's
   `LastEvaluatedKey`.
3. Writes are merges (`mergeMany`, `replaceAll`) rather than read-modify-write,
   because DynamoDB can add to a counter atomically but cannot safely round-trip
   a whole document from a serverless handler.

### Moving to DynamoDB

`src/lib/inventory/dynamoRepository.ts` documents the intended single-table
design — partition key `OWNER#<id>`, sort key `CARD#<sort key>` — and how each
interface method maps onto a DynamoDB call. To finish it:

1. `npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb`
2. Implement the methods in that file.
3. Set `INVENTORY_DRIVER=dynamodb`, `INVENTORY_TABLE`, and the usual AWS region
   and credential variables.

No caller changes.

### Environment variables

| Variable            | Default                    | Purpose                                    |
| ------------------- | -------------------------- | ------------------------------------------ |
| `INVENTORY_DRIVER`  | `json`                     | `json` or `dynamodb`                       |
| `INVENTORY_FILE`    | `src/data/inventory.json`  | JSON driver only: where the document lives |
| `INVENTORY_TABLE`   | —                          | DynamoDB driver only: the table name       |

### API

| Method   | Route                       | Purpose                                |
| -------- | --------------------------- | -------------------------------------- |
| `GET`    | `/api/inventory`            | One page of cards plus stats. Accepts `search`, `location`, `kind`, `limit` and `cursor`. |
| `DELETE` | `/api/inventory`            | Empties the inventory.                 |
| `POST`   | `/api/inventory/import`     | Imports a ManaBox CSV. Body: `{ mode, csv, location? }`. |
| `GET`    | `/api/inventory/locations`  | Every deck, binder and box, with what each holds. |
| `GET`    | `/api/inventory/showcase`   | A random sample of the collection, joined to Scryfall art. Accepts `limit`. |
| `GET`    | `/api/commanders`           | Scores commander decks. Accepts `pool`, `variant`, `colors`, `page`, `limit` and `depth`. |

## Installable app

The site is a progressive web app: `public/manifest.webmanifest` describes it and
`public/sw.js` caches the app shell so it opens without a connection. The service
worker is hand written and registered only in production builds — a cached bundle
in development would serve stale code back on every reload.

Inventory requests are never cached, so an import always reflects what is
actually stored. Bump `CACHE_NAME` in `public/sw.js` to invalidate everything a
previous version cached.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme).

Note that serverless filesystems are ephemeral, so the JSON driver's document
resets whenever the instance recycles. Deploying for real is the point at which
the DynamoDB driver needs finishing.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.
