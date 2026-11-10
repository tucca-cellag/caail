/**
 * Whether the "Ask CAAIL" chat box is offered, and where it sends questions.
 *
 * Both come from one build-time variable, PUBLIC_CAAIL_CHAT_API: the deploy passes the repo
 * variable of that name (docs.yml), and CI's test build sets a placeholder (test.yml). Without
 * a usable endpoint (chat-endpoint.ts says what counts) the footer mounts no widget, so no page
 * carries its markup or loads its script, and the privacy statement says the feature is not
 * offered at present. Setting the variable is the whole of offering it again: no code changes
 * (tucca-cellag/caail-planning#763).
 */
import { chatEndpoint } from './chat-endpoint';

export const CHAT_API: string | undefined = chatEndpoint(import.meta.env.PUBLIC_CAAIL_CHAT_API);

/** True only when there is an endpoint to send a question to. */
export const CHAT_ENABLED: boolean = CHAT_API !== undefined;
