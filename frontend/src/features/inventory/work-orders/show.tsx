import { DetailPage } from "../../../components/ui/DetailPage";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { useWorkOrderShow } from "./useWorkOrderShow";
import { statusVariant } from "./workOrderStatus";
import { WorkOrderActions } from "./WorkOrderActions";
import { WorkOrderDetails } from "./WorkOrderDetails";
import { WorkOrderLineItems } from "./WorkOrderLineItems";
import { WorkOrderMovements } from "./WorkOrderMovements";
import { AddModelModal } from "./AddModelModal";

export const WorkOrderShow = () => {
    const {
        t,
        id,
        navigate,
        order,
        isLoading,
        isUpdating,
        contents,
        isLoadingContents,
        movements,
        isLoadingMovements,
        dialogProps,
        isAddModalOpen,
        setIsAddModalOpen,
        selectedModelId,
        setSelectedModelId,
        selectedPhysicalProductId,
        setSelectedPhysicalProductId,
        addQuantity,
        setAddQuantity,
        isIndividual,
        modelOptions,
        physicalProductOptions,
        handleDelete,
        handleStatusChange,
        handleAdjustment,
        handleFulfill,
        handleAddModel,
    } = useWorkOrderShow();

    if (!order && !isLoading) {
        return (
            <div className="p-8 text-center text-zinc-500">
                {t("workOrders.notFound")}
            </div>
        );
    }

    return (
        <>
            <DetailPage
                title={order?.name ?? ""}
                subtitle={order?.description || undefined}
                badges={
                    order?.status
                        ? [
                              {
                                  label: order.status,
                                  variant: statusVariant(order.status),
                                  dot: true,
                              },
                          ]
                        : []
                }
                actions={
                    <WorkOrderActions
                        t={t}
                        order={order}
                        id={id}
                        isUpdating={isUpdating}
                        navigate={navigate}
                        onFulfill={handleFulfill}
                        onStatusChange={handleStatusChange}
                        onDelete={handleDelete}
                    />
                }
                isLoading={isLoading}
            >
                <WorkOrderDetails t={t} order={order} />

                <WorkOrderLineItems
                    t={t}
                    order={order}
                    contents={contents}
                    isLoadingContents={isLoadingContents}
                    isUpdating={isUpdating}
                    onAddClick={() => setIsAddModalOpen(true)}
                    onAdjustment={handleAdjustment}
                />

                <WorkOrderMovements
                    t={t}
                    movements={movements}
                    isLoadingMovements={isLoadingMovements}
                />
            </DetailPage>

            <ConfirmDialog {...dialogProps} />

            <AddModelModal
                t={t}
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                modelOptions={modelOptions}
                physicalProductOptions={physicalProductOptions}
                selectedModelId={selectedModelId}
                onSelectModel={(val) => setSelectedModelId(val)}
                selectedPhysicalProductId={selectedPhysicalProductId}
                onSelectPhysicalProduct={(val) =>
                    setSelectedPhysicalProductId(val)
                }
                addQuantity={addQuantity}
                onChangeQuantity={(val) => setAddQuantity(val)}
                isIndividual={isIndividual}
                isUpdating={isUpdating}
                onSubmit={handleAddModel}
            />
        </>
    );
};
