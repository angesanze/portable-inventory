import React, { useState } from 'react';
import { Building2, Package, FolderOpen, ClipboardList, ChevronLeft, X } from 'lucide-react';
import type { Location, LocationInventoryItem } from '../types';

interface LocationSelectorProps {
    companyName: string;
    locations: Location[];
    selectedLocation: string;
    onSelect: (locId: string) => void;
    apiUrl: string;
    apiKey: string | null;
}

export const LocationSelector: React.FC<LocationSelectorProps> = ({ companyName, locations, onSelect, apiUrl, apiKey }) => {
    const [currentParentId, setCurrentParentId] = useState<string | null>(null);
    const [isInspectOpen, setIsInspectOpen] = useState(false);
    const [inspectData, setInspectData] = useState<LocationInventoryItem[]>([]);
    const [inspectLoading, setInspectLoading] = useState(false);

    const visibleLocations = locations.filter(l => (l.parent_id || null) === (currentParentId || null));
    const currentParentLocation = locations.find(l => l.id === currentParentId);
    const physicalLocations = visibleLocations.filter(l => ['PHYSICAL', 'WAREHOUSE', 'STORE', 'VIRTUAL'].includes(l.type));

    const handleInspect = async (locId: string) => {
        setIsInspectOpen(true);
        setInspectLoading(true);
        setInspectData([]);
        try {
            const res = await fetch(`${apiUrl}/widget/location_inventory/?location_id=${locId}`, { headers: { "X-Api-Key": apiKey ?? "" } });
            if (res.ok) {
                const data = await res.json();
                setInspectData(data.contents || []);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setInspectLoading(false);
        }
    };

    const renderLocationItem = (loc: Location) => {
        const hasChildren = locations.some(child => child.parent_id === loc.id);
        const isContainer = loc.type === 'CONTAINER';

        return (
            <div key={loc.id} className="flex gap-2">
                <button
                    onClick={() => onSelect(loc.id)}
                    className={`pi-tile flex-1 group ${isContainer ? 'pi-tile-accent' : ''}`}
                >
                    <span className="flex items-center gap-3 min-w-0">
                        <span
                            className="flex items-center justify-center w-10 h-10 rounded-lg flex-shrink-0"
                            style={{
                                backgroundColor: isContainer
                                    ? 'color-mix(in srgb, var(--pi-primary) 18%, transparent)'
                                    : 'rgba(255,255,255,0.06)',
                                color: isContainer ? 'var(--pi-primary, #6366f1)' : 'var(--pi-muted, #a1a1aa)',
                            }}
                        >
                            {isContainer ? <Package className="w-5 h-5" strokeWidth={2} /> : <Building2 className="w-5 h-5" strokeWidth={2} />}
                        </span>
                        <span className="min-w-0">
                            <span className="block font-semibold truncate" style={{ color: 'var(--pi-text, #f4f4f5)' }}>{loc.name}</span>
                            {isContainer && (
                                <span className="block text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--pi-primary, #6366f1)' }}>Container</span>
                            )}
                        </span>
                    </span>
                </button>

                {(hasChildren || !isContainer) && (
                    <button
                        onClick={() => setCurrentParentId(loc.id)}
                        className="pi-hover-tint flex items-center justify-center w-14 rounded-xl border transition-colors"
                        style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderColor: 'var(--pi-border, rgba(255,255,255,0.08))', color: 'var(--pi-muted, #a1a1aa)' }}
                        title="Open Folder"
                        aria-label="Open folder"
                    >
                        <FolderOpen className="w-5 h-5" strokeWidth={2} />
                    </button>
                )}
            </div>
        );
    };

    return (
        <div className="w-full flex flex-col h-full" style={{ backgroundColor: 'var(--pi-bg, #09090b)', color: 'var(--pi-text, #f4f4f5)' }}>
            <div className="max-w-md mx-auto p-4 w-full flex-1 flex flex-col">
                <div className="text-center mb-6 mt-2">
                    <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--pi-text, #f4f4f5)' }}>{companyName}</h1>
                    <p className="text-sm mt-1" style={{ color: 'var(--pi-muted, #a1a1aa)' }}>
                        {currentParentId ? `Inside: ${currentParentLocation?.name}` : "Select Location"}
                    </p>
                </div>

                <div className="flex justify-between items-center mb-4 min-h-[2.25rem]">
                    {currentParentId ? (
                        <button
                            onClick={() => setCurrentParentId(locations.find(l => l.id === currentParentId)?.parent_id || null)}
                            className="flex items-center gap-1 font-semibold transition-colors"
                            style={{ color: 'var(--pi-primary, #6366f1)' }}
                        >
                            <ChevronLeft className="w-4 h-4" strokeWidth={2.5} /> Back up
                        </button>
                    ) : <span />}

                    {currentParentId && (
                        <button
                            onClick={() => currentParentId && handleInspect(currentParentId)}
                            className="pi-hover-tint flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                            style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'var(--pi-muted, #a1a1aa)' }}
                        >
                            <ClipboardList className="w-4 h-4" strokeWidth={2} /> Inspect
                        </button>
                    )}
                </div>

                <div className="space-y-6 flex-1 overflow-y-auto pb-4">
                    <div>
                        <h3 className="text-sm font-semibold uppercase tracking-wider mb-3 px-1" style={{ color: 'var(--pi-muted, #a1a1aa)' }}>
                            Physical Locations
                        </h3>
                        <div className="space-y-2">
                            {physicalLocations.length === 0 && (
                                <div className="text-sm italic px-2" style={{ color: 'var(--pi-muted, #a1a1aa)' }}>None</div>
                            )}
                            {physicalLocations.map(renderLocationItem)}
                        </div>
                    </div>
                </div>

                {/* INSPECT MODAL */}
                {isInspectOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
                        <div className="w-full max-w-md max-h-[80vh] rounded-2xl flex flex-col overflow-hidden animate-slideDown" style={{ backgroundColor: 'var(--pi-surface, #18181b)', border: '1px solid var(--pi-border, rgba(255,255,255,0.08))' }}>
                            <div className="p-4 flex justify-between items-center" style={{ borderBottom: '1px solid var(--pi-border, rgba(255,255,255,0.06))' }}>
                                <h2 className="text-base font-bold" style={{ color: 'var(--pi-text, #f4f4f5)' }}>Contents of {currentParentLocation?.name}</h2>
                                <button onClick={() => setIsInspectOpen(false)} className="pi-hover-tint p-2 rounded-lg transition-colors" style={{ color: 'var(--pi-muted, #a1a1aa)' }} aria-label="Close"><X className="w-5 h-5" strokeWidth={2} /></button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                {inspectLoading && (
                                    <div className="text-center p-6" style={{ color: 'var(--pi-muted, #a1a1aa)' }}>Loading inventory...</div>
                                )}
                                {!inspectLoading && inspectData.length === 0 && (
                                    <div className="text-center p-8 italic rounded-lg" style={{ color: 'var(--pi-muted, #a1a1aa)', backgroundColor: 'rgba(255,255,255,0.04)' }}>
                                        This location is empty.
                                    </div>
                                )}
                                {inspectData.map((item, idx) => (
                                    <div key={idx} className="rounded-xl p-3 flex justify-between items-center" style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid var(--pi-border, rgba(255,255,255,0.06))' }}>
                                        <div>
                                            <div className="font-bold" style={{ color: 'var(--pi-text, #f4f4f5)' }}>{item.product_name}</div>
                                            <div className="text-xs font-mono mt-0.5" style={{ color: 'var(--pi-muted, #a1a1aa)' }}>
                                                {item.sku}
                                                {item.type === 'BATCH' && <span className="ml-2 px-1.5 py-0.5 rounded" style={{ backgroundColor: 'color-mix(in srgb, var(--pi-primary) 15%, transparent)', color: 'var(--pi-primary, #a5b4fc)' }}>BATCH: {item.batch_id}</span>}
                                                {item.type === 'ITEM' && <span className="ml-2 px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(139,92,246,0.15)', color: '#c4b5fd' }}>ID: {item.identifier}</span>}
                                            </div>
                                        </div>
                                        <div className="text-xl font-bold" style={{ color: 'var(--pi-text, #e4e4e7)' }}>{item.quantity}</div>
                                    </div>
                                ))}
                            </div>
                            <div className="p-4" style={{ borderTop: '1px solid var(--pi-border, rgba(255,255,255,0.06))' }}>
                                <button
                                    onClick={() => setIsInspectOpen(false)}
                                    className="pi-btn-ghost w-full"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
