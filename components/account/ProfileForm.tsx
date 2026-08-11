import {
	Alert,
	AlertIcon,
	Badge,
	Box,
	Button,
	Card,
	CardBody,
	FormControl,
	FormHelperText,
	FormLabel,
	Heading,
	HStack,
	Input,
	Spinner,
	Stack,
	Text,
} from "@chakra-ui/react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { UserProfile } from "@/src/lib/accounts/types";

/**
 * The profile screen.
 *
 * Shows the address the account is attached to, which the identity provider
 * owns and nobody can edit here, and the three fields that are the person's
 * own. Saving is explicit rather than on every keystroke, so a half-typed name
 * is never what gets stored.
 */
export default function ProfileForm() {
	const router = useRouter();
	const { data: session, status } = useSession();

	const [ profile, setProfile ] = useState<UserProfile | null>(null);
	const [ username, setUsername ] = useState<string>("");
	const [ firstName, setFirstName ] = useState<string>("");
	const [ lastName, setLastName ] = useState<string>("");
	const [ isLoading, setIsLoading ] = useState<boolean>(true);
	const [ isSaving, setIsSaving ] = useState<boolean>(false);
	const [ saved, setSaved ] = useState<boolean>(false);
	const [ error, setError ] = useState<string | null>(null);

	useEffect(() => {
		if (status !== "authenticated") {
			return;
		}

		const controller = new AbortController();

		async function load() {
			setIsLoading(true);
			setError(null);

			try {
				const response = await fetch("/api/profile", { signal: controller.signal });
				const body = await response.json();

				if (!response.ok) {
					throw new Error(body?.error ?? "Could not load your profile.");
				}

				setProfile(body);
				setUsername(body.username ?? "");
				setFirstName(body.firstName ?? "");
				setLastName(body.lastName ?? "");
			} catch (caught) {
				if (!controller.signal.aborted) {
					setError(caught instanceof Error ? caught.message : "Could not load your profile.");
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
	 * Saves the editable fields.
	 */
	async function save() {
		setIsSaving(true);
		setError(null);
		setSaved(false);

		try {
			const response = await fetch("/api/profile", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ username, firstName, lastName }),
			});
			const body = await response.json();

			if (!response.ok) {
				throw new Error(body?.error ?? "Could not save your profile.");
			}

			setProfile(body);
			setSaved(true);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Could not save your profile.");
		} finally {
			setIsSaving(false);
		}
	}

	if (status === "loading") {
		return (
			<HStack justify="center" py={10}>
				<Spinner color="desaturatedGreen" />
				<Heading color="gray" size="lg">Loading...</Heading>
			</HStack>
		);
	}

	if (status !== "authenticated") {
		return (
			<Box maxW="700px" m="auto" px={{ base: 3, md: "1vh" }} py={{ base: 4, md: "4vh" }}>
				<Card background="offWhite" borderRadius={5}>
					<CardBody>
						<Stack spacing={3} align="flex-start">
							<Heading size="md" color="gray">There is no profile without an account</Heading>
							<Text color="darkGreen">
								Signed-out visitors keep everything in their own browser, so there is nothing
								to show here.
							</Text>
							<Button colorScheme="green" onClick={() => router.push("/signin")}>Sign in</Button>
						</Stack>
					</CardBody>
				</Card>
			</Box>
		);
	}

	const isDirty = Boolean(profile) && (
		username !== (profile?.username ?? "") ||
		firstName !== (profile?.firstName ?? "") ||
		lastName !== (profile?.lastName ?? "")
	);

	return (
		<Box maxW="700px" m="auto" px={{ base: 3, md: "1vh" }} py={{ base: 4, md: "4vh" }}>
			<Stack spacing={{ base: 4, md: 6 }}>

				<Box>
					<Heading size={{ base: "md", md: "lg" }} color="gray">Profile</Heading>
					<Text color="darkGreen" mt={2}>
						How you appear to the other members of your groups.
					</Text>
				</Box>

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

				{profile ? (
					<Card background="offWhite" borderRadius={5}>
						<CardBody px={{ base: 3, md: 5 }}>
							<Stack spacing={5}>

								<Box>
									<HStack spacing={2} mb={1} flexWrap="wrap">
										<Text fontWeight="bold" color="gray">Signed in as</Text>
										<Badge colorScheme="green">{session?.user?.id ? "account" : ""}</Badge>
									</HStack>
									<Text color="darkGreen">{profile.email}</Text>
									<Text color="darkGreen" fontSize="sm" mt={1}>
										Your email belongs to the sign-in provider, so it cannot be changed
										here.
									</Text>
								</Box>

								<FormControl>
									<FormLabel color="gray">Display name</FormLabel>
									<Input
										value={username}
										onChange={(event) => { setUsername(event.target.value); setSaved(false); }}
										background="white"
										borderColor="desaturatedGreen"
										maxLength={60}
										placeholder="What your group calls you"
									/>
									<FormHelperText color="darkGreen">
										Shown next to your cards when a group looks at who owns what.
									</FormHelperText>
								</FormControl>

								<Stack direction={{ base: "column", sm: "row" }} spacing={4}>
									<FormControl>
										<FormLabel color="gray">First name</FormLabel>
										<Input
											value={firstName}
											onChange={(event) => { setFirstName(event.target.value); setSaved(false); }}
											background="white"
											borderColor="desaturatedGreen"
											maxLength={60}
										/>
									</FormControl>
									<FormControl>
										<FormLabel color="gray">Last name</FormLabel>
										<Input
											value={lastName}
											onChange={(event) => { setLastName(event.target.value); setSaved(false); }}
											background="white"
											borderColor="desaturatedGreen"
											maxLength={60}
										/>
									</FormControl>
								</Stack>

								<HStack flexWrap="wrap">
									<Button
										colorScheme="green"
										isDisabled={!isDirty}
										isLoading={isSaving}
										loadingText="Saving"
										onClick={save}
									>
										Save changes
									</Button>
									{saved ? <Text color="darkGreen" fontSize="sm">Saved.</Text> : null}
									{isDirty && !isSaving ? <Text color="darkGreen" fontSize="sm">Unsaved changes.</Text> : null}
								</HStack>

							</Stack>
						</CardBody>
					</Card>
				) : null}

				{profile ? (
					<Card background="offWhite" borderRadius={5}>
						<CardBody px={{ base: 3, md: 5 }}>
							<Stack spacing={2}>
								<Text fontWeight="bold" color="gray">Binder visibility</Text>
								<Text color="darkGreen" fontSize="sm">
									Every binder is currently visible to the groups you belong to. Per-binder
									privacy is designed for but not switched on yet, so nothing here is
									adjustable and nothing is hidden.
								</Text>
								<Badge colorScheme="green" alignSelf="flex-start">All binders public</Badge>
							</Stack>
						</CardBody>
					</Card>
				) : null}

			</Stack>
		</Box>
	);
}
