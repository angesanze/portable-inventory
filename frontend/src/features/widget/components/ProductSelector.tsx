import React from 'react';
import { Select, type SelectOption } from '../../../components/ui/Select';
import { PROFILE_METADATA } from '../../../types/api';
import type { Product } from '../types';

interface ProductSelectorProps {
    products: Product[];
    selectedProduct: string;
    productLocked: boolean;
    onProductChange: (id: string) => void;
    activeProduct: Product | undefined;
}

export const ProductSelector: React.FC<ProductSelectorProps> = ({
    products,
    selectedProduct,
    productLocked,
    onProductChange,
    activeProduct,
}) => {
    const standard = products.filter(p => {
        const meta = p.profile ? PROFILE_METADATA[p.profile] : null;
        return meta ? (!meta.supportsBatches && p.profile !== 'ASSEMBLED') : (p.engine_type !== 'batch_manager' && p.engine_type !== 'bucket');
    });
    const batch = products.filter(p => {
        const meta = p.profile ? PROFILE_METADATA[p.profile] : null;
        return meta ? meta.supportsBatches : p.engine_type === 'bucket';
    });
    const assembled = products.filter(p => {
        return p.profile === 'ASSEMBLED' || (!p.profile && p.engine_type === 'batch_manager');
    });

    const profileLabel = (p: Product) => {
        if (p.profile) {
            const meta = PROFILE_METADATA[p.profile];
            return meta ? ` [${meta.label}]` : '';
        }
        return '';
    };

    // Flatten the native <optgroup> groups into a single options array. The group
    // meaning (📦 Products / 📋 Batch-Lots / 🏭 Work Orders) is preserved via each
    // option's `description`, since <Select custom> does not support <optgroup>.
    const productOptions: SelectOption[] = [
        ...standard.map(p => ({
            value: String(p.id),
            label: `${p.name}${profileLabel(p)}`,
            description: '📦 Products',
        })),
        ...batch.map(p => ({
            value: String(p.id),
            label: `${p.name}${profileLabel(p)}`,
            description: '📋 Batch / Lots',
        })),
        ...assembled.map(p => ({
            value: String(p.id),
            label: p.name,
            description: '🏭 Work Orders',
        })),
    ];

    const showOnHand = activeProduct
        && activeProduct.profile !== 'BATCH_TRACKED'
        && activeProduct.profile !== 'PERISHABLE'
        && activeProduct.tracking_mode !== 'BATCH';

    return (
        <div className="mb-6">
            <label className="pi-label">Product</label>
            <Select
                custom
                value={selectedProduct}
                disabled={productLocked}
                onChange={val => onProductChange(String(val))}
                options={productOptions}
                placeholder="Select Item..."
            />
            {activeProduct && (
                <>
                    <div className="mt-2 flex justify-between items-center text-sm px-1" style={{ color: 'var(--pi-muted, #a1a1aa)' }}>
                        <span>SKU: <span className="font-mono" style={{ color: 'var(--pi-text, #f4f4f5)' }}>{activeProduct.sku}</span></span>
                    </div>
                    {showOnHand && (
                        <div
                            className="mt-3 flex items-baseline justify-between px-4 py-3 rounded-xl"
                            style={{
                                backgroundColor: 'color-mix(in srgb, var(--pi-primary, #6366f1) 10%, transparent)',
                                border: '1px solid color-mix(in srgb, var(--pi-primary, #6366f1) 25%, transparent)',
                            }}
                        >
                            <span
                                className="text-xs font-bold uppercase tracking-widest"
                                style={{ color: 'var(--pi-primary, #6366f1)' }}
                            >
                                On Hand
                            </span>
                            <span
                                className="font-extrabold tabular-nums"
                                style={{ fontSize: '1.75rem', lineHeight: 1, color: 'var(--pi-primary, #6366f1)' }}
                            >
                                {activeProduct.quantity ?? 'N/A'}
                                {activeProduct.unit ? ` ${activeProduct.unit}` : ''}
                            </span>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};
