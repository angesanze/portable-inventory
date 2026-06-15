import { useState, useEffect } from "react";
import { API_URL } from "../../../config";
import { useSearchParams } from "react-router-dom";
import type { Product, Location, ProductBatch, PhysicalItem } from "../types";

export function useWidgetData(apiKey: string | null, resolvingKey = false) {
    const [searchParams] = useSearchParams();
    const apiUrl = `${API_URL}/api/v1`;

    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState("");
    const [companyName, setCompanyName] = useState("");

    const [locations, setLocations] = useState<Location[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [batches, setBatches] = useState<ProductBatch[]>([]);
    const [availableItems, setAvailableItems] = useState<PhysicalItem[]>([]);

    const [selectedLocation, setSelectedLocation] = useState("");
    const [locationLocked, setLocationLocked] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState("");
    const [productLocked, setProductLocked] = useState(false);

    const [identifier, setIdentifier] = useState("");
    const [identifierLocked, setIdentifierLocked] = useState(false);
    const [selectedBatchId, setSelectedBatchId] = useState("");

    const [batchManagerData, setBatchManagerData] = useState<any>(null);
    const [batchManagerLoading, setBatchManagerLoading] = useState(false);

    // QR Configure
    const [configureMode, setConfigureMode] = useState(false);
    const [qrCode, setQrCode] = useState<string | null>(null);

    const loadInitialData = async () => {
        // Token exchange still in flight — keep the loading state, the
        // effect re-runs once the key resolves.
        if (resolvingKey) return;
        if (!apiKey) {
            setError("Missing API Key");
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const locRes = await fetch(`${apiUrl}/widget/locations/?api_key=${apiKey}`);
            if (!locRes.ok) throw new Error("Failed to load locations");
            const locData = await locRes.json();
            setLocations(locData);

            const prodRes = await fetch(`${apiUrl}/widget/?api_key=${apiKey}`);
            if (!prodRes.ok) throw new Error("Failed to load products");
            const prodData = await prodRes.json();

            let loadedProducts = prodData.products.concat(prodData.poly_products || []);
            setCompanyName(prodData.company);

            const urlIdentifierParam = searchParams.get("identifier")?.trim();
            const urlProductIdParam = searchParams.get("product_id")?.trim();

            if (urlIdentifierParam && urlProductIdParam) {
                loadedProducts = loadedProducts.map((p: any) => p.id === urlProductIdParam ? { ...p, quantity: 1 } : p);
            }
            setProducts(loadedProducts);

            // Handle URL Params Pre-selection
            const productId = urlProductIdParam || searchParams.get("product_id")?.trim();
            const locationId = searchParams.get("location_id")?.trim();

            if (prodData.default_location) {
                setSelectedLocation(prodData.default_location.id);
                setLocationLocked(true);
            } else if (locData.length === 1) {
                setSelectedLocation(locData[0].id);
                setLocationLocked(!!productId);
            }

            if (locationId && locData.find((l: Location) => l.id === locationId)) {
                setSelectedLocation(locationId);
                setLocationLocked(true);
            }

            if (urlIdentifierParam) {
                setIdentifier(urlIdentifierParam);
                setIdentifierLocked(true);
            }

            const isConfigureMode = searchParams.get("configure_mode") === "true";
            const urlQrCode = searchParams.get("qr_code")?.trim();
            if (isConfigureMode && urlQrCode) {
                setConfigureMode(true);
                setQrCode(urlQrCode);
            }

            if (productId && loadedProducts.find((p: any) => p.id === productId)) {
                setSelectedProduct(productId);
                setProductLocked(true);
            }

        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadInitialData();
    }, [apiKey, resolvingKey]);

    const loadProductsForLocation = async (locId: string) => {
        if (!apiKey || !locId) return;
        try {
            const res = await fetch(`${apiUrl}/widget/?api_key=${apiKey}&location_id=${locId}`);
            if (res.ok) {
                const data = await res.json();
                setProducts(data.products.concat(data.poly_products || []));
            }
        } catch (e) {
            console.error("Failed to refresh products", e);
        }
    };

    useEffect(() => {
        if (selectedLocation) {
            loadProductsForLocation(selectedLocation);
        }
    }, [selectedLocation, apiKey]);

    const loadBatches = async (prodId: string, locId: string) => {
        if (!apiKey) return;
        setBatches([]);
        try {
            const res = await fetch(`${apiUrl}/widget/batches/?api_key=${apiKey}&product_id=${prodId}`);
            if (res.ok) {
                const allBatches: any[] = await res.json();
                const urlBatchId = searchParams.get("batch_id")?.trim();
                const relevant = allBatches.filter((b: any) =>
                    (b.id === urlBatchId) ||
                    ((b.product_model === prodId || b.product_model === products.find(p => p.id === prodId)?.sku)
                        && (b.location_id === locId || b.location === locId)
                        && Number(b.quantity) > 0)
                );
                setBatches(relevant);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const loadAvailableItems = async (prodId: string, locId: string) => {
        if (!apiKey) return;
        try {
            const res = await fetch(`${apiUrl}/widget/items/?api_key=${apiKey}&product_id=${prodId}&location_id=${locId}`);
            if (res.ok) {
                setAvailableItems(await res.json());
            }
        } catch (e) {
            console.error(e);
        }
    };

    const loadBatchManagerData = async (productId: string, locId: string = "") => {
        if (!apiKey) return;
        setBatchManagerLoading(true);
        try {
            let url = `${apiUrl}/widget/${productId}/?api_key=${apiKey}`;
            if (locId) url += `&location_id=${locId}`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                const isAssembled = data.profile === 'ASSEMBLED' || data.engine === 'batch_manager';
                setBatchManagerData(isAssembled ? data : null);
            }
        } catch (e) {
            console.error(e);
            setBatchManagerData(null);
        } finally {
            setBatchManagerLoading(false);
        }
    };

    return {
        apiUrl,
        loading,
        setLoading,
        actionLoading,
        setActionLoading,
        error,
        setError,
        companyName,
        locations,
        products,
        batches,
        setBatches,
        availableItems,
        selectedLocation,
        setSelectedLocation,
        locationLocked,
        selectedProduct,
        setSelectedProduct,
        productLocked,
        identifier,
        setIdentifier,
        identifierLocked,
        selectedBatchId,
        setSelectedBatchId,
        batchManagerData,
        batchManagerLoading,
        configureMode,
        qrCode,
        loadBatches,
        loadAvailableItems,
        loadBatchManagerData,
        loadProductsForLocation
    };
}
