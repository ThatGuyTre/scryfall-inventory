import { HamburgerIcon } from "@chakra-ui/icons";
import {
	Drawer,
	DrawerBody,
	DrawerCloseButton,
	DrawerContent,
	DrawerHeader,
	DrawerOverlay,
	HStack,
	Heading,
	IconButton,
	Spacer,
	Stack,
	Text,
	useDisclosure,
} from "@chakra-ui/react";
import AccountMenu from "../account/AccountMenu";
import MenuTab from "./MenuTab";

/**
 * The name shown at the top left, with the version it was built from.
 *
 * This used to be a greeting with a hardcoded username. When there are real
 * users, this is the one place that has to change.
 */
const APP_TITLE = "MTG Inventory Tool";

/**
 * The tabs shown across the top of every page. Kept as data so a new page is
 * one entry rather than another element in the markup, and so the header and
 * the drawer cannot fall out of step with each other.
 */
const MENU_TABS = [
	{ text: "Inventory", href: "/inventory" },
	{ text: "My Binders", href: "/addadeck" },
	{ text: "Groups", href: "/groups" },
	{ text: "Find a Commander Deck", href: "/findacommanderdeck" },
];

/**
 *
 * The Header object which is displayed at the top of the screen. The title
 * is centered within the box and aligned to the left.
 *
 * The tabs and the title only fit side by side on a wide screen, so below the
 * xl breakpoint the tabs move into a drawer behind a menu button.
 *
 */
export default function Header() {
	const { isOpen, onOpen, onClose } = useDisclosure();

	// Set from package.json at build time, so it cannot drift from the release.
	const version = process.env.NEXT_PUBLIC_APP_VERSION;

	return(
		<HStack
			w="100%" h="100%"
			/*
				A flat block of green with a 3px pure-green border read as two
				clashing greens. A gentle gradient down to the theme's dark
				green, a hairline edge in the same family and a soft shadow
				separate the bar from the page without shouting.
			*/
			bgGradient="linear(to-b, desaturatedGreen, #63a86d)"
			borderBottom="1px solid"
			borderBottomColor="darkGreen"
			boxShadow="0 2px 10px rgba(45, 106, 79, 0.35)"
			display="flex"
			pl={{ base: 4, md: 8 }} pr={{ base: 4, md: 8 }}
			spacing={{ base: 2, xl: 3 }}
		>
			{/*
				The title steps down through the breakpoints rather than
				switching on a media query, so the server and the browser
				render the same thing and there is no flash on hydration.
			*/}
			<Heading
				color="white"
				fontSize={{ base: "md", sm: "xl", lg: "2xl" }}
				fontWeight="bold"
				letterSpacing="-0.01em"
				textShadow="0 1px 2px rgba(45, 106, 79, 0.45)"
				textAlign="left"
				noOfLines={1}
			>
				{APP_TITLE}
				{version ? (
					<Text
						as="span"
						ml={2}
						fontSize={{ base: "xs", lg: "sm" }}
						fontWeight="medium"
						color="whiteAlpha.800"
						letterSpacing="normal"
					>
						v{version} ({process.env.NODE_ENV.toUpperCase()})
					</Text>
				) : null}
			</Heading>

			<Spacer />

			<HStack display={{ base: "none", xl: "flex" }} spacing={2}>
				{MENU_TABS.map((tab) => (
					<MenuTab key={tab.href} text={tab.text} href={tab.href} />
				))}
			</HStack>

			{/*
				The account control sits outside the collapsing tab list, so
				signing in stays one tap away on a phone rather than being
				buried in the drawer.
			*/}
			<AccountMenu />

			<IconButton
				display={{ base: "flex", xl: "none" }}
				aria-label="Open the menu"
				icon={<HamburgerIcon />}
				size="sm"
				height="40px"
				width="40px"
				fontSize="lg"
				border="1px solid"
				borderColor="whiteAlpha.500"
				background="whiteAlpha.200"
				color="white"
				_hover={{ background: "whiteAlpha.300" }}
				_active={{ background: "whiteAlpha.400" }}
				onClick={onOpen}
			/>

			<Drawer isOpen={isOpen} placement="right" onClose={onClose}>
				<DrawerOverlay />
				<DrawerContent background="lightGray">
					<DrawerCloseButton color="white" top={3} />
					<DrawerHeader
						background="desaturatedGreen"
						color="white"
						fontSize="lg"
						borderBottom="1px solid"
						borderBottomColor="darkGreen"
					>
						Menu
					</DrawerHeader>
					<DrawerBody pt={5}>
						<Stack spacing={3} pb={6}>
							{MENU_TABS.map((tab) => (
								<MenuTab key={tab.href} text={tab.text} href={tab.href} tone="onLight" onNavigate={onClose} />
							))}
						</Stack>
					</DrawerBody>
				</DrawerContent>
			</Drawer>
		</HStack>
	);
}
