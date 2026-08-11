import ProfileForm from "@/components/account/ProfileForm";
import Webpage from "@/components/Webpage";

/**
 * The page behind the account menu's Profile entry. Shows the email the account
 * is attached to and the name fields the person owns.
 *
 * @returns The ProfilePage Component
 */
export default function ProfilePage() {

	return(
		<Webpage>
			<ProfileForm />
		</Webpage>
	);
}
