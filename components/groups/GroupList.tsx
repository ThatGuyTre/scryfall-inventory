import {
	Alert,
	AlertIcon,
	Badge,
	Box,
	Button,
	Card,
	CardBody,
	Heading,
	HStack,
	Input,
	SimpleGrid,
	Spinner,
	Stack,
	Text,
} from "@chakra-ui/react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { answerInvitation, createGroup, fetchGroups } from "@/src/lib/accounts/api";
import { GroupSummary } from "@/src/lib/accounts/types";
import { formatCount } from "@/components/inventory/format";

/**
 * The groups screen: the groups you are in, and a box to make another.
 *
 * A group is the unit of sharing. Being in one means every other member can read
 * your collection, which is stated on screen rather than left to be inferred.
 */
export default function GroupList() {
	const router = useRouter();
	const { status } = useSession();

	const [ groups, setGroups ] = useState<GroupSummary[]>([]);
	const [ name, setName ] = useState<string>("");
	const [ isLoading, setIsLoading ] = useState<boolean>(true);
	const [ isCreating, setIsCreating ] = useState<boolean>(false);
	const [ answering, setAnswering ] = useState<string | null>(null);
	const [ error, setError ] = useState<string | null>(null);

	useEffect(() => {
		const controller = new AbortController();

		async function load() {
			// Signed-out visitors get the explanation below instead of a list, so
			// there is nothing to fetch.
			if (status !== "authenticated") {
				setIsLoading(false);
				return;
			}

			setIsLoading(true);
			setError(null);

			try {
				setGroups(await fetchGroups(controller.signal));
			} catch (caught) {
				if (!controller.signal.aborted) {
					setError(caught instanceof Error ? caught.message : "Could not load your groups.");
				}
			} finally {
				if (!controller.signal.aborted) {
					setIsLoading(false);
				}
			}
		}

		load();

		return () => controller.abort();
	}, [status]);

	/**
	 * Creates a group and opens it.
	 */
	async function submit() {
		if (!name.trim()) {
			return;
		}

		setIsCreating(true);
		setError(null);

		try {
			const created = await createGroup(name.trim());
			setName("");
			router.push(`/groups/${created.id}`);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Could not create that group.");
			setIsCreating(false);
		}
	}

	/**
	 * Accepts or declines an invitation, then updates the list in place.
	 *
	 * @param groupId Which group
	 * @param action What to do about it
	 */
	async function answer(groupId: string, action: "accept" | "decline") {
		setAnswering(groupId);
		setError(null);

		try {
			await answerInvitation(groupId, action);

			if (action === "decline") {
				// Declining deletes the membership, so the row goes entirely.
				setGroups((current) => current.filter((group) => group.id !== groupId));
			} else {
				setGroups((current) => current.map((group) => (
					group.id === groupId
						? { ...group, status: "accepted", memberCount: group.memberCount + 1, invitedCount: Math.max(0, group.invitedCount - 1) }
						: group
				)));
			}
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Could not answer that invitation.");
		} finally {
			setAnswering(null);
		}
	}

	const invitations = groups.filter((group) => group.status === "invited");
	const joined = groups.filter((group) => group.status === "accepted");

	if (status === "unauthenticated") {
		return (
			<Box maxW="700px" m="auto" px={{ base: 3, md: "1vh" }} py={{ base: 4, md: "4vh" }}>
				<Card background="offWhite" borderRadius={5}>
					<CardBody>
						<Stack spacing={3} align="flex-start">
							<Heading size="md" color="gray">Groups need an account</Heading>
							<Text color="darkGreen">
								A group shares collections between people, so there has to be somebody to
								share with. Everything else on this site works without signing in.
							</Text>
							<Button colorScheme="green" onClick={() => router.push("/signin")}>Sign in</Button>
						</Stack>
					</CardBody>
				</Card>
			</Box>
		);
	}

	return (
		<Box maxW="1400px" m="auto" px={{ base: 3, md: "1vh" }} py={{ base: 4, md: "4vh" }}>
			<Stack spacing={{ base: 4, md: 6 }}>

				<Box>
					<Heading size={{ base: "md", md: "lg" }} color="gray">Groups</Heading>
					<Text color="darkGreen" mt={2}>
						Everyone in a group can read everyone else&apos;s collection, which is what makes
						it possible to ask who can supply the cards for a deck. Nobody can change anyone
						else&apos;s cards.
					</Text>
				</Box>

				{/*
					Invitations come first. Being in a group means other people can
					read your collection, so an unanswered invitation is the most
					important thing on this page.
				*/}
				{invitations.length > 0 ? (
					<Stack spacing={3}>
						<Heading size="md" color="gray">
							{invitations.length === 1 ? "You have an invitation" : `You have ${invitations.length} invitations`}
						</Heading>
						{invitations.map((group) => (
							<Card key={group.id} background="offWhite" borderRadius={5} borderLeft="4px solid" borderLeftColor="desaturatedGreen">
								<CardBody px={{ base: 3, md: 5 }}>
									<Stack direction={{ base: "column", md: "row" }} justify="space-between" align={{ base: "stretch", md: "center" }} spacing={3}>
										<Box>
											<HStack spacing={2} flexWrap="wrap">
												<Heading size="sm" color="gray">{group.name}</Heading>
												<Badge colorScheme="orange">Invited</Badge>
											</HStack>
											<Text color="darkGreen" fontSize="sm" mt={1}>
												{formatCount(group.memberCount)} member{group.memberCount === 1 ? "" : "s"} already.
												Accepting lets them read your collection, and you read theirs.
											</Text>
										</Box>
										<HStack spacing={2} flexShrink={0}>
											<Button
												size="sm"
												colorScheme="green"
												isLoading={answering === group.id}
												onClick={() => answer(group.id, "accept")}
											>
												Accept
											</Button>
											<Button
												size="sm"
												variant="outline"
												colorScheme="red"
												isDisabled={answering === group.id}
												onClick={() => answer(group.id, "decline")}
											>
												Decline
											</Button>
										</HStack>
									</Stack>
								</CardBody>
							</Card>
						))}
					</Stack>
				) : null}

				<Card background="offWhite" borderRadius={5}>
					<CardBody px={{ base: 3, md: 5 }}>
						<Stack spacing={3}>
							<Text fontWeight="bold" color="gray">Start a group</Text>
							<Stack direction={{ base: "column", sm: "row" }} spacing={3}>
								<Input
									value={name}
									onChange={(event) => setName(event.target.value)}
									onKeyDown={(event) => { if (event.key === "Enter") submit(); }}
									placeholder="Thursday night playgroup"
									background="white"
									borderColor="desaturatedGreen"
									maxLength={80}
								/>
								<Button
									colorScheme="green"
									isDisabled={!name.trim()}
									isLoading={isCreating}
									loadingText="Creating"
									onClick={submit}
									flexShrink={0}
								>
									Create
								</Button>
							</Stack>
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
					<HStack justify="center" py={10}>
						<Spinner color="desaturatedGreen" />
						<Heading color="gray" size="lg">Loading...</Heading>
					</HStack>
				) : null}

				{!isLoading && joined.length === 0 && invitations.length === 0 && !error ? (
					<Card background="offWhite" borderRadius={5}>
						<CardBody>
							<Stack spacing={2} align="flex-start">
								<Heading size="md" color="gray">You are not in a group yet</Heading>
								<Text color="darkGreen">
									Make one above, then invite people by the email address they signed in
									with.
								</Text>
							</Stack>
						</CardBody>
					</Card>
				) : null}

				{joined.length > 0 ? (
					<SimpleGrid columns={{ base: 1, sm: 2, lg: 3 }} spacing={4}>
						{joined.map((group) => (
							<Card
								key={group.id}
								background="offWhite"
								borderRadius={5}
								cursor="pointer"
								_hover={{ boxShadow: "0 0 0 3px #74b87d", transition: "box-shadow 0.2s ease-in-out" }}
								onClick={() => router.push(`/groups/${group.id}`)}
							>
								<CardBody px={{ base: 3, md: 5 }}>
									<Stack spacing={2}>
										<HStack flexWrap="wrap" spacing={2}>
											<Heading size="sm" color="gray" noOfLines={2}>{group.name}</Heading>
											{group.role === "owner" ? (
												<Badge colorScheme="purple">Owner</Badge>
											) : null}
										</HStack>
										<Text color="darkGreen" fontSize="sm">
											{formatCount(group.memberCount)} member{group.memberCount === 1 ? "" : "s"}
											{group.invitedCount > 0 ? ` · ${formatCount(group.invitedCount)} invited` : ""}
										</Text>
										<Button size="sm" variant="outline" borderColor="desaturatedGreen" alignSelf="flex-start">
											Open
										</Button>
									</Stack>
								</CardBody>
							</Card>
						))}
					</SimpleGrid>
				) : null}

			</Stack>
		</Box>
	);
}
