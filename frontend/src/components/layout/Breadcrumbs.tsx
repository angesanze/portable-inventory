import { useTranslation } from "react-i18next";
import { useOne } from "@refinedev/core";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import type { BreadcrumbSegment } from "./types";
import { buildBreadcrumbs } from "./breadcrumbs";

/** Renders a single breadcrumb segment, fetching resource name if needed */
function BreadcrumbSegmentLabel({ crumb, isLast }: { crumb: BreadcrumbSegment; isLast: boolean }) {
    const { t } = useTranslation();
    const { data, isLoading } = useOne(
        crumb.resourceInfo
            ? {
                  resource: crumb.resourceInfo.resource,
                  id: crumb.resourceInfo.id,
                  queryOptions: { enabled: true },
              }
            : {
                  resource: "",
                  id: "",
                  queryOptions: { enabled: false },
              },
    );

    const label = crumb.resourceInfo
        ? isLoading
            ? null
            : (data?.data as Record<string, unknown>)?.[crumb.resourceInfo.nameField] as string ?? crumb.label
        : crumb.labelKey
            ? t(crumb.labelKey)
            : crumb.label;

    if (crumb.resourceInfo && isLoading) {
        return <span className="inline-block w-20 h-4 bg-zinc-700 rounded animate-pulse" />;
    }

    if (isLast) {
        return <span className="text-zinc-400">{label}</span>;
    }

    return (
        <Link to={crumb.path} className="hover:text-zinc-300 transition-colors">
            {label}
        </Link>
    );
}

/** Full breadcrumb bar with ChevronRight separators */
export function BreadcrumbBar({ pathname }: { pathname: string }) {
    if (pathname === "/") return null;
    const crumbs = buildBreadcrumbs(pathname);
    return (
        <nav className="flex items-center gap-1.5 text-sm text-zinc-500" data-testid="breadcrumb-nav">
            {crumbs.map((crumb, i, arr) => (
                <span key={crumb.path} className="flex items-center gap-1.5">
                    {i > 0 && <ChevronRight className="w-3 h-3 text-zinc-600" strokeWidth={2} />}
                    <BreadcrumbSegmentLabel crumb={crumb} isLast={i === arr.length - 1} />
                </span>
            ))}
        </nav>
    );
}
