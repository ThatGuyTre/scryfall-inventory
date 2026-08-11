import { Alert, AlertDescription, AlertIcon, AlertTitle, Box, Button } from "@chakra-ui/react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";

/**
 * Tells a signed-out visitor that nothing they do is being saved.
 *
 * Shown on every page that touches a collection. The app deliberately works
 * without an account — you can import a collection, browse it and score
 * commander decks against it — but all of that lives in this browser only, and
 * saying so once per page is the difference between a feature and a nasty
 * surprise when the tab closes.
 *
 * Renders nothing at all when signed in.
 */
export default function SignedOutNotice() {
	const router = useRouter();
	const { data: session, status } = useSession();

	if (status === "loading" || session?.user) {
		return null;
	}

	return (
		<Alert status="info" borderRadius={5} alignItems="flex-start">
			<AlertIcon />
			<Box flex="1">
				<AlertTitle>You are not signed in</AlertTitle>
				<AlertDescription display="block">
					Everything works, but nothing is saved to the server. Your collection stays in this
					browser and goes when its storage is cleared. Sign in to keep it and to share it with
					a group.
				</AlertDescription>
			</Box>
			<Button size="sm" colorScheme="green" flexShrink={0} onClick={() => router.push("/signin")}>
				Sign in
			</Button>
		</Alert>
	);
}
