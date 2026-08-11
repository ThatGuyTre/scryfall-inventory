import {
	Alert,
	AlertDescription,
	AlertIcon,
	AlertTitle,
	Badge,
	Box,
	Button,
	Card,
	CardBody,
	Checkbox,
	Heading,
	HStack,
	Input,
	Progress,
	Spinner,
	Stack,
	Tag,
	Text,
	Textarea,
	useClipboard,
} from "@chakra-ui/react";
import { CheckIcon, CopyIcon, DeleteIcon, RepeatIcon } from "@chakra-ui/icons";
import { useEffect, useMemo, useState } from "react";
import { deleteDecklist, fetchCollection, fetchDecklists, saveDecklist } from "@/src/lib/accounts/api";
import { GroupDecklist, GroupMember } from "@/src/lib/accounts/types";
import { normalizeCardName } from "@/src/lib/inventory/card";
import {
	MatchableCollection,
	buildBuyList,
	formatAsMoxfield,
	resolveCoverage,
} from "@/src/lib/decklists/coverage";
import { parseDecklist } from "@/src/lib/decklists/parse";
import { formatCount } from "@/components/inventory/format";

type DecklistCoverageProps = {
	groupId: string,
	members: GroupMember[],
}

/**
 * Paste a decklist, see who in the group can supply each card.
 *
 * Collections are fetched once and held in memory; matching then happens here,
 * locally, on every keystroke of the paste box. A refresh button re-fetches,
 * because a collection is only as current as the last time it was read and
 * pretending otherwise would be worse than saying so.
 */
