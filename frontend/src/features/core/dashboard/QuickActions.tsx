import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
    PackagePlus,
    ArrowLeftRight,
    ClipboardList,
    ScanLine,
    MapPin,
    Layers,
    Eye,
    Kanban,
} from "lucide-react";
import { useCapabilities, type Capabilities } from "../../../hooks/useCapabilities";

interface QuickAction {
    labelKey: string;
    descKey: string;
    href: string;
    icon: typeof PackagePlus;
    /** Capability required to see this action; undefined = visible to all. */
    capability?: keyof Capabilities;
}

const actions: QuickAction[] = [
    {
        labelKey: "addProduct",
        descKey: "addProductDesc",
        href: "/products/create",
        icon: PackagePlus,
    },
    {
        labelKey: "recordMovement",
        descKey: "recordMovementDesc",
        href: "/movements/create",
        icon: ArrowLeftRight,
    },
    {
        labelKey: "openRestockBoard",
        descKey: "openRestockBoardDesc",
        href: "/restock",
        icon: Kanban,
    },
    {
        labelKey: "createWorkOrder",
        descKey: "createWorkOrderDesc",
        href: "/work-orders/create",
        icon: ClipboardList,
    },
    {
        labelKey: "scanQrCode",
        descKey: "scanQrCodeDesc",
        href: "/widget",
        icon: ScanLine,
    },
    {
        labelKey: "addLocation",
        descKey: "addLocationDesc",
        href: "/locations/create",
        icon: MapPin,
    },
    {
        labelKey: "widgetPreview",
        descKey: "widgetPreviewDesc",
        href: "/widget-preview",
        icon: Eye,
        capability: "view_widget_preview",
    },
    {
        labelKey: "generateWidget",
        descKey: "generateWidgetDesc",
        href: "/widget-generator",
        icon: Layers,
        capability: "view_widget_generator",
    },
];

export const QuickActions = () => {
    const navigate = useNavigate();
    const { t } = useTranslation("dashboard");
    const { capabilities } = useCapabilities();

    const visibleActions = actions.filter(
        (a) => !a.capability || capabilities[a.capability],
    );

    return (
        <div className="mb-6">
            <h2 className="text-sm font-medium text-zinc-400 mb-3">
                {t("quickActions")}
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {visibleActions.map((action) => (
                    <button
                        key={action.href}
                        onClick={() => navigate(action.href)}
                        className="flex items-center gap-3 bg-zinc-900 border border-white/[0.06] rounded-xl px-4 py-4 text-left border-l-2 border-l-indigo-500 hover:bg-zinc-800 transition-colors duration-150 cursor-pointer"
                    >
                        <div className="flex-shrink-0 text-indigo-400">
                            <action.icon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-zinc-100">
                                {t(action.labelKey)}
                            </p>
                            <p className="text-xs text-zinc-500 truncate">
                                {t(action.descKey)}
                            </p>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
};
