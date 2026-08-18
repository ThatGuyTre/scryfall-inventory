import {
	Alert,
	AlertDescription,
	AlertIcon,
	AlertTitle,
	Box,
	Button,
	Card,
	CardBody,
	Divider,
	FormControl,
	FormHelperText,
	FormLabel,
	Heading,
	Input,
	Stack,
	Text,
} from "@chakra-ui/react";
import { signIn } from "next-auth/react";
import type { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import { useState } from "react";
import Webpage from "@/components/Webpage";
import { describeProviders } from "@/src/lib/accounts/authConfig";

/**
 * Sign-in.
 *
 * Which providers appear is decided on the server by whether AWS is configured,
 * so this page does not have to know: it renders whatever it is handed. With
 * Cognito set up that is a single button; without it, the local form.
 */

type SignInPageProps = {
	providers: { id: string, name: string }[],
	/** True when the local, password-free provider is one of the options. */
	hasLocal: boolean,
}

export default function SignInPage({ providers, hasLocal }: SignInPageProps) {
	const router = useRouter();
	const callbackUrl = typeof router.query.callbackUrl === "string" ? router.query.callbackUrl : "/";

	const [ email, setEmail ] = useState<string>("");
	const [ username, setUsername ] = useState<string>("");
	const [ isSubmitting, setIsSubmitting ] = useState<boolean>(false);
	const [ error, setError ] = useState<string | null>(null);

	const hosted = providers.filter((provider) => provider.id !== "local");

	/**
	 * Signs in with the local provider.
	 */
	async function submitLocal() {
		if (!email.includes("@")) {
			setError("That does not look like an email address.");
			return;
		}

		setIsSubmitting(true);
		setError(null);

		const result = await signIn("local", { email, username, redirect: false });

		if (result?.error) {
			setError("That sign-in was refused.");
			setIsSubmitting(false);
			return;
		}

		router.push(callbackUrl);
	}

	return (
		<Webpage>
			<Box maxW="560px" m="auto" px={{ base: 3, md: "1vh" }} py={{ base: 4, md: "4vh" }}>
				<Stack spacing={{ base: 4, md: 6 }}>

					<Box>
						<Heading size={{ base: "md", md: "lg" }} color="gray">Sign in</Heading>
						<Text color="darkGreen" mt={2}>
							An account keeps your collection on the server and lets you share it with a
							group. Without one the app still works, but only in this browser.
						</Text>
					</Box>

					{providers.length === 0 ? (
						<Alert status="warning" borderRadius={5}>
							<AlertIcon />
							<Box>
								<AlertTitle>No sign-in method is configured</AlertTitle>
								<AlertDescription>
									Set the Cognito environment variables, or allow local sign-in. See
									infra/AWS-SETUP.md.
								</AlertDescription>
							</Box>
						</Alert>
					) : null}

					{hosted.length > 0 ? (
						<Card background="offWhite" borderRadius={5}>
							<CardBody>
								<Stack spacing={3}>
									{hosted.map((provider) => (
										<Button
											key={provider.id}
											colorScheme="green"
											onClick={() => signIn(provider.id, { callbackUrl })}
										>
											Continue with {provider.name}
										</Button>
									))}
								</Stack>
							</CardBody>
						</Card>
					) : null}

					{hosted.length > 0 && hasLocal ? <Divider borderColor="lightGray" /> : null}

					{hasLocal ? (
						<Card background="offWhite" borderRadius={5}>
							<CardBody>
								<Stack spacing={4}>

									<Alert status="warning" borderRadius={5} fontSize="sm">
										<AlertIcon />
										<Box>
											<AlertTitle fontSize="sm">Local sign-in, for development</AlertTitle>
											<AlertDescription display="block">
												There is no password check. Any address signs you in as that
												person. This provider disappears once Cognito is configured.
											</AlertDescription>
										</Box>
									</Alert>

									<FormControl>
										<FormLabel color="gray">Email</FormLabel>
										<Input
											type="email"
											value={email}
											onChange={(event) => setEmail(event.target.value)}
											placeholder="you@example.com"
											background="white"
											borderColor="desaturatedGreen"
										/>
										<FormHelperText color="darkGreen">
											Used as your identity. The same address always signs you into the
											same account.
										</FormHelperText>
									</FormControl>

									<FormControl>
										<FormLabel color="gray">Display name</FormLabel>
										<Input
											value={username}
											onChange={(event) => setUsername(event.target.value)}
											placeholder="Optional"
											background="white"
											borderColor="desaturatedGreen"
											maxLength={60}
										/>
										<FormHelperText color="darkGreen">
											What your group sees. You can change it later on your profile.
										</FormHelperText>
									</FormControl>

									{error ? (
										<Alert status="error" borderRadius={5}>
											<AlertIcon />
											{error}
										</Alert>
									) : null}

									<Button
										colorScheme="green"
										isLoading={isSubmitting}
										loadingText="Signing in"
										onClick={submitLocal}
									>
										Sign in
									</Button>

								</Stack>
							</CardBody>
						</Card>
					) : null}

					<Button variant="ghost" color="darkGreen" onClick={() => router.push("/")}>
						Carry on without an account
					</Button>

				</Stack>
			</Box>
		</Webpage>
	);
}

export const getServerSideProps: GetServerSideProps<SignInPageProps> = async () => {
	/*
		Read the providers straight from the environment rather than through
		getProviders(). That helper is a client function: server-side it fetches
		`${NEXTAUTH_URL}/api/auth/providers`, and when NEXTAUTH_URL is unset
		next-auth defaults that to http://localhost:3000 — so on any real host the
		request went nowhere, the helper swallowed the error and returned null, and
		this page announced that nothing was configured no matter what the
		environment held. Reading the environment needs no request and cannot
		disagree with what the auth route builds from the same module.
	*/
	const providers = describeProviders();

	return {
		props: {
			providers,
			hasLocal: providers.some((provider) => provider.id === "local"),
		},
	};
};
