import { useTranslation } from "react-i18next";
import { useLogout, useGetIdentity } from "@refinedev/core";
import { Link, Outlet, useLocation } from "react-router-dom";
import {
    LayoutGrid,
    Building2,
    BarChart3,
    Activity,
    ScrollText,
    ArrowLeft,
    ShieldCheck,
    LogOut,
    type LucideIcon,
} from "lucide-react";

/**
 * Superadmin console navigation. Each entry maps a route to an i18n key in the
 * `nav` namespace. The console is a separate cockpit from the per-company app,
 * so it owns its own sidebar rather than reusing the main {@link Layout} nav.
 */
interface ConsoleNavItem {
    labelKey: string;
    route: string;
    icon: LucideIcon;
}

const CONSOLE_NAV: ConsoleNavItem[] = [
    { labelKey: "consoleOverview", route: "/console", icon: LayoutGrid },
    { labelKey: "consoleCompanies", route: "/console/companies", icon: Building2 },
    { labelKey: "consoleInsights", route: "/console/insights", icon: BarChart3 },
    { labelKey: "consoleApiUsage", route: "/console/api-usage", icon: Activity },
    { labelKey: "consoleAudit", route: "/console/audit", icon: ScrollText },
];

interface ConsoleIdentity {
    name: string;
    email: string;
    avatar: string;
}

/**
 * Shell layout for the platform superadmin console (`/console/*`). Mounted only
 * behind `RequireSuperuser`, so it never renders for a non-superuser. Provides
 * its own sidebar (Overview / Companies / Insights / API Usage / Audit) plus a link back to
 * the per-company app. Phases 07/08 fill the Companies and Insights views; this
 * phase is the cockpit shell only.
 */
export const ConsoleLayout = ({ children }: { children?: React.ReactNode }) => {
    const { t } = useTranslation("nav");
    const { mutate: logout } = useLogout();
    const { data: identity } = useGetIdentity<ConsoleIdentity>();
    const location = useLocation();

    const isActive = (route: string) =>
        route === "/console"
            ? location.pathname === "/console" || location.pathname === "/console/"
            : location.pathname.startsWith(route);

    return (
        <div className="flex h-screen bg-zinc-950 text-white overflow-hidden">
            <aside
                role="navigation"
                aria-label="Console navigation"
                className="w-60 flex-shrink-0 bg-zinc-950 border-r border-white/[0.06] flex flex-col z-20"
            >
                {/* Brand */}
                <div className="flex items-center gap-3 px-3 py-5">
                    <div className="w-8 h-8 flex-shrink-0 rounded-lg bg-indigo-500/15 flex items-center justify-center">
                        <ShieldCheck className="w-5 h-5 text-indigo-400" strokeWidth={2} />
                    </div>
                    <div className="flex flex-col leading-none">
                        <span className="text-sm font-bold text-zinc-100 tracking-wide whitespace-nowrap">
                            {t("consoleTitle")}
                        </span>
                        <span className="text-[10px] text-zinc-500 whitespace-nowrap mt-0.5">
                            {t("platform")}
                        </span>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 overflow-y-auto px-2 pb-4" style={{ scrollbarWidth: "none" }}>
                    <div className="flex flex-col gap-0.5">
                        {CONSOLE_NAV.map((item) => {
                            const active = isActive(item.route);
                            const Icon = item.icon;
                            return (
                                <Link
                                    key={item.route}
                                    to={item.route}
                                    className={`
                                        flex items-center gap-3 px-3 py-2 rounded-lg text-sm
                                        transition-colors duration-150 relative
                                        ${active
                                            ? "text-zinc-100 font-medium bg-indigo-500/10"
                                            : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
                                        }
                                    `}
                                    aria-current={active ? "page" : undefined}
                                >
                                    {active && (
                                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 bg-indigo-500 rounded-r" />
                                    )}
                                    <Icon className="w-4 h-4 flex-shrink-0" strokeWidth={2} />
                                    <span className="whitespace-nowrap">{t(item.labelKey)}</span>
                                </Link>
                            );
                        })}
                    </div>
                </nav>

                {/* Bottom: back to app + user/logout */}
                <div className="mt-auto border-t border-white/[0.06] px-2 py-3 flex flex-col gap-2">
                    <Link
                        to="/"
                        className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] transition-colors"
                        data-testid="console-back-to-app"
                    >
                        <ArrowLeft className="w-4 h-4 flex-shrink-0" strokeWidth={2} />
                        <span className="whitespace-nowrap">{t("consoleBackToApp")}</span>
                    </Link>

                    {identity && (
                        <div
                            role="button"
                            aria-label={t("common:logout")}
                            className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-white/[0.04] cursor-pointer transition-colors"
                            onClick={() => logout()}
                        >
                            <img
                                src={identity.avatar}
                                alt={identity.name}
                                className="w-7 h-7 rounded-full flex-shrink-0 bg-zinc-800"
                            />
                            <div className="flex-1 min-w-0">
                                <div className="text-sm text-zinc-200 truncate">{identity.name}</div>
                                <div className="text-[11px] text-zinc-500 truncate">{identity.email}</div>
                            </div>
                            <LogOut className="w-4 h-4 text-zinc-500 hover:text-red-400 flex-shrink-0" strokeWidth={2} />
                        </div>
                    )}
                </div>
            </aside>

            {/* Main content */}
            <main className="flex-1 overflow-y-auto bg-zinc-950">
                <div className="p-3 sm:p-4 md:p-6 max-w-7xl mx-auto">
                    <div className="overflow-x-auto">
                        {children || <Outlet />}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default ConsoleLayout;
