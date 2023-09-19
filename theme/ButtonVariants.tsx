import { defineStyleConfig } from "@chakra-ui/react";

const Button = defineStyleConfig({
	// Two variants: outline and solid
	variants: {
		num_pad: {
			width: 20,
			height: 20,
			fontSize: "2xl",
			color: "white",
			mr: "2",
			mb: "2",
			bg: "linear-gradient(228.42deg, #F04E30 0%, #F7941D 100%)",
			_hover:{
				bg: "linear-gradient(258.08deg, #4349DF 0%, #7176FF 100%)",
			}
		},

		gradient_button: {
			color:"white",
			boxShadow:"2xl",
			width:"215px",
			bgGradient: "linear(to-r, #F7941D, #F04E30)",
			_hover: { bgGradient: "linear-gradient(258deg, rgba(240,78,48,0.8) 0%, rgba(247,148,29,0.8) 100%);" },
			_loading: {
				_hover: { bgGradient: "linear-gradient(258deg, rgba(240,78,48,0.8) 0%, rgba(247,148,29,0.8) 100%);" },
				opacity: 1, bgGradient: "linear-gradient(258deg, rgba(240,78,48,0.8) 0%, rgba(247,148,29,0.8) 100%);"
			}
		},

		start_button: {
			bgGradient:  "linear-gradient(258.08deg, #4349DF 0%, #7176FF 100%)",
			color:"white",
			alignSelf:"center",
			_hover: { bgGradient: "linear-gradient(258deg, rgba(67,73,223,0.8) 0%, rgba(113,118,255,0.8) 100%);" },
		},
	},

});

export default Button;
