import { Button } from "@chakra-ui/react";
import { useRouter } from "next/router";

interface MenuTabProps {
	text: string;
	/** Where the tab leads. Defaults to the text, lowercased and despaced. */
	href?: string;
	/**
	 * Which background the tab is sitting on. The header is green, the mobile
	 * drawer is light, and a tab styled for one is unreadable on the other.
	 */
	tone?: "onGreen" | "onLight";
	/** Called after navigating, so the mobile drawer can close itself. */
	onNavigate?: () => void;
}

/**
 * Derives a route from a tab's label, which is how these tabs have always
 * mapped to pages: "Add a Deck" becomes /addadeck.
 *
 * @param text The tab label
 * @returns The route to navigate to
 */
function hrefFor(text: string): string {
	return `/${text.toLowerCase().replace(/\s/g, "")}`;
}

export default function MenuTab({ text, href, tone = "onGreen", onNavigate }: MenuTabProps) {
	/*
		Router is used so a tab swaps the page client side. Setting
		window.location.href instead threw away the whole React tree and
		reloaded every asset on each click.
	*/
	const router = useRouter();
	const target = href ?? hrefFor(text);
	const isActive = router.pathname === target;

	/*
		On the green header the tabs read as translucent panels that lift on
		hover, and the current page is the one filled in solid. On the light
		drawer that inverts. Either way the current page is unmistakable, which
		the old uniform outline never managed.
	*/
	const onGreen = tone === "onGreen";

	const background = isActive
		? (onGreen ? "offWhite" : "desaturatedGreen")
		: (onGreen ? "whiteAlpha.200" : "transparent");

	const color = isActive
		? (onGreen ? "darkGreen" : "white")
		: (onGreen ? "whiteAlpha.900" : "darkGreen");

	const borderColor = isActive
		? (onGreen ? "offWhite" : "desaturatedGreen")
		: (onGreen ? "whiteAlpha.400" : "desaturatedGreen");

	return (
		<Button
			size="sm"
			/*
				Fixed 200px tabs were what stopped the header fitting on a
				laptop. Padding sizes each tab to its own label instead, and in
				the drawer they fill the width.
			*/
			width={{ base: "100%", xl: "auto" }}
			height="40px"
			px={4}
			borderRadius="md"
			border="1px solid"
			borderColor={borderColor}
			background={background}
			color={color}
			fontSize="sm"
			fontWeight="semibold"
			letterSpacing="0.01em"
			whiteSpace="nowrap"
			justifyContent={{ base: "flex-start", xl: "center" }}
			_hover={{
				background: isActive
					? background
					: (onGreen ? "whiteAlpha.300" : "offWhite"),
				transform: "translateY(-1px)",
			}}
			_active={{ transform: "translateY(0)" }}
			transition="background 0.15s ease-in-out, transform 0.15s ease-in-out"
			onClick={function () {
				router.push(target);
				onNavigate?.();
			}}
		>
			{text}
		</Button>
	);

}
