import { useOne } from "@refinedev/core";
import { useTranslation } from "react-i18next";
import { Building2, LogOut } from "lucide-react";
import { useActingTenant } from "../../context/ActingTenantProvider";

/**
 * Persistent "acting as TENANT — exit" banner (DUAL-TIER-07).
 *
 * Rendered at the top of the dashboard chrome while an acting tenant is set
 * (i.e. while `X-Acting-Company` is being attached to every request). A
 * deliberately loud amber bar so a developer can never mistake a tenant's
 * inventory/movements for its own. The exit button calls
 * {@link useActingTenant.clearActingTenant} which drops the persisted id and
 * the header, returning the developer to its own company context.
 *
 * Returns `null` for the common case (no acting tenant) so the developer's own
 * dashboard renders unchanged.
 */
export const ActingTenantBanner = () => {
    const { t } = useTranslation("nav");
    const { actingTenantId, clearActingTenant } = useActingTenant();

    // Resolve a friendly tenant name from the same `tenants` resource the list
    // uses. Disabled (no request) when not acting, so the own-context dashboard
    // pays nothing. Falls back to the raw id if the lookup is pending/fails.
    const { data } = useOne({
        resource: "tenants",
        id: actingTenantId ?? "",
        queryOptions: { enabled: Boolean(actingTenantId) },
    });

    if (!actingTenantId) return null;

    const tenantName =
        ((data?.data as Record<string, unknown> | undefined)?.name as string | undefined) ||
        actingTenantId;

    return (
        <div
            role="status"
            data-testid="acting-tenant-banner"
            className="flex items-center gap-3 px-3 py-2 sm:px-4 md:px-6 bg-amber-500/15 border-b border-amber-500/30 text-amber-200"
        >
            <Building2 className="w-4 h-4 flex-shrink-0" strokeWidth={2} />
            <span className="flex-1 text-sm min-w-0 truncate">
                {t("actingAs")}{" "}
                <span className="font-semibold text-amber-100">{tenantName}</span>
            </span>
            <button
                onClick={clearActingTenant}
                data-testid="acting-tenant-exit"
                className="flex items-center gap-1.5 flex-shrink-0 px-2.5 py-1 rounded-md text-xs font-medium text-amber-100 bg-amber-500/20 hover:bg-amber-500/30 transition-colors"
            >
                <LogOut className="w-3.5 h-3.5" strokeWidth={2} />
                {t("actingExit")}
            </button>
        </div>
    );
};
