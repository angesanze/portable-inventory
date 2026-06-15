import { Navigate } from "react-router-dom";
import { useCapabilities } from "../hooks/useCapabilities";

/**
 * Route guard: renders ``children`` only for platform superusers, otherwise
 * redirects to the dashboard. While identity is still loading we render
 * ``null`` rather than the page, so the console never flashes for a
 * non-superuser before the redirect (fail closed). Must live inside
 * ``<Refine>`` so it can read ``useCapabilities`` (which wraps
 * ``useGetIdentity``).
 *
 * ``is_superuser`` is kept separate from the capability map on purpose — it is
 * a platform-wide flag, not a per-company capability. UI hiding is convenience
 * only; the backend superuser gates (SUPERADMIN-01..05) are the real
 * enforcement.
 */
export function RequireSuperuser({
  children,
  redirectTo = "/",
}: {
  children: React.ReactNode;
  redirectTo?: string;
}) {
  const { is_superuser, isLoading } = useCapabilities();
  if (isLoading) return null;
  if (!is_superuser) return <Navigate to={redirectTo} replace />;
  return <>{children}</>;
}

export default RequireSuperuser;
