/**
 * Whether the build under test was given a chat endpoint.
 *
 * The "Ask CAAIL" box is offered only when PUBLIC_CAAIL_CHAT_API is set at build time
 * (src/lib/chat-config.ts). Unset, pages carry no widget at all, so the chat specs have two
 * honest states to check, and they need to know which one the build is in. The build cannot
 * be asked, so the run is told: give the e2e run the same variable the build had. CI does,
 * on both steps (.github/workflows/test.yml). A run told one thing about a build that did the
 * other fails, in either direction, rather than passing for the wrong reason.
 */
export const CHAT_BUILT: boolean = Boolean(process.env.PUBLIC_CAAIL_CHAT_API);
