import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PackagePlus, PackageMinus, ArrowRightLeft } from "lucide-react";

const MOVEMENT_TYPES = [
    {
        key: "inbound",
        labelKey: "movements.receiveStock",
        descriptionKey: "movements.receiveStockDesc",
        href: "/movements/create?direction=inbound",
        icon: PackagePlus,
        color: {
            text: "text-emerald-400",
            ring: "hover:ring-emerald-500/40",
            bg: "hover:border-emerald-500/30",
            iconBg: "bg-emerald-500/10",
        },
    },
    {
        key: "outbound",
        labelKey: "movements.shipConsume",
        descriptionKey: "movements.shipConsumeDesc",
        href: "/movements/create?direction=outbound",
        icon: PackageMinus,
        color: {
            text: "text-amber-400",
            ring: "hover:ring-amber-500/40",
            bg: "hover:border-amber-500/30",
            iconBg: "bg-amber-500/10",
        },
    },
    {
        key: "transfer",
        labelKey: "movements.transferBetween",
        descriptionKey: "movements.transferBetweenDesc",
        href: "/movements/transfer",
        icon: ArrowRightLeft,
        color: {
            text: "text-cyan-400",
            ring: "hover:ring-cyan-500/40",
            bg: "hover:border-cyan-500/30",
            iconBg: "bg-cyan-500/10",
        },
    },
] as const;

export const MovementTypePicker = () => {
    const navigate = useNavigate();
    const { t } = useTranslation(["inventory", "common"]);

    return (
        <div className="flex flex-col gap-3">
            {MOVEMENT_TYPES.map((type) => (
                <button
                    key={type.key}
                    onClick={() => navigate(type.href)}
                    className={`flex items-center gap-4 bg-zinc-900 border border-white/[0.06] rounded-xl px-5 py-6 text-left transition-all duration-150 cursor-pointer hover:ring-1 ${type.color.ring} ${type.color.bg}`}
                >
                    <div
                        className={`flex-shrink-0 w-12 h-12 rounded-lg ${type.color.iconBg} flex items-center justify-center`}
                    >
                        <type.icon className={`w-6 h-6 ${type.color.text}`} />
                    </div>
                    <div className="min-w-0">
                        <p className={`text-base font-medium text-zinc-100`}>
                            {t(type.labelKey)}
                        </p>
                        <p className="text-sm text-zinc-400 mt-0.5">
                            {t(type.descriptionKey)}
                        </p>
                    </div>
                </button>
            ))}
        </div>
    );
};
