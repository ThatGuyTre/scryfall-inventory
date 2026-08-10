import { Stat, StatLabel, StatNumber } from "@chakra-ui/react";

type ImportStatProps = {
	label: string,
	value: string,
}

/**
 * One figure in a row of inventory or import numbers, themed to match the rest
 * of the site so the two screens that show counts stay consistent.
 *
 * @param {ImportStatProps} { label, value }
 * @returns The ImportStat Component
 */
export default function ImportStat({ label, value }: ImportStatProps) {
	return (
		<Stat>
			<StatLabel color="darkGreen">{label}</StatLabel>
			<StatNumber color="gray">{value}</StatNumber>
		</Stat>
	);
}
