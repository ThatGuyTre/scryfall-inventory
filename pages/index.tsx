/* eslint-disable no-eq-null */
import CardGrid from "@/components/index/CardGrid";
import Header from "@/components/index/Header";
import { Grid, GridItem } from "@chakra-ui/react";
import { useState } from "react";


/*
	DashboardProps include information to send to the Dashboard
	object upon rendering to the DOM. Currently, it is simply the
	username being logged in, so that a personalized greeting is
	output on page load.
*/
interface DashboardProps {
	username: string | undefined,
	w: string,
	h: string
}

/**
 * Dashboard is the main object shown on the webpage. It takes in
	the username of the logged in user and renders the Header,
	CardGrid, and Sidebar objects. The [rest: string] prop is used
	to pass styling to the ChakraUI Grid element. overflowY="auto"
	allowsjust this element to be scrollable
 * @param {DashboardProps} { username, ...rest }
 * @returns The Dashboard Component
 */
function Dashboard({ username, ...rest }: DashboardProps) {
	return(
		<Grid background="lightGray"
			templateAreas={`'header'
							'main'`}
			gridTemplateRows={"70px 1fr"}
			{...rest}
		>

			<GridItem alignItems="center" justifyContent="center" area={"header"}>
				<Header username={username} />
			</GridItem>

			{/*
				The main area of the screen. This is where the
				CardGrid is rendered. Within this is also custom CSS
				to create a scrollbar to suit the theme of the site.
			*/}
			<GridItem
				overflowY="auto"
				css={{
					// Getting rid of default scrollbar
					"scrollbarWidth": "none",
					"msOverflowStyle": "none",
					// Creating custom scrollbar.
					// Unfortunately the colors from themes don't work here so you have to hard code
					"&::-webkit-scrollbar": { width: "0.75rem" },
					"&::-webkit-scrollbar-track": { backgroundColor: "#d5e3e8" },
					"&::-webkit-scrollbar-thumb": { backgroundColor: "#74b87d", borderRadius: "0.25rem" },
				}}
				area={"main"}>

				<CardGrid />

			</GridItem>

		</Grid>
	);
}

export default function MainPage() {

	return(
		<Dashboard
			w="calc(100vw)"
			h="calc(100vh)"
			username="Tre"
		/>
	);
}
