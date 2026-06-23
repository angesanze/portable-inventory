import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
    LayoutGrid,
    Box,
    Archive,
    MapPin,
    ArrowLeftRight,
    ClipboardList,
    KeyRound,
    Plus,
    ArrowDownToLine,
    ArrowUpFromLine,
    Repeat,
    QrCode,
    Calculator,
    Layers,
    Settings,
    Search,
    Clock,
    type LucideIcon,
} from "lucide-react";

// ---------- Command definitions ----------

type CommandCategory = "Navigation" | "Actions" | "Settings";

interface Command {
    /** Namespace-qualified i18n key, e.g. "nav:dashboard". */
    labelKey: string;
    route: string;
    /** Stable grouping key (not displayed directly — see CATEGORY_KEYS). */
    category: CommandCategory;
    icon: LucideIcon;
    keywords?: string[];
}

const COMMANDS: Command[] = [
    // Navigation
    { labelKey: "nav:dashboard", route: "/", category: "Navigation", icon: LayoutGrid },
    { labelKey: "nav:products", route: "/products", category: "Navigation", icon: Box },
    { labelKey: "nav:stock", route: "/stock", category: "Navigation", icon: Archive },
    { labelKey: "nav:locations", route: "/locations", category: "Navigation", icon: MapPin },
    { labelKey: "nav:movements", route: "/movements", category: "Navigation", icon: ArrowLeftRight },
    { labelKey: "nav:workOrders", route: "/work-orders", category: "Navigation", icon: ClipboardList },
    { labelKey: "nav:settings", route: "/settings/api-keys", category: "Navigation", icon: Settings },

    // Actions
    { labelKey: "nav:createProduct", route: "/products/create", category: "Actions", icon: Plus, keywords: ["new", "add"] },
    { labelKey: "nav:receiveStock", route: "/movements/create?direction=inbound", category: "Actions", icon: ArrowDownToLine, keywords: ["inbound", "incoming"] },
    { labelKey: "nav:shipOut", route: "/movements/create?direction=outbound", category: "Actions", icon: ArrowUpFromLine, keywords: ["outbound", "send"] },
    { labelKey: "nav:transferStock", route: "/movements/transfer", category: "Actions", icon: Repeat, keywords: ["move"] },
    { labelKey: "nav:createWorkOrder", route: "/work-orders/create", category: "Actions", icon: Plus, keywords: ["new", "add"] },
    { labelKey: "nav:addLocation", route: "/locations/create", category: "Actions", icon: Plus, keywords: ["new", "create"] },
    { labelKey: "nav:scanQrCode", route: "/widget", category: "Actions", icon: QrCode, keywords: ["scanner"] },

    // Settings
    { labelKey: "nav:apiKeys", route: "/settings/api-keys", category: "Settings", icon: KeyRound },
    { labelKey: "nav:trackingPresets", route: "/settings/calculators", category: "Settings", icon: Calculator },
    { labelKey: "nav:qrCodes", route: "/qr-codes", category: "Settings", icon: QrCode },
    { labelKey: "nav:widgetGenerator", route: "/widget-generator", category: "Settings", icon: Layers },
];

const CATEGORY_ORDER: CommandCategory[] = ["Navigation", "Actions", "Settings"];

/** Maps stable grouping keys to their namespace-qualified i18n keys. */
const CATEGORY_KEYS: Record<CommandCategory, string> = {
    Navigation: "nav:navCategory",
    Actions: "nav:actionsCategory",
    Settings: "nav:settingsCategory",
};

const MAX_VISIBLE = 8;
const RECENT_COMMANDS_KEY = "recentCommands";
const MAX_RECENT = 5;

// ---------- Recent commands ----------

interface RecentEntry {
    label: string;
    route: string;
    timestamp: number;
}

function loadRecents(): RecentEntry[] {
    try {
        const raw = localStorage.getItem(RECENT_COMMANDS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.slice(0, MAX_RECENT);
    } catch {
        return [];
    }
}

function saveRecent(cmd: Command, label: string) {
    const recents = loadRecents().filter((r) => r.route !== cmd.route);
    recents.unshift({ label, route: cmd.route, timestamp: Date.now() });
    localStorage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(recents.slice(0, MAX_RECENT)));
}

function clearRecents() {
    localStorage.removeItem(RECENT_COMMANDS_KEY);
}