export default function DecklistCoverage({ groupId, members }: DecklistCoverageProps) {
	const [ text, setText ] = useState<string>("");
	const [ collections, setCollections ] = useState<MatchableCollection[]>([]);
	const [ fetchedAt, setFetchedAt ] = useState<string | null>(null);
	const [ isLoading, setIsLoading ] = useState<boolean>(false);
	const [ error, setError ] = useState<string | null>(null);

	/** Cards a member owns but cannot part with, keyed by normalized name. */
	const [ unavailable, setUnavailable ] = useState<Set<string>>(new Set());

	const [ saved, setSaved ] = useState<GroupDecklist[]>([]);
	const [ listName, setListName ] = useState<string>("");
	const [ isSaving, setIsSaving ] = useState<boolean>(false);

	// The group's saved lists, so a deck worked out once can be reopened rather
	// than pasted again.
	useEffect(() => {
		const controller = new AbortController();

		async function load() {
			try {
				setSaved(await fetchDecklists(groupId, controller.signal));
			} catch {
				// A missing list of lists is not worth an error banner over the
				// paste box, which is what people came for.
			}
		}

		load();

		return () => controller.abort();
	}, [groupId]);

	/**
	 * Saves the pasted list against the group.
	 */
	async function save() {
		setIsSaving(true);
		setError(null);

		try {
			const stored = await saveDecklist(groupId, listName.trim() || "Untitled list", text);

			setSaved((current) => [stored, ...current]);
			setListName("");
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Could not save that list.");
		} finally {
			setIsSaving(false);
		}
	}

	/**
	 * Removes a saved list.
	 *
	 * @param id Which list
	 */
	async function remove(id: string) {
		try {
			await deleteDecklist(groupId, id);
			setSaved((current) => current.filter((entry) => entry.id !== id));
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Could not delete that list.");
		}
	}

	/**
	 * Fetches every member's collection.
	 *
	 * One request per member, in parallel. Each is 58 KB gzipped for a five
	 * thousand card collection, so a whole playgroup is a few hundred kilobytes.
	 */
	async function loadCollections() {
		setIsLoading(true);
		setError(null);

		try {
			// Only people who have accepted. An invitee's collection is not
			// readable yet, and asking for it would rightly be refused.
			const joined = members.filter((member) => member.status === "accepted");

			const loaded = await Promise.all(joined.map(async (member) => {
				const collection = await fetchCollection(member.userId);

				return {
					ownerId: collection.ownerId,
					displayName: collection.isSelf ? "You" : (member.username || collection.displayName),
					isSelf: collection.isSelf,
					cards: collection.cards,
				};
			}));

			setCollections(loaded);
			setFetchedAt(new Date().toLocaleTimeString());
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Could not read the group's collections.");
		} finally {
			setIsLoading(false);
		}
	}

	// Parsing and matching are cheap enough to redo whenever the text changes;
	// memoising keeps it off every unrelated render.
	const parsed = useMemo(() => parseDecklist(text), [text]);
	const coverage = useMemo(
		() => resolveCoverage(parsed.entries, collections),
		[parsed.entries, collections],
	);

	const buyList = useMemo(() => buildBuyList(coverage, unavailable), [coverage, unavailable]);
	const buyText = useMemo(() => formatAsMoxfield(buyList), [buyList]);
	const { onCopy, hasCopied } = useClipboard(buyText);

	/**
	 * Marks a card as one nobody will actually hand over, or unmarks it.
	 *
	 * @param name The card name
	 */
	function toggleUnavailable(name: string) {
		const key = normalizeCardName(name);

		setUnavailable((current) => {
			const next = new Set(current);

			if (next.has(key)) {
				next.delete(key);
			} else {
				next.add(key);
			}

			return next;
		});
	}

	const percent = coverage.totalRows === 0
		? 0
		: Math.round((coverage.coveredRows / coverage.totalRows) * 100);

	return (
		<Stack spacing={{ base: 4, md: 5 }}>

			<Card background="offWhite" borderRadius={5}>
				<CardBody px={{ base: 3, md: 5 }}>
					<Stack spacing={4}>
						<Box>
							<Text fontWeight="bold" color="gray" mb={1}>Paste a decklist</Text>
							<Text fontSize="sm" color="darkGreen">
								Moxfield&apos;s export format, or anything close to it. Quantities lead each
								line; set codes, collector numbers, foil markers and section headings are all
								understood and optional.
							</Text>
						</Box>

						<Textarea
							value={text}
							onChange={(event) => setText(event.target.value)}
							placeholder={"1 Sol Ring (MSC) 211\n1 Arcane Signet\n4x Llanowar Elves *F*"}
							rows={8}
							background="white"
							borderColor="desaturatedGreen"
							fontFamily="mono"
							fontSize="sm"
						/>

						<Stack direction={{ base: "column", sm: "row" }} spacing={2} align={{ base: "stretch", sm: "center" }}>
							<Button
								colorScheme="green"
								leftIcon={collections.length > 0 ? <RepeatIcon /> : undefined}
								isLoading={isLoading}
								loadingText="Reading collections"
								onClick={loadCollections}
							>
								{collections.length > 0 ? "Refresh collections" : "Load collections"}
							</Button>
							{fetchedAt ? (
								<Text fontSize="sm" color="darkGreen">
									Read {formatCount(collections.length)} collection{collections.length === 1 ? "" : "s"} at {fetchedAt}.
								</Text>
							) : (
								<Text fontSize="sm" color="darkGreen">
									Load the group&apos;s collections to match against them.
								</Text>
							)}
						</Stack>

						{text.trim() ? (
							<Stack direction={{ base: "column", sm: "row" }} spacing={2}>
								<Input
									value={listName}
									onChange={(event) => setListName(event.target.value)}
									placeholder="Name this list to save it"
									background="white"
									borderColor="desaturatedGreen"
									size="sm"
									maxLength={120}
								/>
								<Button
									size="sm"
									variant="outline"
									borderColor="desaturatedGreen"
									isLoading={isSaving}
									onClick={save}
									flexShrink={0}
								>
									Save to group
								</Button>
							</Stack>
						) : null}

						{saved.length > 0 ? (
							<Stack spacing={1}>
								<Text fontSize="sm" fontWeight="bold" color="gray">Saved lists</Text>
								{saved.map((entry) => (
									<HStack key={entry.id} spacing={2} flexWrap="wrap">
										<Button
											size="xs"
											variant="ghost"
											color="darkGreen"
											onClick={() => setText(entry.text)}
										>
											{entry.name}
										</Button>
										<Button
											size="xs"
											variant="ghost"
											colorScheme="red"
											leftIcon={<DeleteIcon />}
											onClick={() => remove(entry.id)}
											aria-label={`Delete ${entry.name}`}
										>
											Delete
										</Button>
									</HStack>
								))}
							</Stack>
						) : null}

						{parsed.unreadable.length > 0 ? (
							<Alert status="warning" borderRadius={5} alignItems="flex-start">
								<AlertIcon />
								<Box>
									<AlertTitle>{parsed.unreadable.length} line(s) could not be read</AlertTitle>
									<AlertDescription display="block" fontSize="sm">
										{parsed.unreadable.slice(0, 6).map((line) => (
											<Text key={line.line}>Line {line.line}: {line.reason} — &ldquo;{line.text}&rdquo;</Text>
										))}
									</AlertDescription>
								</Box>
							</Alert>
						) : null}
					</Stack>
				</CardBody>
			</Card>

			{error ? (
				<Alert status="error" borderRadius={5}>
					<AlertIcon />
					{error}
				</Alert>
			) : null}

			{isLoading ? (
				<HStack justify="center" py={6}>
					<Spinner color="desaturatedGreen" />
					<Text color="gray">Reading collections...</Text>
				</HStack>
			) : null}

			{coverage.totalRows > 0 && collections.length > 0 ? (
				<>
					<Card background="offWhite" borderRadius={5}>
						<CardBody px={{ base: 3, md: 5 }}>
							<Stack spacing={2}>
								<HStack justify="space-between" flexWrap="wrap">
									<Heading size="sm" color="gray">
										{formatCount(coverage.coveredRows)} of {formatCount(coverage.totalRows)} cards covered
									</Heading>
									<Text color="darkGreen" fontSize="sm">
										{formatCount(coverage.availableCards)} of {formatCount(coverage.requestedCards)} copies
									</Text>
								</HStack>
								<Progress
									value={percent}
									colorScheme={percent >= 90 ? "green" : percent >= 50 ? "yellow" : "red"}
									borderRadius={3}
									size="sm"
								/>
							</Stack>
						</CardBody>
					</Card>

					{buyList.length > 0 ? (
						<Card background="offWhite" borderRadius={5}>
							<CardBody px={{ base: 3, md: 5 }}>
								<Stack spacing={3}>
									<HStack justify="space-between" flexWrap="wrap">
										<Heading size="sm" color="gray">
											To find: {formatCount(buyList.length)} card{buyList.length === 1 ? "" : "s"}
										</Heading>
										<Button
											size="sm"
											colorScheme="green"
											leftIcon={hasCopied ? <CheckIcon /> : <CopyIcon />}
											onClick={onCopy}
										>
											{hasCopied ? "Copied" : "Copy for Moxfield"}
										</Button>
									</HStack>
									<Text fontSize="sm" color="darkGreen">
										Cards nobody has, plus any you have marked as un-borrowable below.
										Copies in mass-entry format, ready to paste into a shop.
									</Text>
									<Box
										as="pre"
										background="white"
										borderRadius={4}
										border="1px solid"
										borderColor="lightGray"
										p={3}
										fontSize="sm"
										overflowX="auto"
										color="gray"
									>
										{buyText}
									</Box>
								</Stack>
							</CardBody>
						</Card>
					) : null}

					<Stack spacing={2}>
						{coverage.rows.map((row) => {
							const key = normalizeCardName(row.name);
							const isMarked = unavailable.has(key);

							return (
								<Card key={key} background="offWhite" borderRadius={5}>
									<CardBody px={{ base: 3, md: 4 }} py={3}>
										<Stack spacing={2}>
											<HStack justify="space-between" flexWrap="wrap" spacing={2}>
												<HStack spacing={2} flexWrap="wrap">
													<Text fontWeight="bold" color="gray">
														{row.requested}× {row.name}
													</Text>
													{row.isCovered && !isMarked ? (
														<Badge colorScheme="green">Covered</Badge>
													) : (
														<Badge colorScheme="red">
															{row.available > 0 ? `Only ${row.available}` : "Nobody has this"}
														</Badge>
													)}
													{row.onlyInDecks ? (
														<Badge colorScheme="orange">Only inside a deck</Badge>
													) : null}
												</HStack>

												{row.isCovered ? (
													<Checkbox
														isChecked={isMarked}
														onChange={() => toggleUnavailable(row.name)}
														colorScheme="red"
														size="sm"
													>
														<Text fontSize="sm" color="darkGreen">Can&apos;t borrow</Text>
													</Checkbox>
												) : null}
											</HStack>

											{row.owned.length > 0 ? (
												<Stack spacing={1} pl={1}>
													{row.owned.map((copy, index) => (
														<HStack key={`${copy.ownerId}-${index}`} spacing={2} flexWrap="wrap" fontSize="sm">
															<Text color={copy.isSelf ? "gray" : "darkGreen"} fontWeight={copy.isSelf ? "bold" : "normal"}>
																{copy.displayName}
															</Text>
															<Text color="darkGreen">{copy.quantity} cop{copy.quantity === 1 ? "y" : "ies"}</Text>
															<Tag size="sm" colorScheme={copy.inDeck ? "purple" : "blue"}>
																{copy.locationName || copy.locationKind}
															</Tag>
															{copy.setCode ? <Tag size="sm" colorScheme="gray">{copy.setCode}</Tag> : null}
															{copy.finish !== "normal" ? <Tag size="sm" colorScheme="teal">{copy.finish}</Tag> : null}
														</HStack>
													))}
												</Stack>
											) : null}
										</Stack>
									</CardBody>
								</Card>
							);
						})}
					</Stack>
				</>
			) : null}

			{coverage.totalRows > 0 && collections.length === 0 && !isLoading ? (
				<Alert status="info" borderRadius={5}>
					<AlertIcon />
					{formatCount(coverage.totalRows)} cards read from your list. Load the group&apos;s
					collections to see who can supply them.
				</Alert>
			) : null}

		</Stack>
	);
}
