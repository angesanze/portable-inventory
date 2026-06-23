import { useTranslation } from "react-i18next";
import { Card } from "../../../../components/ui/Card";
import { KeyValueGrid } from "../../../../components/ui/KeyValueGrid";
import type { ProductModelDetail } from "./types";

/** Top "Details" card: core product-model metadata as a key/value grid. */
export function DetailsCard({
    model,
    profileLabel,
    profileDescription,
}: {
    model: ProductModelDetail | undefined;
    profileLabel: string;
    profileDescription: string | undefined;
}) {
    const { t } = useTranslation(["products", "common"]);
    return (
        <Card
            header={
                <h3 className="text-sm font-semibold text-zinc-200">
                    {t("products:details")}
                </h3>
            }
        >
            <KeyValueGrid
                items={[
                    { label: t("common:name"), value: model?.name },
                    { label: t("products:sku"), value: model?.sku },
                    {
                        label: t("common:description"),
                        value: model?.description,
                        span: 3,
                    },
                    { label: t("products:profileColumn"), value: profileLabel },
                    {
                        label: t("products:profileType"),
                        value: profileDescription,
                        span: 2,
                    },
                    {
                        label: t("common:created"),
                        value: model?.created_at
                            ? new Date(model.created_at).toLocaleString()
                            : undefined,
                    },
                    {
                        label: t("common:updated"),
                        value: model?.updated_at
                            ? new Date(model.updated_at).toLocaleString()
                            : undefined,
                    },
                ]}
            />
        </Card>
    );
}
