import {
	Alert,
	AlertIcon,
	Badge,
	Box,
	Button,
	Card,
	CardBody,
	Divider,
	Heading,
	HStack,
	Input,
	Spinner,
	Stack,
	Tab,
	TabList,
	TabPanel,
	TabPanels,
	Tabs,
	Text,
} from "@chakra-ui/react";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { addGroupMember, fetchGroup, removeGroupMember } from "@/src/lib/accounts/api";
import { GroupMember, GroupSummary } from "@/src/lib/accounts/types";
import { formatCount } from "@/components/inventory/format";
import DecklistCoverage from "./DecklistCoverage";

type GroupDetailProps = {
	groupId: string,
}

/**
 * One group: who is in it, and the decklist tool that is the point of it.
 *
 * Only the owner can change membership. Members can see each other, because
 * knowing whose collection you can read is not optional information.
 */
export default function GroupDetail({ groupId }: GroupDetailProps) {
	const router = useRouter();

	const [ group, setGroup ] = useState<GroupSummary | null>(null);
	const [ members, setMembers ] = useState<GroupMember[]>([]);
	const [ role, setRole ] = useState<"owner" | "member">("member");
	const [ email, setEmail ] = useState<string>("");
	const [ isLoading, setIsLoading ] = useState<boolean>(true);
	const [ isBusy, setIsBusy ] = useState<boolean>(false);
	const [ error, setError ] = useState<string | null>(null);
	const [ notice, setNotice ] = useState<string | null>(null);

	useEffect(() => {
		if (!groupId) {
			return;
		}

		const controller = new AbortController();

		async function load() {
			setIsLoading(true);
			setError(null);

			try {
				const detail = await fetchGroup(groupId, controller.signal);

				setGroup(detail.group);
				setMembers(detail.members);
				setRole(detail.role);
			} catch (caught) {
				if (!controller.signal.aborted) {
					setError(caught instanceof Error ? caught.message : "Could not load that group.");
				}
			} finally {
				if (!controller.signal.aborted) {
					setIsLoading(false);
				}
			}
		}

		load();

		return () => controller.abort();
	}, [groupId]);

	/**
	 * Invites someone by the address they signed in with.
	 */
	async function invite() {
		if (!email.includes("@")) {
			setError("That does not look like an email address.");
			return;
		}

		setIsBusy(true);
		setError(null);
		setNotice(null);

		try {
			const detail = await addGroupMember(groupId, email.trim());

			setGroup(detail.group);
			setMembers(detail.members);
			setEmail("");
			setNotice("Added.");
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Could not add them.");
		} finally {
			setIsBusy(false);
		}
	}

	/**
	 * Removes a member.
	 *
	 * @param userId Who to remove
	 */
	async function remove(userId: string) {
		setIsBusy(true);
		setError(null);
		setNotice(null);

		try {
			const detail = await removeGroupMember(groupId, userId);

			setGroup(detail.group);
			setMembers(detail.members);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Could not remove them.");
		} finally {
			setIsBusy(false);
		}
	}

	if (isLoading) {
		return (
			<HStack justify="center" py={10}>
				<Spinner color="desaturatedGreen" />
				<Heading color="gray" size="lg">Loading...</Heading>
			</HStack>
		);
	}

	if (!group) {
		return (
			<Box maxW="700px" m="auto" px={{ base: 3, md: "1vh" }} py={{ base: 4, md: "4vh" }}>
				<Stack spacing={4}>
					<Alert status="error" borderRadius={5}>
						<AlertIcon />
						{error ?? "No such group."}
					</Alert>
					<Button variant="outline" borderColor="desaturatedGreen" alignSelf="flex-start" onClick={() => router.push("/groups")}>
						Back to your groups
					</Button>
				</Stack>
			</Box>
		);
	}

	return (
		<Box maxW="1400px" m="auto" px={{ base: 3, md: "1vh" }} py={{ base: 4, md: "4vh" }}>
			<Stack spacing={{ base: 4, md: 6 }}>

				<Stack direction={{ base: "column", md: "row" }} justify="space-between" align={{ base: "stretch", md: "center" }} spacing={3}>
					<Box>
						<HStack spacing={2} flexWrap="wrap">
							<Heading size={{ base: "md", md: "lg" }} color="gray">{group.name}</Heading>
							{role === "owner" ? <Badge colorScheme="purple">You own this</Badge> : null}
						</HStack>
						<Text color="darkGreen" mt={1} fontSize="sm">
							{formatCount(group.memberCount)} member{group.memberCount === 1 ? "" : "s"}
							{" · "}
							{formatCount(members.reduce((total, member) => total + member.cardCount, 0))} cards between them
							{group.invitedCount > 0 ? ` · ${formatCount(group.invitedCount)} invitation${group.invitedCount === 1 ? "" : "s"} outstanding` : ""}
						</Text>
					</Box>
					<Button variant="outline" borderColor="desaturatedGreen" onClick={() => router.push("/groups")}>
						All groups
					</Button>
				</Stack>

				{error ? (
					<Alert status="error" borderRadius={5}>
						<AlertIcon />
						{error}
					</Alert>
				) : null}

				<Tabs colorScheme="green" variant="enclosed">
					<TabList>
						<Tab color="gray">Decklist coverage</Tab>
						<Tab color="gray">Members</Tab>
					</TabList>

					<TabPanels>
						<TabPanel px={0}>
							<DecklistCoverage groupId={groupId} members={members} />
						</TabPanel>

						<TabPanel px={0}>
							<Stack spacing={4}>

								{role === "owner" ? (
									<Card background="offWhite" borderRadius={5}>
										<CardBody px={{ base: 3, md: 5 }}>
											<Stack spacing={3}>
												<Box>
													<Text fontWeight="bold" color="gray">Add someone</Text>
													<Text fontSize="sm" color="darkGreen">
														By the email address they signed in with. They need an
														account already — there are no invitations to accept.
													</Text>
												</Box>
												<Stack direction={{ base: "column", sm: "row" }} spacing={3}>
													<Input
														value={email}
														onChange={(event) => setEmail(event.target.value)}
														onKeyDown={(event) => { if (event.key === "Enter") invite(); }}
														placeholder="them@example.com"
														background="white"
														borderColor="desaturatedGreen"
													/>
													<Button colorScheme="green" isLoading={isBusy} onClick={invite} flexShrink={0}>
														Add
													</Button>
												</Stack>
												{notice ? <Text color="darkGreen" fontSize="sm">{notice}</Text> : null}
											</Stack>
										</CardBody>
									</Card>
								) : (
									<Alert status="info" borderRadius={5}>
										<AlertIcon />
										Only the group&apos;s owner can add or remove people.
									</Alert>
								)}

								<Card background="offWhite" borderRadius={5}>
									<CardBody px={{ base: 3, md: 5 }}>
										<Stack spacing={3} divider={<Divider borderColor="lightGray" />}>
											{members.map((member) => (
												<Stack key={member.userId} direction={{ base: "column", sm: "row" }} justify="space-between" align={{ base: "flex-start", sm: "center" }} spacing={2}>
													<Box>
														<HStack spacing={2} flexWrap="wrap">
															<Text fontWeight="bold" color="gray">{member.username}</Text>
															{member.role === "owner" ? <Badge colorScheme="purple">Owner</Badge> : null}
															{member.status === "invited" ? <Badge colorScheme="orange">Invited</Badge> : null}
														</HStack>
														<Text fontSize="sm" color="darkGreen">
															{member.email}
															{" · "}
															{member.status === "invited"
																? "Waiting on their answer"
																: `${formatCount(member.cardCount)} cards`}
														</Text>
													</Box>
													{role === "owner" && member.role !== "owner" ? (
														<Button
															size="sm"
															variant="outline"
															colorScheme="red"
															isLoading={isBusy}
															onClick={() => remove(member.userId)}
														>
															{member.status === "invited" ? "Cancel invite" : "Remove"}
														</Button>
													) : null}
												</Stack>
											))}
										</Stack>
									</CardBody>
								</Card>

							</Stack>
						</TabPanel>
					</TabPanels>
				</Tabs>

			</Stack>
		</Box>
	);
}
