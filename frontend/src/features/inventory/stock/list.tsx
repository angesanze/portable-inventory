import { useState } from "react";
import { Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Button } from "../../../components/ui/Button";
import { TabButton } from "./TabButton";
import { AllProductsTab } from "./AllProductsTab";
import { IndividualItemsTab } from "./IndividualItemsTab";

// ── Main Export ─────────────────────────────────────────────────────────

export const PhysicalProductList = () => {
    const { t } = useTranslation(["inventory", "common"]);
    const [activeTab, setActiveTab] = useState<"all" | "items">("all");

    return (
        <div>
            <PageHeader
                title={t("stock.title")}
                subtitle={t("stock.subtitle")}
                actions={
                    <Link to="/stock/create">
                        <Button variant="primary" icon={Plus}>
                            {t("stock.registerItem")}
                        </Button>
                    </Link>
                }
            />

            {/* Tab switcher */}
            <div className="flex items-center gap-2 mb-6">
                <TabButton active={activeTab === "all"} onClick={() => setActiveTab("all")}>
                    {t("stock.allProducts")}
                </TabButton>
                <TabButton active={activeTab === "items"} onClick={() => setActiveTab("items")}>
                    {t("stock.individualItems")}
                </TabButton>
            </div>

            {activeTab === "all" ? <AllProductsTab /> : <IndividualItemsTab />}
        </div>
    );
};
