import { useState } from "react";
import { useList } from "@refinedev/core";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Circle, X } from "lucide-react";
import { useCapabilities } from "../../../hooks/useCapabilities";

const DISMISSED_KEY = "gettingStartedDismissed";

interface Step {
    labelKey: string;
    href: string;
    isComplete: boolean;
}

export const GettingStartedChecklist = () => {
    const navigate = useNavigate();
    const { t } = useTranslation("dashboard");
    const [dismissed, setDismissed] = useState(
        () => localStorage.getItem(DISMISSED_KEY) === "true"
    );

    const { data: productsData, isLoading: isLoadingProducts } = useList({
        resource: "product-models",
        pagination: { pageSize: 1 },
    });

    const { data: locationsData, isLoading: isLoadingLocations } = useList({
        resource: "locations",
        pagination: { pageSize: 1 },
    });

    const { data: movementsData, isLoading: isLoadingMovements } = useList({
        resource: "movements",
        pagination: { pageSize: 1 },
    });

    // The QR/widget setup step targets the developer-only Widget Generator and
    // needs the key count. Managers (`manage_api_keys=false`) 403 on
    // `GET /api-keys`, so skip the fetch and the step for them (DUAL-TIER-09).
    const { capabilities } = useCapabilities();
    const canManageKeys = capabilities.manage_api_keys;

    const { data: apiKeysData, isLoading: isLoadingApiKeys } = useList({
        resource: "api-keys",
        pagination: { pageSize: 1 },
        queryOptions: { enabled: canManageKeys },
    });

    const isLoading =
        isLoadingProducts ||
        isLoadingLocations ||
        isLoadingMovements ||
        (canManageKeys && isLoadingApiKeys);

    if (dismissed || isLoading) return null;

    const productCount = productsData?.total ?? 0;
    const locationCount = locationsData?.total ?? 0;
    const movementCount = movementsData?.total ?? 0;
    const apiKeyCount = apiKeysData?.total ?? 0;

    // Only show when user has < 3 products or < 1 movement
    const shouldShow = productCount < 3 || movementCount < 1;
    if (!shouldShow) return null;

    const steps: Step[] = [
        {
            labelKey: "createFirstProduct",
            href: "/products/create",
            isComplete: productCount > 0,
        },
        {
            labelKey: "addWarehouseLocation",
            href: "/locations/create",
            isComplete: locationCount > 1,
        },
        {
            labelKey: "recordFirstMovement",
            href: "/movements/create",
            isComplete: movementCount > 0,
        },
        // Widget Generator is developer-only; managers never see this step.
        ...(canManageKeys
            ? [
                  {
                      labelKey: "setupQrWidget",
                      href: "/widget-generator",
                      isComplete: apiKeyCount > 1,
                  },
              ]
            : []),
    ];

    const completedCount = steps.filter((s) => s.isComplete).length;
    const progress = (completedCount / steps.length) * 100;

    const handleDismiss = () => {
        localStorage.setItem(DISMISSED_KEY, "true");
        setDismissed(true);
    };

    return (
        <div className="mb-6 rounded-xl bg-indigo-500/10 border border-indigo-500/20 p-5">
            {/* Progress bar */}
            <div className="h-1.5 w-full rounded-full bg-zinc-800 mb-4">
                <div
                    className="h-full rounded-full bg-indigo-500 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h2 className="text-sm font-semibold text-zinc-100">
                        {t("gettingStarted")}
                    </h2>
                    <p className="text-xs text-zinc-400 mt-0.5">
                        {t("gettingStartedProgress", {
                            completed: completedCount,
                            total: steps.length,
                        })}
                    </p>
                </div>
                <button
                    onClick={handleDismiss}
                    className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"
                    aria-label={t("dismiss")}
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            {/* Steps */}
            <ul className="space-y-2">
                {steps.map((step) => (
                    <li key={step.labelKey}>
                        <button
                            onClick={() => navigate(step.href)}
                            className={`flex items-center gap-2.5 w-full text-left text-sm transition-colors ${
                                step.isComplete
                                    ? "text-zinc-500 line-through opacity-60"
                                    : "text-zinc-200 hover:text-indigo-300"
                            }`}
                        >
                            {step.isComplete ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            ) : (
                                <Circle className="w-4 h-4 text-zinc-500 shrink-0" />
                            )}
                            {t(step.labelKey)}
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
};
