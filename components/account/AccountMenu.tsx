import {
	Avatar,
	Button,
	Menu,
	MenuButton,
	MenuDivider,
	MenuGroup,
	MenuItem,
	MenuList,
	Text,
} from "@chakra-ui/react";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/router";

/**
 * The account control at the right of the header.
 *
 * Signed out it is a Sign in button. Signed in it is the person's initial, with
 * a menu to their profile, their groups and out again.
 */

/**
 * Picks the letters to show in the avatar.
 *
 * @param name The best name available
 * @returns One or two initials
 */
function initialsFor(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);

	if (parts.length === 0) {
		return "?";
	}

	if (parts.length === 1) {
		return parts[0].slice(0, 2).toUpperCase();
	}

	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function AccountMenu() {
	const router = useRouter();
	const { data: session, status } = useSession();

	if (status === "loading") {
		// A spinner here would flicker on every navigation; an inert button of
		// the right size keeps the header from jumping.
		return <Button size="sm" height="40px" px={4} isDisabled variant="ghost" color="whiteAlpha.700">…</Button>;
	}

	if (!session?.user) {
		return (
			<Button
				size="sm"
				height="40px"
				px={4}
				borderRadius="md"
				border="1px solid"
				borderColor="offWhite"
				background="offWhite"
				color="darkGreen"
				fontWeight="semibold"
				_hover={{ background: "white" }}
				onClick={() => router.push("/signin")}
			>
				Sign in
			</Button>
		);
	}

	const name = session.user.username || session.user.name || session.user.email || "Account";

	return (
		<Menu placement="bottom-end">
			<MenuButton
				as={Button}
				size="sm"
				height="40px"
				px={2}
				borderRadius="md"
				border="1px solid"
				borderColor="whiteAlpha.400"
				background="whiteAlpha.200"
				color="white"
				_hover={{ background: "whiteAlpha.300" }}
				_active={{ background: "whiteAlpha.400" }}
				aria-label="Your account"
			>
				<Avatar size="xs" bg="darkGreen" color="white" name={initialsFor(name)} getInitials={initialsFor} />
			</MenuButton>
			<MenuList background="lightGray" borderColor="desaturatedGreen">
				<MenuGroup title={name} color="gray">
					<MenuItem background="transparent" color="gray" _hover={{ background: "offWhite" }} onClick={() => router.push("/profile")}>
						Profile
					</MenuItem>
					<MenuItem background="transparent" color="gray" _hover={{ background: "offWhite" }} onClick={() => router.push("/groups")}>
						Your groups
					</MenuItem>
				</MenuGroup>
				<MenuDivider borderColor="desaturatedGreen" />
				<MenuItem
					background="transparent"
					color="gray"
					_hover={{ background: "offWhite" }}
					onClick={() => signOut({ callbackUrl: "/" })}
				>
					<Text>Sign out</Text>
				</MenuItem>
			</MenuList>
		</Menu>
	);
}
