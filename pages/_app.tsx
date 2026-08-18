import { ChakraProvider } from "@chakra-ui/react";
import type { AppProps } from "next/app";
import { SessionProvider } from "next-auth/react";
import Head from "next/head";
import { useEffect } from "react";
import theme from "../theme/Theme";


/**
 *
 * The App component. This component is the root component of the application.
 *
 * @param Component The component to render
 * @param pageProps The page props
 * @returns The App component
 *
 */
export default function App({ Component, pageProps: { session, ...pageProps } }: AppProps) {

	/*
		Registers the service worker that makes the site installable and
		usable offline. Only in a production build — in development a cached
		bundle would serve stale code back on every reload.
	*/
	useEffect(() => {
		if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) {
			return;
		}

		navigator.serviceWorker.register("/sw.js").catch((error) => {
			console.error("Service worker registration failed:", error);
		});
	}, []);

	return (
		<>
			<Head>
				<title>MTG Inventory Tool</title>
				<meta name="description" content="Build decks with your collection" />
				<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
			</Head>
			{/*
				SessionProvider wraps everything so any component can ask who is
				signed in without the answer being threaded down through props.
			*/}
			<SessionProvider session={session}>
				<ChakraProvider theme={theme}>
					<Component {...pageProps} />
				</ChakraProvider>
			</SessionProvider>
		</>
	);
}
