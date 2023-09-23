import Button from "@/theme/ButtonVariants";
import { Colors } from "@/theme/Colors";
import { extendTheme } from "@chakra-ui/react";

const theme = extendTheme({
	components: {
		Button: Button,
	},
	colors: Colors
});

export default theme;
