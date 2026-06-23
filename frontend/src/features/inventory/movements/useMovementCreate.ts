import { useForm, useList, useCustom } from "@refinedev/core";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { API_URL } from "../../../config";
import { useFormDraft } from "../../../hooks/useFormDraft";
import { PROFILE_METADATA } from "../../../types/api";
import type { SelectOption } from "../../../components/ui/Select";
import {
    VENDOR_ALIASES,
    type MovementDraft,
    type MovementLocation,
    type MovementPayload,
    type MovementPhysicalProduct,
    type MovementProduct,
    type MovementSupplier,
    type StockLevelResponse,
    type TrackerPayload,
} from "./movementTypes";

/**
 * All state, derived data, effects and submit logic for the movement-creation
 * form. The page component (`create.tsx`) is a thin composition over the
 * view-model this hook returns; the per-profile section components consume slices
 * of it. Behaviour is identical to the original monolithic component.
 */
export const useMovementCreate = () => {
    const navigate = useNavigate();
    const routerLocation = useLocation();
    const returnTo = encodeURIComponent(routerLocation.pathname + routerLocation.search);
    const { t } = useTranslation(["inventory", "common"]);

    const DIRECTION_OPTIONS: SelectOption[] = [
        {
            value: "inbound",
            label: t("movements.inbound"),
            description: t("movements.inboundOptionDesc"),
        },
        {
            value: "outbound",
            label: t("movements.outbound"),
            description: t("movements.outboundOptionDesc"),
        },
    ];
    const [searchParams] = useSearchParams();
    const urlDirection = searchParams.get("direction");
    const isPreselected = urlDirection === "inbound" || urlDirection === "outbound";

    // An inline-create form returns with ?created_supplier=<id> / ?created_location=<id>
    // (CLEANUP-05). Preselect the matching field, then strip the param below.
    const createdSupplier = searchParams.get("created_supplier");
    const createdLocation = searchParams.get("created_location");

    // Restore an in-progress draft snapshotted before an inline-create jump
    // (CLEANUP-05). Caller seeds useState from `restored`; URL direction still
    // wins over any drafted direction.
    const { restored, save, clear } = useFormDraft<MovementDraft>("draft:movements:create");

    const [productId, setProductId] = useState(restored?.productId ?? "");
    const [direction, setDirection] = useState(
        isPreselected ? urlDirection : restored?.direction ?? "",
    );
    const [quantity, setQuantity] = useState(restored?.quantity ?? "1");
    const [locationId, setLocationId] = useState(createdLocation ?? restored?.locationId ?? "");
    const [reason, setReason] = useState(restored?.reason ?? "");
    const [supplierId, setSupplierId] = useState(createdSupplier ?? restored?.supplierId ?? "");

    // BATCH fields
    const [batchIdentifier, setBatchIdentifier] = useState(restored?.batchIdentifier ?? "");
    const [batchLotNumber, setBatchLotNumber] = useState(restored?.batchLotNumber ?? "");
    const [batchExpiry, setBatchExpiry] = useState(restored?.batchExpiry ?? "");

    // INDIVIDUAL fields
    const [identifier, setIdentifier] = useState(restored?.identifier ?? "");

    // TRACKER fields (status_change movement)
    const [newStatus, setNewStatus] = useState("");
    const [trackerNotes, setTrackerNotes] = useState("");

    // Drop the one-shot created_* params from the URL once consumed, so a reload
    // or further inline-create round-trip starts clean.
    useEffect(() => {
        if (!createdSupplier && !createdLocation) return;
        const params = new URLSearchParams(searchParams);
        params.delete("created_supplier");
        params.delete("created_location");
        const search = params.toString();
        navigate(
            { pathname: routerLocation.pathname, search: search ? `?${search}` : "" },
            { replace: true },
        );
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Snapshot every field, then jump to an inline-create route. The draft is
    // restored when this component remounts on return.
    const saveAndNavigate = (to: string) => {
        save({
            productId,
            direction,
            quantity,
            locationId,
            reason,
            supplierId,
            batchIdentifier,
            batchLotNumber,
            batchExpiry,
            identifier,
        });
        navigate(to);
    };

    const { onFinish, mutationResult } = useForm({
        action: "create",
        resource: "movements",
        redirect: false,
        onMutationSuccess: () => {
            clear();
            navigate("/movements");
        },
    });

    const { data: productsData } = useList<MovementProduct>({
        resource: "product-models",
        pagination: { mode: "off" },
    });

    const { data: locationsData } = useList<MovementLocation>({
        resource: "locations",
        pagination: { mode: "off" },
    });

    const { data: suppliersData } = useList<MovementSupplier>({
        resource: "suppliers",
        pagination: { mode: "off" },
        filters: [{ field: "is_active", operator: "eq", value: true }],
    });

    const products = productsData?.data || [];
    const locations = locationsData?.data || [];
    const suppliers = suppliersData?.data || [];
    const supplierOptions: SelectOption[] = suppliers.map((s) => ({
        value: s.id,
        label: s.name,
        description: s.vat_number || undefined,
    }));

    const selectedProduct = products.find((p) => p.id === productId);
    const meta = selectedProduct?.profile
        ? PROFILE_METADATA[selectedProduct.profile]
        : null;

    const isBatch = meta?.supportsBatches ?? false;
    const isIndividual = meta?.supportsSerials ?? false;

    const engineConfig = selectedProduct?.engine_ui_config;
    const isTracker =
        !!engineConfig &&
        engineConfig.input_type === "tracker" &&
        !!engineConfig.status_transitions &&
        Object.keys(engineConfig.status_transitions).length > 0;

    // Lookup current status of the PhysicalProduct by identifier match. Endpoint
    // only filters by product_model/status — filter client-side. BROKEN/SOLD
    // items aren't returned (viewset force-filters status=ACTIVE), so a missing
    // result falls back to allowing every top-level transition.
    const { data: physicalForTrackerData } = useList<MovementPhysicalProduct>({
        resource: "physical-products",
        filters: [{ field: "product_model", operator: "eq", value: productId }],
        pagination: { mode: "off" },
        queryOptions: { enabled: isTracker && !!productId && !!identifier },
    });
    const currentTrackerStatus: string | undefined = isTracker
        ? (physicalForTrackerData?.data || []).find(
              (p) => p.identifier === identifier,
          )?.status
        : undefined;
    const trackerTransitions = engineConfig?.status_transitions || {};
    const allowedTrackerTargets: string[] = isTracker
        ? currentTrackerStatus && trackerTransitions[currentTrackerStatus]
            ? trackerTransitions[currentTrackerStatus]
            : Object.keys(trackerTransitions)
        : [];
    const noTransitionsAvailable =
        isTracker &&
        !!currentTrackerStatus &&
        Array.isArray(trackerTransitions[currentTrackerStatus]) &&
        trackerTransitions[currentTrackerStatus].length === 0;

    // Tracker products are non-directional (status change, not inbound/outbound).
    // Ignore any `?direction=` URL hint once the chosen product turns out to be
    // a tracker: clear the state and strip the param so a reload starts clean.
    useEffect(() => {
        if (!isTracker) return;
        // Clear the directional hint once the fetched product proves to be a
        // tracker (status-change, not inbound/outbound).
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (direction) setDirection("");
        if (searchParams.get("direction")) {
            const params = new URLSearchParams(searchParams);
            params.delete("direction");
            const search = params.toString();
            navigate(
                { pathname: routerLocation.pathname, search: search ? `?${search}` : "" },
                { replace: true },
            );
        }
    }, [isTracker]); // eslint-disable-line react-hooks/exhaustive-deps

    const productOptions: SelectOption[] = products.map((p) => ({
        value: p.id,
        label: p.name,
        description: p.sku,
    }));

    // Filter locations: for inbound show real destinations, for outbound show real sources
    const realLocations = locations.filter(
        (l) => l.type === "WAREHOUSE" || l.type === "STORE",
    );

    const locationOptions: SelectOption[] = realLocations.map((l) => ({
        value: l.id,
        label: l.name,
        description: l.type,
    }));

    // The "external" side of a receipt/shipment is the External Vendor virtual
    // location specifically — NOT just any VIRTUAL (e.g. "Inventory Adjustment"),
    // otherwise receipts get mislabeled as adjustments.
    const virtualLocation = locations.find(
        (l) => l.type === "VIRTUAL" && VENDOR_ALIASES.includes(l.name),
    );

    // Auto-select when only one real location exists
    useEffect(() => {
        if (realLocations.length === 1 && !locationId) {
            // Auto-select the sole location once the fetched list resolves.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setLocationId(String(realLocations[0].id));
        }
    }, [realLocations.length]); // eslint-disable-line react-hooks/exhaustive-deps

    const isInbound = direction === "inbound";
    const isOutbound = direction === "outbound";

    // Fetch current stock level for selected product at selected location
    const { data: stockLevelData } = useCustom<StockLevelResponse>({
        url: `${API_URL}/api/v1/stock/${productId}/location/${locationId}`,
        method: "get",
        queryOptions: { enabled: !!productId && !!locationId },
    });
    const currentStock = stockLevelData?.data?.quantity;

    const handleSubmit = async () => {
        if (isTracker) {
            const payload: TrackerPayload = {
                product_id: productId,
                physical_identifier: identifier,
                transaction_type: "status_change",
                new_status: newStatus,
                notes: trackerNotes || undefined,
            };
            await onFinish(payload);
            return;
        }

        const qty = parseFloat(quantity);
        if (isNaN(qty) || qty <= 0) return;

        const payload: MovementPayload = {
            product_id: productId,
            quantity: qty,
            reason: reason || (isInbound ? t("movements.checkIn") : t("movements.checkOut")),
        };

        if (isInbound) {
            // From external/virtual → to selected location
            if (virtualLocation) {
                payload.from_id = virtualLocation.id;
            } else {
                payload.from_location_name = "External Vendor";
            }
            payload.to_id = locationId;
            if (supplierId) {
                payload.supplier_id = supplierId;
            }
        } else {
            // From selected location → to external/virtual
            payload.from_id = locationId;
            if (virtualLocation) {
                payload.to_id = virtualLocation.id;
            } else {
                payload.to_location_name = "External Vendor";
            }
        }

        // BATCH: include batch data
        if (isBatch) {
            const batchData: Record<string, string> = {};
            if (batchIdentifier) batchData.batch_identifier = batchIdentifier;
            if (batchLotNumber) batchData.lot_number = batchLotNumber;
            if (batchExpiry) batchData.expiry_date = batchExpiry;
            if (Object.keys(batchData).length > 0) {
                payload.batch_data = batchData;
            }
        }

        // INDIVIDUAL: include identifier
        if (isIndividual && identifier) {
            payload.physical_identifier = identifier;
        }

        await onFinish(payload);
    };

    const isLoading = mutationResult.isLoading;

    // Direction accent colors
    const directionAccent = isInbound
        ? "border-emerald-500/30"
        : isOutbound
          ? "border-rose-500/30"
          : "";

    const submitLabel = isTracker
        ? t("movements.statusChangeSubmit")
        : isInbound
          ? t("movements.checkIn")
          : isOutbound
            ? t("movements.checkOut")
            : t("common:save");

    // Outbound beyond available stock: backend rejects it anyway, but a
    // disabled submit beats a round-trip ending in an error banner.
    const exceedsAvailableStock =
        isOutbound &&
        !isIndividual &&
        currentStock != null &&
        parseFloat(quantity) > Number(currentStock);

    const submitDisabled = isTracker
        ? noTransitionsAvailable || !(productId && identifier && newStatus)
        : exceedsAvailableStock || (isIndividual && !identifier);

    const onCancel = () => {
        clear();
        navigate("/movements");
    };

    return {
        t,
        navigate,
        returnTo,
        // state + setters
        productId,
        setProductId,
        direction,
        setDirection,
        quantity,
        setQuantity,
        locationId,
        setLocationId,
        reason,
        setReason,
        supplierId,
        setSupplierId,
        batchIdentifier,
        setBatchIdentifier,
        batchLotNumber,
        setBatchLotNumber,
        batchExpiry,
        setBatchExpiry,
        identifier,
        setIdentifier,
        newStatus,
        setNewStatus,
        trackerNotes,
        setTrackerNotes,
        // data + options
        productsData,
        products,
        productOptions,
        suppliersData,
        suppliers,
        supplierOptions,
        locationOptions,
        realLocations,
        DIRECTION_OPTIONS,
        // derived flags
        isPreselected,
        isBatch,
        isIndividual,
        isTracker,
        isInbound,
        isOutbound,
        currentStock,
        currentTrackerStatus,
        allowedTrackerTargets,
        noTransitionsAvailable,
        directionAccent,
        // submit
        handleSubmit,
        saveAndNavigate,
        onCancel,
        submitLabel,
        submitDisabled,
        isLoading,
        mutationResult,
    };
};

export type MovementCreateViewModel = ReturnType<typeof useMovementCreate>;
