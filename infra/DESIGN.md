# Phase 2 — collaboration design

Multiple people, each with their own collection, able to form groups that grant
read access to each other's cards.

This document is the specification the code follows.

## The decision that shapes everything: match on the client

A collection is fetched **whole, once**, and every ownership question is then
answered in memory in the browser. A refresh button re-fetches. The same applies
to other people's collections once a group grants read access.

That sounds extravagant until it is measured. Against a real 4,985 card
collection:

| Payload | Raw | Gzipped |
| ------- | --- | ------- |
| Full card rows | 2,781 KB | 289 KB |
| Trimmed to what matching needs | 315 KB | **58 KB** |
| A five person group, trimmed | — | **292 KB** |

58 KB is less than one card image. So the entire class of problems around
looking cards up efficiently — per-name queries, aggregate items, denormalized
indexes — simply does not arise. Two earlier designs were discarded for this
one, and both deserve recording so they are not reinvented:

- **One roll-up item per user** holding every name and quantity. 79 KB for this
  collection, which fits DynamoDB's 400 KB item limit — but `UpdateItem` is
  billed on the whole item size, so editing one card's quantity would cost
  ~79 WCU. It punishes exactly the fine-grained editing this app should grow.
- **One small item per distinct card name**, incrementally updated. Cheaper
  reads (293 KB versus 3 MB for the card rows), but 4,064 extra items per user
  to keep consistent, and aggregates discard the set code and location that the
  decklist view has to display.

Neither is needed. Cards are stored once, as themselves.

### What the server still does

Matching moves to the client; authority does not. The server decides **which**
collections a caller may read — their own, plus those of groups they belong to —
and returns nothing else. A trimmed collection endpoint is the only new read.

## Identity

AWS Cognito is the identity provider; `next-auth@4` is the client, using its
Cognito provider and a JWT session. Cognito owns emails and passwords; this app
never sees a password.

Cognito's `sub` **is** the app's user id, so there is no second identifier to
keep in sync. A user row holds only what Cognito does not: username, first and
last name, and the collection counters below.

## Anonymous use

A visitor who is not signed in gets the whole app, with nothing written to the
server. Their imported collection lives in **IndexedDB in their own browser**.

Chosen over a server-side session cache because "nothing is saved to the server"
should be a fact about where the bytes are, not a promise about a cache's
lifetime. The UI says so plainly, with a prompt to sign in to keep a collection.

Client-side matching makes this nearly free: an anonymous collection and a
fetched one are the same shape in memory, so every feature works identically.
Only the source differs.

## Single-table design

One table. Partition key `pk`, sort key `sk`.

| Item           | pk              | sk                       | Holds |
| -------------- | --------------- | ------------------------ | ----- |
| User           | `USER#<sub>`    | `PROFILE`                | username, names, counters |
| Card           | `OWNER#<sub>`   | `CARD#<sortKey>`         | the fields of InventoryCard |
| Location total | `OWNER#<sub>`   | `LOC#<locationKey>`      | kind, name, counts, visibility |
| Group          | `GROUP#<id>`    | `META`                   | name, owner, created |
| Membership     | `GROUP#<id>`    | `MEMBER#<sub>`           | role, joined |
| Reverse member | `USER#<sub>`    | `GROUP#<id>`             | role, group name |
| Decklist       | `GROUP#<id>`    | `DECK#<id>`              | name, author, card lines |

The card sort key already begins with the card's normalized name — a real one
reads `CARD#timely-reinforcements#6ae4669c-...#normal#near-mint#en#std#ok#binder#playables-big-box`.
So `begins_with` lookups by name are available if a server-side path ever wants
one. Nothing needs it today.

### Counters on the user profile

`stats()` never reads the collection. The profile carries `uniqueCards`,
`totalQuantity`, `setCount` and `locationCount`, written once per import and
adjusted by delta when a single card changes. `LOC#` items carry the same
per-location.

### Reverse membership items

Membership is stored twice: under the group so members can be listed, and under
the user so a user's groups can be listed. Both are single queries. The
duplication is two small items per join, written together in a transaction.

## Access patterns

| # | Need | Query |
| - | ---- | ----- |
| 1 | Sign in | `GetItem USER#<sub> / PROFILE`, created on first sign-in |
| 2 | Edit profile | `UpdateItem USER#<sub> / PROFILE` |
| 3 | Fetch a collection | `Query OWNER#<sub>`, `begins_with(sk, "CARD#")`, all pages |
| 4 | Collection stats | pattern 1, no scan |
| 5 | Decks and binders | `Query OWNER#<sub>`, `begins_with(sk, "LOC#")` |
| 6 | A user's groups | `Query USER#<sub>`, `begins_with(sk, "GROUP#")` |
| 7 | A group's members | `Query GROUP#<id>`, `begins_with(sk, "MEMBER#")` |
| 8 | A group's decklists | `Query GROUP#<id>`, `begins_with(sk, "DECK#")` |
| 9 | Import | `BatchWriteItem` cards, `ADD` on LOC#, counters on profile |

Browsing, filtering, searching, commander coverage and decklist coverage are all
computed in the browser from pattern 3. GSI-1 (`gsi1pk = OWNER#<sub>#KIND#<kind>`)
is kept for server-side location filtering, since paging one large binder without
fetching everything is still worth having.

## Commander finder, after the change

The server returns EDHREC's average decks — card name lists — and the browser
scores them against the collection in memory. Consequences:

- `nameIndex()` leaves the repository interface. Nothing calls it server-side.
- The whole-collection versus not-in-a-deck pool becomes a client-side filter.
- Group scoring is a union of collections already in memory, with no fan-out.
- Anonymous users get commander scoring with no special path.

## Decklist coverage

Paste a list in Moxfield's format; see who in the group can supply each card.
Output is **alphabetical by card name**.

Per card: the requested quantity, whether the group covers it, and for each
owner their copies, the location holding them, and the set code. A copy already
sleeved into someone's deck is marked, since borrowing it means taking that deck
apart.

Two outputs, not one:

- **Cards nobody has** — copyable to the clipboard in Moxfield format, ready to
  paste into a shop's mass entry box.
- **Cards someone has but cannot lend** — any covered card can be added to that
  same list by hand, because "Marcus owns it" and "Marcus will part with it" are
  different facts and only the second one matters when buying.

## Visibility (designed now, fixed open for now)

Every `LOC#` item carries `visibility`, and the profile carries
`defaultVisibility`. Group reads will filter on it.

For this branch both are hard-coded to `"public"` and nothing reads them, so
group members see everything. The field exists so that turning it on later is a
UI change and a filter, not a migration.

## What does not change

`InventoryRepository` keeps its shape apart from losing `nameIndex`. Every
method was already scoped by `ownerId`, pages by opaque cursor, and writes as
merges — which is why this phase adds a driver rather than rewriting callers.
The JSON driver stays for local use without AWS credentials.
