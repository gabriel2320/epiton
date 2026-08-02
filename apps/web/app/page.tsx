import { connection } from "next/server";
import { EpitonProviders } from "./providers";

export default async function HomePage() {
  // A nonce is unique to a request, so this route must never be prerendered or
  // served from a shared Server Component cache.
  await connection();
  return <EpitonProviders />;
}
