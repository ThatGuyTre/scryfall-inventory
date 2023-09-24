import { Button, HStack, Heading, Spacer, useMediaQuery } from "@chakra-ui/react";
import { useState } from "react";

/**
 * HeaderProps are the parameters passed into the Header object.
 * Right now it is simply the username which will eventually be
 * taken from the API.
 */
type HeaderProps = {
	username: string | undefined,
}

/**
 *
 * The Header object which is displayed at the top of the screen. It
 * is passed the username which will be taken from the API. The text
 * is centered within the box and aligned to the left.
 *
 */
export default function Header({ username }: HeaderProps) {
	const outerPadding = 35;

	let fSize = "4xl";

	const [ thinScreen ] = useMediaQuery("(min-width: 480px)");

	if(!thinScreen) {
		fSize = "2xl";
	}

	// If the username is undefined, then the welcome message will be generic
	const [ welcomeMessage, setWelcomeMessage ] = useState<string>("Welcome to Skillmasters");

	if (username && welcomeMessage !== `Welcome, ${username}!`) {
		setWelcomeMessage(`Welcome, ${username}!`);
	}

	return(
		<HStack
			w="100%" h="100%"
			background="desaturatedGreen"
			display="flex"
			pl={outerPadding} pr={outerPadding}
			border="3px solid green"  borderTop="none" borderBottomRadius={15}
		>
			<Heading color="gray.200" fontSize={fSize} fontWeight="bold" textAlign="left" >
				{welcomeMessage}
			</Heading>
			<Spacer />
			<Button
				color="transparent"
				mr={3}
				_hover={
					{ bg: "lightOrange", textColor: "offWhite" }
				}>
					maybe this should be a view button
			</Button>
		</HStack>
	);
}