// ---------- Filtering ----------

function matchesQuery(command: Command, query: string, label: string, category: string): boolean {
    const q = query.toLowerCase();
    if (label.toLowerCase().includes(q)) return true;
    if (category.toLowerCase().includes(q)) return true;
    if (command.keywords?.some((kw) => kw.includes(q))) return true;
    return false;
}

// ---------- Component ----------

interface CommandPaletteProps {
    open: boolean;
    onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
    const { t } = useTranslation(["nav", "common"]);
    const [query, setQuery] = useState("");
    const [highlightIndex, setHighlightIndex] = useState(0);
    const [recents, setRecents] = useState<RecentEntry[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();

    // Translate a command's label / category for display and filtering.
    const cmdLabel = useCallback((cmd: Command) => t(cmd.labelKey), [t]);
    const catLabel = useCallback((cat: CommandCategory) => t(CATEGORY_KEYS[cat]), [t]);

    // Resolve recent entries to full Command objects
    const recentCommands = useMemo(() => {
        const cmdByRoute = new Map(COMMANDS.map((c) => [c.route, c]));
        return recents
            .map((r) => cmdByRoute.get(r.route))
            .filter((c): c is Command => c != null);
    }, [recents]);

    const isEmptyQuery = query.trim() === "";
    const hasRecents = isEmptyQuery && recentCommands.length > 0;

    const filtered = useMemo(() => {
        const q = query.trim();
        if (!q) return COMMANDS;
        return COMMANDS.filter((cmd) => matchesQuery(cmd, q, cmdLabel(cmd), catLabel(cmd.category)));
    }, [query, cmdLabel, catLabel]);

    // When showing recents, offset flat indices for main results
    const recentCount = hasRecents ? recentCommands.length : 0;
    const mainSliceCount = hasRecents ? Math.max(0, MAX_VISIBLE - recentCount) : MAX_VISIBLE;
    const visibleResults = filtered.slice(0, mainSliceCount);
    const totalVisible = recentCount + visibleResults.length;

    // Group by category preserving order
    const grouped = useMemo(() => {
        const groups: { category: string; items: { command: Command; flatIndex: number }[] }[] = [];
        const catMap = new Map<string, { command: Command; flatIndex: number }[]>();

        visibleResults.forEach((cmd, i) => {
            const flatIndex = recentCount + i;
            if (!catMap.has(cmd.category)) catMap.set(cmd.category, []);
            catMap.get(cmd.category)!.push({ command: cmd, flatIndex });
        });

        for (const cat of CATEGORY_ORDER) {
            const items = catMap.get(cat);
            if (items?.length) groups.push({ category: cat, items });
        }
        return groups;
    }, [visibleResults, recentCount]);

    // Reset state when opening
    useEffect(() => {
        if (open) {
            // Re-seed the palette each time it opens (clear query, reload the
            // recents list from storage, reset the highlight) — driven by the
            // external `open` prop, not by render-derived values.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setQuery("");
            setHighlightIndex(0);
            setRecents(loadRecents());
            // Focus input after render
            requestAnimationFrame(() => inputRef.current?.focus());
        }
    }, [open]);

    // Clamp highlight when results change
    useEffect(() => {
        // Keep the highlighted index within the (changing) result count so an
        // out-of-range selection can never persist after filtering.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setHighlightIndex((prev) => Math.min(prev, Math.max(0, totalVisible - 1)));
    }, [totalVisible]);

    const selectCommand = useCallback(
        (cmd: Command) => {
            saveRecent(cmd, cmdLabel(cmd));
            onClose();
            // Handle routes with query params
            if (cmd.route.includes("?")) {
                const [path, search] = cmd.route.split("?");
                navigate(`${path}?${search}`);
            } else {
                navigate(cmd.route);
            }
        },
        [navigate, onClose, cmdLabel],
    );

    const handleClearRecents = useCallback(() => {
        clearRecents();
        setRecents([]);
        setHighlightIndex(0);
    }, []);

    // Keyboard navigation
    useEffect(() => {
        if (!open) return;

        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                onClose();
            } else if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlightIndex((prev) => (prev + 1) % totalVisible);
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlightIndex((prev) => (prev - 1 + totalVisible) % totalVisible);
            } else if (e.key === "Enter") {
                e.preventDefault();
                let cmd: Command | undefined;
                if (hasRecents && highlightIndex < recentCount) {
                    cmd = recentCommands[highlightIndex];
                } else {
                    cmd = visibleResults[highlightIndex - recentCount];
                }
                if (cmd) selectCommand(cmd);
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [open, highlightIndex, totalVisible, recentCount, recentCommands, hasRecents, visibleResults, onClose, selectCommand]);

    // Scroll highlighted item into view
    useEffect(() => {
        if (!listRef.current) return;
        const el = listRef.current.querySelector(`[data-index="${highlightIndex}"]`);
        if (el && typeof el.scrollIntoView === "function") {
            el.scrollIntoView({ block: "nearest" });
        }
    }, [highlightIndex]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            data-testid="command-palette-overlay"
        >
            <div
                className="w-full max-w-lg bg-zinc-900 rounded-xl ring-1 ring-zinc-700 shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
                data-testid="command-palette"
            >
                {/* Search input */}
                <div className="flex items-center gap-3 px-4 border-b border-white/[0.06]">
                    <Search className="w-5 h-5 text-zinc-500 flex-shrink-0" strokeWidth={2} />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setHighlightIndex(0);
                        }}
                        placeholder={t("nav:commandPalette")}
                        className="flex-1 bg-transparent text-lg text-zinc-100 placeholder-zinc-500 py-3.5 outline-none"
                        data-testid="command-palette-input"
                    />
                    <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium text-zinc-500 bg-zinc-800 border border-zinc-700">
                        ESC
                    </kbd>
                </div>

