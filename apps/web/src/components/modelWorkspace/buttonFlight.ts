export interface ButtonFlightRef {
  current: string | null;
}

/** Acquire one model-button RPC slot synchronously, before React can re-render. */
export function beginButtonFlight(flight: ButtonFlightRef, key: string): boolean {
  if (flight.current !== null) return false;
  flight.current = key;
  return true;
}

/** Only the request that acquired the slot may release it. */
export function finishButtonFlight(flight: ButtonFlightRef, key: string): boolean {
  if (flight.current !== key) return false;
  flight.current = null;
  return true;
}
