import { SettingsIcon } from "@chakra-ui/icons";
import { Image, VStack, Spacer, Button } from "@chakra-ui/react";

/**
 * The Sidebar object which is displayed on the left side of the
	screen. This should contain the Skillmasters logo within it,
	along with a settings pages or whatever useful functions come to
	be required throughout development. A signout button should also
	appear at the bottom with the expected functionality.
 * @returns The Sidebar Component
 */
export default function Sidebar() {
	const logoSize = "55";
	const iconSize = "8";
	const logoutSize = "35";

	return(
		<VStack h="100%" w="100%" pt={6} pb={6} spacing={10} background="lightOrange" borderRightRadius="25px">

			{/* Skillmasters Logo */}
			<Image
				src="./assets/Skillmasters.svg"
				alt="Skillmasters Logo"
				boxSize={logoSize}
				cursor="pointer"
			/>

			{/* Dashboard Icon */}
			{/* <Button background="lightOrange" pt={30} pb={30} _hover={{ bg: "desaturatedGreen" }}>
				<Image
					src= "./assets/DashboardIcon.svg"
					alt="Player Profile"
					boxSize={iconSize}
					onClick={() => {
						return router.push("/");
					}}
					cursor="pointer"
				/>
			</Button> */}

			<Spacer />

			{/* Settings Icon */}
			<SettingsIcon boxSize={iconSize} color="offWhite" />

			{/* Logout */}
			<Button background="lightOrange" pt={30} pb={30} _hover={{ bg: "desaturatedGreen" }} >
				<Image
					src="./assets/Logout.svg"
					alt="Log Out"
					boxSize={logoutSize}
				/>
			</Button>
		</VStack>
	);
}
