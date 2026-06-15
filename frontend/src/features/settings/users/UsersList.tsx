import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useList } from "@refinedev/core";
import { UserCog, UserX, UserCheck } from "lucide-react";
import { axiosInstance } from "../../../providers/axios-client";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Card } from "../../../components/ui/Card";
import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
} from "../../../components/ui/Table";
import { Badge } from "../../../components/ui/Badge";
import type { BadgeVariant } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Select } from "../../../components/ui/Select";
import { SkeletonRow } from "../../../components/ui/Skeleton";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { useToast } from "../../../components/ui/Toast";
import { useCapabilities, type Role } from "../../../hooks/useCapabilities";

const ROLES: Role[] = ["OWNER", "ADMIN", "OPERATOR", "VIEWER"];

const ROLE_VARIANTS: Record<Role, BadgeVariant> = {
    OWNER: "indigo",
    ADMIN: "amber",
    OPERATOR: "slate",
    VIEWER: "slate",
};

interface CompanyUser {
    id: string;
    username: string;
    email: string;
    role: Role;
    is_active: boolean;
    date_joined: string;
}

/**
 * In-app company user management (GOVERNANCE-11 / C2 / B3).
 *
 * Visible only to OWNERs (gated by the `manage_users` capability on the route
 * and nav). Lists the company's members; the OWNER may change roles and
 * deactivate / reactivate members. The backend refuses to demote or deactivate
 * the last remaining OWNER, so those failures surface as toasts.
 *
 * Developer-acting-on-child scoping is automatic: the `X-Acting-Company` header
 * is attached by the axios client, so the same view manages a child tenant's
 * users when a developer is impersonating it.
 */
export const UsersList = () => {
    const { t } = useTranslation(["settings", "common"]);
    const { toast } = useToast();
    const { role: myRole } = useCapabilities();
    const [busyId, setBusyId] = useState<string | null>(null);

    const { data, isLoading, isError, refetch } = useList<CompanyUser>({
        resource: "company-users",
        pagination: { mode: "off" },
    });

    const users = Array.isArray(data?.data) ? data.data : [];
    const canEdit = myRole === "OWNER";

    const changeRole = async (user: CompanyUser, role: string) => {
        if (role === user.role) return;
        setBusyId(user.id);
        try {
            await axiosInstance.patch(`/api/v1/company-users/${user.id}/role/`, { role });
            toast({ message: t("settings:users.roleUpdated"), variant: "success" });
            refetch();
        } catch (err) {
            const detail =
                (err as { response?: { data?: { error?: string; detail?: string } } })
                    ?.response?.data?.error ||
                (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
                t("settings:users.actionFailed");
            toast({ message: String(detail), variant: "error" });
        } finally {
            setBusyId(null);
        }
    };

    const toggleActive = async (user: CompanyUser) => {
        setBusyId(user.id);
        const verb = user.is_active ? "deactivate" : "activate";
        try {
            await axiosInstance.post(`/api/v1/company-users/${user.id}/${verb}/`, {});
            toast({
                message: user.is_active
                    ? t("settings:users.deactivated")
                    : t("settings:users.activated"),
                variant: "success",
            });
            refetch();
        } catch (err) {
            const detail =
                (err as { response?: { data?: { error?: string; detail?: string } } })
                    ?.response?.data?.error ||
                (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
                t("settings:users.actionFailed");
            toast({ message: String(detail), variant: "error" });
        } finally {
            setBusyId(null);
        }
    };

    return (
        <>
            <PageHeader
                title={t("settings:users.title")}
                description={t("settings:users.subtitle")}
            />
            <Card>
                {isLoading ? (
                    <Table>
                        <TableBody>
                            {[...Array(4)].map((_, i) => (
                                <SkeletonRow key={i} columns={5} />
                            ))}
                        </TableBody>
                    </Table>
                ) : isError ? (
                    <ErrorState title={t("settings:users.errorTitle")} />
                ) : users.length === 0 ? (
                    <EmptyState
                        icon={UserCog}
                        title={t("settings:users.emptyTitle")}
                        description={t("settings:users.emptyDesc")}
                    />
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t("settings:users.username")}</TableHead>
                                <TableHead>{t("settings:users.email")}</TableHead>
                                <TableHead>{t("settings:users.role")}</TableHead>
                                <TableHead>{t("settings:users.status")}</TableHead>
                                <TableHead className="text-right">
                                    {t("settings:users.actions")}
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {users.map((user) => (
                                <TableRow key={user.id} data-testid={`user-row-${user.username}`}>
                                    <TableCell className="font-medium">{user.username}</TableCell>
                                    <TableCell className="text-zinc-400">
                                        {user.email || "—"}
                                    </TableCell>
                                    <TableCell>
                                        {canEdit ? (
                                            <Select
                                                value={user.role}
                                                disabled={busyId === user.id}
                                                onChange={(v) => changeRole(user, String(v))}
                                                options={ROLES.map((r) => ({
                                                    value: r,
                                                    label: t(`settings:users.roles.${r}`),
                                                }))}
                                            />
                                        ) : (
                                            <Badge variant={ROLE_VARIANTS[user.role]}>
                                                {t(`settings:users.roles.${user.role}`)}
                                            </Badge>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={user.is_active ? "emerald" : "slate"}>
                                            {user.is_active
                                                ? t("settings:users.active")
                                                : t("settings:users.inactive")}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {canEdit && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                disabled={busyId === user.id}
                                                onClick={() => toggleActive(user)}
                                                data-testid={`toggle-active-${user.username}`}
                                            >
                                                {user.is_active ? (
                                                    <>
                                                        <UserX className="w-4 h-4 mr-1.5" />
                                                        {t("settings:users.deactivate")}
                                                    </>
                                                ) : (
                                                    <>
                                                        <UserCheck className="w-4 h-4 mr-1.5" />
                                                        {t("settings:users.activate")}
                                                    </>
                                                )}
                                            </Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </Card>
        </>
    );
};

export default UsersList;
