import { useTranslation } from "react-i18next";
import { Package } from "lucide-react";
import { Card } from "../../../../components/ui/Card";
import type { KitComponent } from "./types";

/** "Components" card: bill-of-materials for assembled/kit models. */
export function ComponentsCard({ components }: { components: KitComponent[] }) {
    const { t } = useTranslation("products");
    return (
        <Card
            header={
                <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                    <Package size={16} className="text-indigo-400" />
                    {t("components")}
                </h3>
            }
        >
            <div className="space-y-2">
                {components.map((comp, idx) => (
                    <div
                        key={idx}
                        className="flex items-center justify-between p-3 bg-white/5 rounded-lg"
                    >
                        <span className="text-sm text-zinc-200">
                            {comp.child_name || comp.child}
                        </span>
                        <span className="font-mono text-indigo-400 font-bold text-sm">
                            x
                            {Number(comp.quantity).toLocaleString()}
                        </span>
                    </div>
                ))}
            </div>
        </Card>
    );
}
