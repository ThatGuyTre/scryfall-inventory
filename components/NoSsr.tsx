import dynamic from "next/dynamic";
import React from "react";

/**
 * This component is used to prevent the server from rendering a component
 *
 * @param props The props of the component
 * @returns The NoSsr component
 *
 */
function NoSsr(props: any) {
	return <React.Fragment>{props.children}</React.Fragment>;
}


export default dynamic(() => {
	return Promise.resolve(NoSsr);
}, {
	ssr: false
});
