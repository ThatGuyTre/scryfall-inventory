import Button from "@/theme/ButtonVariants";
import { Colors } from "@/theme/Colors";
import { extendTheme } from "@chakra-ui/react";
import { Inter } from "next/font/google";

/*
	Inter is loaded and self-hosted by next/font, then handed to Chakra as the
	default family so every component picks it up without a wrapper class.
*/
const inter = Inter({ subsets: ["latin"] });

const theme = extendTheme({
	components: {
		Button: Button,
	},
	colors: Colors,
	fonts: {
		heading: inter.style.fontFamily,
		body: inter.style.fontFamily,
	},
});

export default theme;
