import { FormSection } from "../../../components/ui/FormSection";
import { Select } from "../../../components/ui/Select";
import type { MovementCreateViewModel } from "./useMovementCreate";

/** Section 1: product model selection (+ inline-create hint when none exist). */
export const ProductSection = ({ vm }: { vm: MovementCreateViewModel }) => {
    const {
        t,
        productId,
        setProductId,
        setIdentifier,
        setBatchIdentifier,
        productOptions,
        productsData,
        products,
        saveAndNavigate,
        returnTo,
    } = vm;

    return (
        <FormSection
            title={t("movements.product")}
            description={t("movements.productSectionDesc")}
        >
            <Select
                custom
                label={t("movements.productModel")}
                value={productId}
                onChange={(val) => {
                    setProductId(String(val));
                    setIdentifier("");
                    setBatchIdentifier("");
                }}
                options={productOptions}
                placeholder={t("movements.selectProductPlaceholder")}
                required
            />
            {productsData && products.length === 0 && (
                <p className="text-xs text-zinc-500">
                    {t("movements.noProductsPrefix")}
                    <button
                        type="button"
                        onClick={() => saveAndNavigate(`/products/create?returnTo=${returnTo}`)}
                        className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
                    >
                        {t("movements.noProductsLink")}
                    </button>
                </p>
            )}
        </FormSection>
    );
};
