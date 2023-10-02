import { AddIcon } from "@chakra-ui/icons";
import { Box, TabList, Tabs, Tab, TabPanels, TabPanel, TabIndicator, Button } from "@chakra-ui/react";

interface MenuTabProps {
	text: string;
}

function onButtonClick(text: string) {
	// Convert text to have no capitals or spaces
	text = text.toLowerCase().replace(/\s/g, '');
	// Redirect to the page
	window.location.href = `/${text}`;
}

export default function MenuTab({ text }: MenuTabProps) { 
	return (
		<Button
			size='md'
			height='48px'
			width='200px'
			border='2px'
			borderColor='desaturatedGreen'
			onClick={function () {
				onButtonClick(text);
			  }}
			>
			{text}
		</Button>
		);	

}