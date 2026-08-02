import { ModelWorkspace } from "./ModelWorkspace";

/**
 * @deprecated Party now follows the same generic Screen lifecycle as every
 * Tryton model. Kept only as a source-compatible adapter for older hosts.
 */
export function PartyWorkspace(props: { onHistory: (action: string) => void }) {
  return <ModelWorkspace model="party.party" onHistory={props.onHistory} />;
}