                {/* Results */}
                <div ref={listRef} className="max-h-80 overflow-y-auto py-2" data-testid="command-palette-results">
                    {totalVisible === 0 ? (
                        <div className="px-4 py-8 text-center text-sm text-zinc-500">
                            {t("nav:noCommandsFound")}
                        </div>
                    ) : (
                        <>
                            {hasRecents && (
                                <div data-testid="recent-commands-section">
                                    <div className="px-4 pt-2 pb-1 flex items-center justify-between">
                                        <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                                            <Clock className="w-3 h-3" />
                                            {t("common:recent")}
                                        </span>
                                        <button
                                            onClick={handleClearRecents}
                                            className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors"
                                            data-testid="clear-recents"
                                        >
                                            {t("common:clearRecent")}
                                        </button>
                                    </div>
                                    {recentCommands.map((cmd, i) => {
                                        const Icon = cmd.icon;
                                        const isHighlighted = i === highlightIndex;
                                        return (
                                            <button
                                                key={`recent-${cmd.route}`}
                                                data-index={i}
                                                onClick={() => selectCommand(cmd)}
                                                onMouseEnter={() => setHighlightIndex(i)}
                                                className={`
                                                    w-full flex items-center gap-3 px-4 py-2 text-left transition-colors
                                                    ${isHighlighted ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800/50"}
                                                `}
                                                data-testid={`command-item-${i}`}
                                            >
                                                <Icon className="w-4 h-4 flex-shrink-0" strokeWidth={2} />
                                                <span className="flex-1 text-sm">{cmdLabel(cmd)}</span>
                                                <span className="text-[11px] text-zinc-600">{catLabel(cmd.category)}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                            {grouped.map((group) => (
                                <div key={group.category}>
                                    <div className="px-4 pt-2 pb-1 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                                        {catLabel(group.category as CommandCategory)}
                                    </div>
                                    {group.items.map(({ command, flatIndex }) => {
                                        const Icon = command.icon;
                                        const isHighlighted = flatIndex === highlightIndex;
                                        return (
                                            <button
                                                key={command.labelKey + command.route}
                                                data-index={flatIndex}
                                                onClick={() => selectCommand(command)}
                                                onMouseEnter={() => setHighlightIndex(flatIndex)}
                                                className={`
                                                    w-full flex items-center gap-3 px-4 py-2 text-left transition-colors
                                                    ${isHighlighted ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800/50"}
                                                `}
                                                data-testid={`command-item-${flatIndex}`}
                                            >
                                                <Icon className="w-4 h-4 flex-shrink-0" strokeWidth={2} />
                                                <span className="flex-1 text-sm">{cmdLabel(command)}</span>
                                                <span className="text-[11px] text-zinc-600">{catLabel(command.category)}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            ))}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
