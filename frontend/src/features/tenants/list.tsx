import { useList } from "@refinedev/core";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Building2, LogIn } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../../components/ui/PageHeader";
import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
} from "../../components/ui/Table";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { SkeletonRow } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorState } from "../../components/ui/ErrorState";
import { useActingTenant } from "../../context/ActingTenantProvider";

/**
 * Developer-only tenant management list (DUAL-TIER-07). Lists the child
 * manager-companies the developer owns (backed by the `tenants` resource) and
 * lets the developer "Enter" one — `setActingTenant(id)` flips the
 * `X-Acting-Company` header so subsequent dashboard data is scoped to that
 * tenant. The row matching the current acting tenant is badged so the
 * developer can see which context is live.
 */
export const TenantList = () => {
    const { t } = useTranslation(["settings", "common"]);
    const navigate = useNavigate();
    const { actingTenantId, setActingTenant } = useActingTenant();

    const { data: listData, isLoading, isError, refetch } = useList({
        resource: "tenants",
        sorters: [{ field: "name", order: "asc" }],
    }) as any;

    const tenants = Array.isArray(listData?.data) ? listData.data : [];

    return (
        <div>
            <PageHeader
                title={t("settings:tenants.listTitle")}
                subtitle={t("settings:tenants.subtitle")}
                count={tenants.length}
                actions={
                    <Link to="/tenants/create">
                        <Button variant="primary" icon={Plus}>
                            {t("settings:tenants.newTenant")}
                        </Button>
                    </Link>
                }
            />

            {isError ? (
                <ErrorState
                    title={t("settings:tenants.errorTitle")}
                    message={t("settings:tenants.errorMessage")}
                    onRetry={refetch}
                />
            ) : isLoading ? (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t("settings:tenants.nameColumn")}</TableHead>
                            <TableHead>{t("settings:tenants.licenseColumn")}</TableHead>
                            <TableHead className="text-right">{t("common:actions")}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <SkeletonRow columns={3} />
                    </TableBody>
                </Table>
            ) : tenants.length === 0 ? (
                <EmptyState
                    icon={Building2}
                    title={t("settings:tenants.emptyTitle")}
                    description={t("settings:tenants.emptyDesc")}
                    actionLabel={t("settings:tenants.addTenant")}
                    onAction={() => navigate("/tenants/create")}
                />
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t("settings:tenants.nameColumn")}</TableHead>
                            <TableHead>{t("settings:tenants.licenseColumn")}</TableHead>
                            <TableHead className="text-right">{t("common:actions")}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {tenants.map((tenant: any) => {
                            const isActing = String(tenant.id) === String(actingTenantId);
                            return (
                                <TableRow key={tenant.id}>
                                    <TableCell className="font-medium text-zinc-200">
                                        <span className="flex items-center gap-2">
                                            {tenant.name}
                                            {isActing && (
                                                <Badge variant="emerald" dot>
                                                    {t("settings:tenants.acting")}
                                                </Badge>
                                            )}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-zinc-400 text-sm font-mono">
                                        {tenant.license_code || "—"}
                                    </TableCell>
                                    <TableCell
                                        className="text-right"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            icon={LogIn}
                                            disabled={isActing}
                                            onClick={() => setActingTenant(String(tenant.id))}
                                        >
                                            {t("settings:tenants.enter")}
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            )}
        </div>
    );
};
