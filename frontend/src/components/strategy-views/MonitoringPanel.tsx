import { AlertTriangle, Info, XCircle } from "lucide-react";
import { useList } from "@refinedev/core";

/** Event-log row fields rendered by the active-alerts panel. */
interface EventLogRow {
    id: string | number;
    severity?: string;
    message?: string;
    created_at?: string;
}

export const MonitoringPanel = ({ productId }: { productId: string }) => {
    // Fetch events for this product (assuming we have an events resource)
    // For now we simulate or assume the related data is fetched via product expand, 
    // but a separate useList is safer for live updates

    // NOTE: We need to register 'event-logs' in App.tsx resource list for this to work, 
    // or use specific API call. For now, let's assume we pass events as props or mock.

    const { data } = useList<EventLogRow>({
        resource: "event-logs",
        filters: [
            { field: "product", operator: "eq", value: productId },
            { field: "status", operator: "eq", value: "OPEN" }
        ],
        liveMode: "auto"
    });
    const listData = data?.data;
    const events: EventLogRow[] = Array.isArray(listData) ? listData : [];

    if (events.length === 0) return null;

    const getIcon = (severity: string | undefined) => {
        switch (severity) {
            case 'CRITICAL': return <XCircle className="text-red-500" />;
            case 'WARNING': return <AlertTriangle className="text-orange-500" />;
            default: return <Info className="text-blue-500" />;
        }
    };

    return (
        <div className="bg-zinc-900/50 border border-white/[0.06] rounded-xl overflow-hidden mb-6 animate-fadeIn">
            <div className="px-6 py-3 bg-white/5 border-b border-white/5 flex items-center justify-between">
                <h4 className="text-sm font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                    <AlertTriangle size={14} /> Active Alerts
                </h4>
                <span className="text-xs bg-red-500/20 text-red-300 px-2 py-0.5 rounded-full border border-red-500/20">
                    {events.length} Issues
                </span>
            </div>
            <div className="divide-y divide-white/5">
                {events.map((evt) => (
                    <div key={evt.id} className="p-4 flex items-start gap-4 hover:bg-white/5 transition-colors">
                        <div className="mt-1">{getIcon(evt.severity)}</div>
                        <div>
                            <p className="text-zinc-200 text-sm">{evt.message}</p>
                            <p className="text-xs text-zinc-500 mt-1">{evt.created_at}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
