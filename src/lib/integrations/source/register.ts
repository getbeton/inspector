/**
 * Source adapter registrations (side-effect module).
 *
 * Importing this module registers every built-in source adapter into the
 * framework registry so `getSourceAdapter(<source>)` resolves at runtime.
 * Mirrors the destination side: connectors register once at module load. Add a
 * `registerSourceAdapter(...)` line here as each new source connector lands.
 *
 * Imported for its side effects by `@/lib/integrations/source` (index), which is
 * the module every consumer pulls `getSourceAdapter` from — so the registry is
 * always populated wherever source adapters are resolved.
 */
import { createHubSpotSourceAdapter } from '@/lib/integrations/hubspot/source-adapter'
import { registerSourceAdapter } from './adapter'

registerSourceAdapter(createHubSpotSourceAdapter())
