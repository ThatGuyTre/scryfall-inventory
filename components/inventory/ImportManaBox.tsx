import {
	Alert,
	AlertDescription,
	AlertIcon,
	AlertTitle,
	Badge,
	Box,
	Button,
	Card,
	CardBody,
	Divider,
	Heading,
	HStack,
	Input,
	List,
	ListItem,
	Radio,
	RadioGroup,
	Select,
	Stack,
	StatGroup,
	Text,
} from "@chakra-ui/react";
import { useRouter } from "next/router";
import { ChangeEvent, useState } from "react";
import { importManaBoxFile } from "@/src/lib/inventory/api";
import { ImportMode, ImportSummary, LOCATION_KINDS } from "@/src/lib/inventory/types";
import ImportStat from "./ImportStat";
import { formatCount, titleCase } from "./format";

/**
 * The ManaBox import screen.
 *
 * The file is read in the browser and posted as text, so the server never has
 * to deal with multipart uploads. Replacing the inventory throws data away, so
 * that mode asks for a second click before it runs.
 */

/** Matches the 32mb body limit on /api/inventory/import. */
const MAX_FILE_BYTES = 32 * 1024 * 1024;

export default function ImportManaBox() {
	const router = useRouter();

	const [ file, setFile ] = useState<File | null>(null);
	const [ mode, setMode ] = useState<ImportMode>("append");
	const [ locationKind, setLocationKind ] = useState<string>("binder");
	const [ locationName, setLocationName ] = useState<string>("");
	const [ isImporting, setIsImporting ] = useState<boolean>(false);
	const [ confirmingReplace, setConfirmingReplace ] = useState<boolean>(false);
	const [ summary, setSummary ] = useState<ImportSummary | null>(null);
	const [ error, setError ] = useState<string | null>(null);

	/**
	 * Accepts the chosen file, clearing any result from a previous run.
	 *
	 * @param event The file input's change event
	 */
	function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
		const chosen = event.target.files?.[0] ?? null;

		setSummary(null);
		setConfirmingReplace(false);

		if (chosen && chosen.size > MAX_FILE_BYTES) {
			setFile(null);
			setError(`That file is ${formatCount(Math.round(chosen.size / 1024 / 1024))}MB, which is larger than the 32MB limit.`);
			return;
		}

		setError(null);
		setFile(chosen);
	}

	/**
	 * Reads the file and sends it to the API.
	 */
	async function runImport() {
		if (!file) {
			return;
		}

		setIsImporting(true);
		setError(null);
		setSummary(null);
		setConfirmingReplace(false);

		try {
			const csv = await file.text();
			const location = locationName.trim()
				? { kind: locationKind, name: locationName.trim() }
				: undefined;

			setSummary(await importManaBoxFile(csv, mode, location));
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "The import failed.");
		} finally {
			setIsImporting(false);
		}
	}

	/**
	 * Starts the import, pausing for confirmation when the chosen mode would
	 * discard the cards already stored.
	 */
	function handleSubmit() {
		if (mode === "replace" && !confirmingReplace) {
			// Drop any earlier result so the warning is not read alongside a
			// summary describing an import that already finished.
			setSummary(null);
			setConfirmingReplace(true);
			return;
		}

		runImport();
	}

	return (
		<Box maxW="1100px" m="auto" px={{ base: 3, md: "1vh" }} py={{ base: 4, md: "4vh" }}>
			<Stack spacing={{ base: 4, md: 6 }}>

				<Box>
					<Heading size={{ base: "md", md: "lg" }} color="gray">Import from ManaBox</Heading>
					<Text color="darkGreen" mt={2}>
						Export your collection from ManaBox as a .csv file, then load it here. Cards are
						matched on printing, finish, condition, language and where they are kept, so the
						same card in a deck and in a binder stays on two separate rows.
					</Text>
				</Box>

				<Card background="offWhite" borderRadius={5}>
					<CardBody px={{ base: 3, md: 5 }}>
						<Stack spacing={6}>

							<Box>
								<Text fontWeight="bold" color="gray" mb={2}>ManaBox export file</Text>
								<Input
									type="file"
									accept=".csv,text/csv"
									onChange={handleFileChange}
									background="white"
									borderColor="desaturatedGreen"
									py={1}
									height="auto"
									sx={{
										"::file-selector-button": {
											border: "none",
											background: "#74b87d",
											color: "white",
											borderRadius: "4px",
											padding: "6px 12px",
											marginRight: "12px",
											cursor: "pointer",
										},
									}}
								/>
								{file ? (
									<Text mt={2} fontSize="sm" color="darkGreen">
										Selected: {file.name} ({formatCount(Math.max(1, Math.round(file.size / 1024)))} KB)
									</Text>
								) : null}
							</Box>

							<Divider borderColor="lightGray" />

							<Box>
								<Text fontWeight="bold" color="gray" mb={1}>Where are these cards kept?</Text>
								<Text fontSize="sm" color="darkGreen" mb={3}>
									ManaBox exports a Binder Name and Binder Type for each row, and those
									always win. This is the fallback for rows the file does not place, and
									for older exports without those columns. Leave the name blank to file
									them as unassigned.
								</Text>
								<Stack direction={{ base: "column", sm: "row" }} spacing={3}>
									<Select
										value={locationKind}
										onChange={(event) => setLocationKind(event.target.value)}
										maxW={{ base: "100%", sm: "160px" }}
										background="white"
										borderColor="desaturatedGreen"
										aria-label="Kind of place"
									>
										{LOCATION_KINDS.map((kind) => (
											<option key={kind} value={kind}>{titleCase(kind)}</option>
										))}
									</Select>
									<Input
										value={locationName}
										onChange={(event) => setLocationName(event.target.value)}
										placeholder="e.g. Mono Red Burn"
										background="white"
										borderColor="desaturatedGreen"
										maxLength={120}
										aria-label="Name of the deck or binder"
									/>
								</Stack>
							</Box>

							<Divider borderColor="lightGray" />

							<Box>
								<Text fontWeight="bold" color="gray" mb={2}>What should happen to the cards already stored?</Text>
								<RadioGroup
									value={mode}
									onChange={(next) => {
										setMode(next as ImportMode);
										setConfirmingReplace(false);
									}}
								>
									<Stack spacing={3}>
										<Radio value="append" colorScheme="green" alignItems="flex-start">
											<Text color="gray" fontWeight="bold">Append</Text>
											<Text fontSize="sm" color="darkGreen">
												Keep the current inventory and add these quantities on top of it.
											</Text>
										</Radio>
										<Radio value="replace" colorScheme="red" alignItems="flex-start">
											<Text color="gray" fontWeight="bold">Replace</Text>
											<Text fontSize="sm" color="darkGreen">
												Delete everything currently stored, then import this file as the whole inventory.
											</Text>
										</Radio>
									</Stack>
								</RadioGroup>
							</Box>

							{confirmingReplace ? (
								<Alert status="warning" borderRadius={5}>
									<AlertIcon />
									<Box>
										<AlertTitle>This deletes your current inventory.</AlertTitle>
										<AlertDescription>
											Press Replace inventory again to confirm, or switch to Append.
										</AlertDescription>
									</Box>
								</Alert>
							) : null}

							<Stack direction={{ base: "column", sm: "row" }} spacing={2}>
								<Button
									colorScheme={mode === "replace" ? "red" : "green"}
									isDisabled={!file}
									isLoading={isImporting}
									loadingText="Importing"
									onClick={handleSubmit}
								>
									{mode === "replace" ? "Replace inventory" : "Append to inventory"}
								</Button>
								<Button variant="outline" borderColor="desaturatedGreen" onClick={() => router.push("/inventory")}>
									View inventory
								</Button>
							</Stack>

						</Stack>
					</CardBody>
				</Card>

				{error ? (
					<Alert status="error" borderRadius={5}>
						<AlertIcon />
						<Box>
							<AlertTitle>Import failed</AlertTitle>
							<AlertDescription>{error}</AlertDescription>
						</Box>
					</Alert>
				) : null}

				{summary ? (
					<Card background="offWhite" borderRadius={5}>
						<CardBody px={{ base: 3, md: 5 }}>
							<Stack spacing={4}>

								<HStack flexWrap="wrap">
									<Heading size="md" color="gray">Import complete</Heading>
									<Badge colorScheme={summary.mode === "replace" ? "red" : "green"}>
										{summary.mode === "replace" ? "Replaced" : "Appended"}
									</Badge>
								</HStack>

								<StatGroup flexWrap="wrap" gap={4}>
									<ImportStat label="Rows read" value={formatCount(summary.rowsParsed)} />
									<ImportStat label="Unique cards" value={formatCount(summary.uniqueCards)} />
									<ImportStat label="New rows" value={formatCount(summary.created)} />
									<ImportStat label="Rows updated" value={formatCount(summary.updated)} />
									<ImportStat label="Cards held" value={formatCount(summary.totalQuantity)} />
								</StatGroup>

								{summary.rowsSkipped > 0 ? (
									<Alert status="warning" borderRadius={5}>
										<AlertIcon />
										<Box>
											<AlertTitle>{formatCount(summary.rowsSkipped)} row(s) skipped</AlertTitle>
											<AlertDescription>
												<List fontSize="sm" mt={1}>
													{summary.warnings.map((warning) => (
														<ListItem key={warning}>{warning}</ListItem>
													))}
												</List>
											</AlertDescription>
										</Box>
									</Alert>
								) : null}

								<Stack direction={{ base: "column", sm: "row" }} spacing={2} align="flex-start">
									<Button colorScheme="green" onClick={() => router.push("/inventory")}>
										Search your inventory
									</Button>
									<Button variant="outline" borderColor="desaturatedGreen" onClick={() => router.push("/addadeck")}>
										See your decks
									</Button>
								</Stack>

							</Stack>
						</CardBody>
					</Card>
				) : null}

			</Stack>
		</Box>
	);
}
