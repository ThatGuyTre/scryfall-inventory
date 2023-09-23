import { ChakraProvider } from "@chakra-ui/react";
import type { AppProps } from "next/app";
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
export default function App({ Component, pageProps }: AppProps) {
	return <ChakraProvider theme={theme}><Component {...pageProps} /></ChakraProvider>;
}
