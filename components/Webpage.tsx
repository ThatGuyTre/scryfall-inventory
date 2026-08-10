import { Grid, GridItem } from "@chakra-ui/react";
import { ReactNode } from "react";
import Header from "./index/Header";

/**
 * WebpageProps are the parameters passed into the Webpage object. Children are
 * whatever the page wants to render inside the scrollable main area.
 */
type WebpageProps = {
	children: ReactNode,
}

/**
 *
 * The page frame shared by every screen: the Header across the top and a
 * scrollable main area beneath it. Pages render their content as children
 * rather than rebuilding this grid, so the chrome only has to be corrected in
 * one place.
 *
 * @param {WebpageProps} { children }
 * @returns The Webpage Component
 *
 */
export default function Webpage({ children }: WebpageProps) {
	return(
		<Grid background="lightGray"
			/*
				100vw includes the scrollbar's width, which pushed the whole
				page sideways on desktop. 100% of the viewport is what was
				meant. The dynamic viewport height keeps the layout correct on
				mobile browsers whose address bar slides away.
			*/
			w="100%"
			maxW="100%"
			h="100dvh"
			overflowX="hidden"
			templateAreas={`'header'
							'main'`}
			gridTemplateRows={{ base: "60px 1fr", md: "70px 1fr" }}
		>

			<GridItem alignItems="center" justifyContent="center" area={"header"}>
				<Header />
			</GridItem>

			{/*
				The main area of the screen. Within this is also custom CSS
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

				{children}

			</GridItem>

		</Grid>
	);
}
