import { useTranslation } from "react-i18next";
import { Edit2, Trash2 } from "lucide-react";
import { profileVariant } from "../../../utils/inventoryBadges";
import { Button } from "../../../components/ui/Button";
import { DetailPage } from "../../../components/ui/DetailPage";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { useProductModelShow } from "./show/useProductModelShow";
import { DetailsCard } from "./show/DetailsCard";
import { DimensionalConfigCard } from "./show/DimensionalConfigCard";
import { InventoryPanel } from "./show/InventoryPanel";
import { MovementsList } from "./show/MovementsList";
import { ComponentsCard } from "./show/ComponentsCard";

export const ProductModelShow = () => {
    const { t } = useTranslation(["products", "common"]);
    const {
        id,
        navigate,
        model,
        stock,
        movements,
        isLoading,
        isLoadingStock,
        isLoadingMovements,
        notFound,
        profileMeta,
        profileLabel,
        handleDelete,
        dialogProps,
    } = useProductModelShow();

    if (notFound) {
        return (
            <div className="p-8 text-center text-zinc-500">
                {t("products:productModelNotFound")}
            </div>
        );
    }

    return (
        <>
            <DetailPage
                title={model?.name ?? ""}
                subtitle={model?.sku}
                badges={[
                    {
                        label: profileLabel,
                        variant: profileVariant(model?.profile),
                    },
                ]}
                actions={
                    <>
                        <Button
                            variant="secondary"
                            icon={Edit2}
                            onClick={() => navigate(`/products/edit/${id}`)}
                        >
                            {t("common:edit")}
                        </Button>
                        <Button
                            variant="danger"
                            icon={Trash2}
                            onClick={handleDelete}
                        >
                            {t("common:delete")}
                        </Button>
                    </>
                }
                isLoading={isLoading}
            >
                {/* Details */}
                <DetailsCard
                    model={model}
                    profileLabel={profileLabel}
                    profileDescription={profileMeta?.description}
                />

                {/* DIMENSIONAL: configured dimensions/unit/formula + computed value */}
                {model?.profile === "DIMENSIONAL" && (
                    <DimensionalConfigCard
                        engineConfig={model?.engine_config}
                        stockTotal={stock?.total}
                    />
                )}

                {/* Current Inventory */}
                <InventoryPanel
                    model={model}
                    stock={stock}
                    isLoadingStock={isLoadingStock}
                    productId={id as string}
                    navigate={navigate}
                />

                {/* Recent Movements */}
                <MovementsList
                    movements={movements}
                    isLoading={isLoadingMovements}
                    productId={id}
                />

                {/* Components / Kit */}
                {model?.components && model.components.length > 0 && (
                    <ComponentsCard components={model.components} />
                )}
            </DetailPage>

            <ConfirmDialog {...dialogProps} />
        </>
    );
};
