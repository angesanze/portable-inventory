import React from "react";

export interface KeyValueItem {
    label: string;
    value: React.ReactNode;
    span?: number;
}

interface KeyValueGridProps {
    items: KeyValueItem[];
}

export const KeyValueGrid: React.FC<KeyValueGridProps> = ({ items }) => {
    return (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-4">
            {items.map((item, i) => (
                <div
                    key={i}
                    className={
                        item.span && item.span > 1
                            ? `col-span-${item.span}`
                            : undefined
                    }
                >
                    <dt className="text-sm text-zinc-500">{item.label}</dt>
                    <dd className="text-sm text-zinc-200 font-medium mt-0.5">
                        {item.value ?? "—"}
                    </dd>
                </div>
            ))}
        </div>
    );
};
