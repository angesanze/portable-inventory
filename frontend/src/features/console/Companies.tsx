import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Building2, ArrowDown, ArrowUp, Plus } from "lucide-react";

import { PageHeader } from "../../components/ui/PageHeader";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { FilterBar, type FilterConfig } from "../../components/ui/FilterBar";
import { EmptyState } from "../../components/ui/EmptyState";
import { SkeletonRow } from "../../components/ui/Skeleton";
import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
} from "../../components/ui/Table";
import { useCompanies } from "./hooks";
import { ProvisionDeveloperModal } from "./ProvisionDeveloperModal";

const COLUMN_COUNT = 7;

/** Ordering fields the backend viewset accepts (`ordering_fields`). */
type SortField = "name" | "last_activity";

/**
 * Companies management grid for the superadmin console. Lists every company on
 * the platform via {@link useCompanies} (`GET /platform/companies/`) with the
 * tier badge, VAT, per-company user/API-key counts, last-activity timestamp and
 * active/suspended status. Wires the search box + tier/status selects to the
 * viewset's `?search=` / `?account_type=` / `?is_active=` filters (search is
 * debounced), and turns the Name / Last Activity headers into `?ordering=`
 * toggles. Shows skeleton rows while loading, an {@link EmptyState} when no
 * company matches, and fails closed to an error card. Mounted only behind
 * `RequireSuperuser`.
 */
export const Companies = () => {
    const { t } = useTranslation("nav");
    const navigate = useNavigate();

    const [searchInput, setSearchInput] = useState("");
    const [search, setSearch] = useState("");
    const [accountType, setAccountType] = useState("");
    const [isActive, setIsActive] = useState("");
    const [sortField, setSortField] = useState<SortField>("name");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
    const [isProvisionOpen, setIsProvisionOpen] = useState(false);

    // Debounce the search box so each keystroke doesn't fire a request.
    useEffect(() => {
        const id = setTimeout(() => setSearch(searchInput.trim()), 300);
        return () => clearTimeout(id);
    }, [searchInput]);

    const ordering = `${sortDir === "desc" ? "-" : ""}${sortField}`;

    const { companies, isLoading, isError, refetch } = useCompanies({
        search,
        account_type: accountType,
        is_active: isActive,
        ordering,
    });

    const filters: FilterConfig[] = useMemo(
        () => [
            {
                key: "search",
                label: t("consoleSearchCompanies"),
                type: "text",
                placeholder: t("consoleSearchPlaceholder"),
                value: searchInput,
                onChange: setSearchInput,
            },
            {
                key: "account_type",
                label: t("consoleFilterTier"),
                type: "select",
                value: accountType,
                onChange: setAccountType,
                options: [
                    { value: "manager", label: t("consoleTierManager") },
                    { value: "developer", label: t("consoleTierDeveloper") },
                ],
            },
            {
                key: "is_active",
                label: t("consoleFilterStatus"),
                type: "select",
                value: isActive,
                onChange: setIsActive,
                options: [
                    { value: "true", label: t("consoleStatusActive") },
                    { value: "false", label: t("consoleStatusSuspended") },
                ],
            },
        ],
        [t, searchInput, accountType, isActive],
    );

    // Toggle direction when the active column is re-clicked, otherwise switch
    // column and reset to ascending.
    const toggleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        } else {
            setSortField(field);
            setSortDir("asc");
        }
    };

    const sortIcon = (field: SortField) => {
        if (sortField !== field) return null;
        const Icon = sortDir === "asc" ? ArrowUp : ArrowDown;
        return <Icon size={12} className="inline-block ml-1 -mt-0.5" />;
    };

    const formatActivity = (value: string | null) =>
        value
            ? new Date(value).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
              })
            : t("consoleNever");

    return (
        <div>
            <PageHeader
                title={t("consoleCompanies")}
                subtitle={t("consoleTitle")}
                actions={
                    <Button
                        variant="primary"
                        size="sm"
                        icon={Plus}
                        onClick={() => setIsProvisionOpen(true)}
                    >
                        {t("consoleProvisionTitle")}
                    </Button>
                }
            />

            <ProvisionDeveloperModal
                isOpen={isProvisionOpen}
                onClose={() => setIsProvisionOpen(false)}
                onProvisioned={refetch}
            />

            <FilterBar filters={filters} className="mb-4" />

            {isError ? (
                <Card>
                    <p className="text-sm text-red-400">{t("consoleCompaniesError")}</p>
                </Card>
            ) : (
                <Card padding="none">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead
                                    className="cursor-pointer select-none hover:text-zinc-300"
                                    onClick={() => toggleSort("name")}
                                >
                                    {t("consoleColName")}
                                    {sortIcon("name")}
                                </TableHead>
                                <TableHead>{t("consoleColTier")}</TableHead>
                                <TableHead>{t("consoleColVat")}</TableHead>
                                <TableHead className="text-right">
                                    {t("consoleColUsers")}
                                </TableHead>
                                <TableHead className="text-right">
                                    {t("consoleColApiKeys")}
                                </TableHead>
                                <TableHead
                                    className="cursor-pointer select-none hover:text-zinc-300"
                                    onClick={() => toggleSort("last_activity")}
                                >
                                    {t("consoleColActivity")}
                                    {sortIcon("last_activity")}
                                </TableHead>
                                <TableHead>{t("consoleColStatus")}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <SkeletonRow columns={COLUMN_COUNT} rows={6} />
                            ) : companies.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={COLUMN_COUNT} className="p-0">
                                        <EmptyState
                                            icon={Building2}
                                            title={t("consoleNoCompanies")}
                                            description={t("consoleNoCompaniesDesc")}
                                        />
                                    </TableCell>
                                </TableRow>
                            ) : (
                                companies.map((company) => (
                                    <TableRow
                                        key={company.id}
                                        className="cursor-pointer hover:bg-white/[0.03]"
                                        onClick={() =>
                                            navigate(`/console/companies/${company.id}`)
                                        }
                                    >
                                        <TableCell className="font-medium text-zinc-100">
                                            {company.name}
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant={
                                                    company.account_type === "developer"
                                                        ? "indigo"
                                                        : "cyan"
                                                }
                                            >
                                                {company.account_type === "developer"
                                                    ? t("consoleTierDeveloper")
                                                    : t("consoleTierManager")}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-zinc-400">
                                            {company.vat || "—"}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {company.users_count}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {company.api_keys_count}
                                        </TableCell>
                                        <TableCell className="text-zinc-400">
                                            {formatActivity(company.last_activity)}
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant={
                                                    company.is_active ? "success" : "warning"
                                                }
                                                dot
                                            >
                                                {company.is_active
                                                    ? t("consoleStatusActive")
                                                    : t("consoleStatusSuspended")}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </Card>
            )}
        </div>
    );
};

export default Companies;
