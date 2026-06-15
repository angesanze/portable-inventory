import { Navigate } from "react-router-dom";
import { useCapabilities, type Capabilities } from "../hooks/useCapabilities";

/**
 * Route guard: renders ``children`` only when the given ``capability`` is
 * granted, otherwise redirects to the dashboard. While identity is still
 * loading we render ``null`` rather than the page, so a developer is never
 * bounced mid-load and a manager never sees a flash of a developer-only page
 * before the redirect. Must live inside ``<Refine>`` so it can read
 * ``useCapabilities`` (which wraps ``useGetIdentity``).
 *
 * UI hiding is convenience only — the backend gates from DUAL-TIER-04/05 are
 * the real enforcement.
 */
export function RequireCapability({
  capability,
  children,
  redirectTo = "/",
}: {
  capability: keyof Capabilities;
  children: React.ReactNode;
  redirectTo?: string;
}) {
  const { capabilities, isLoading } = useCapabilities();
  if (isLoading) return null;
  if (!capabilities[capability]) return <Navigate to={redirectTo} replace />;
  return <>{children}</>;
}

export default RequireCapability;
