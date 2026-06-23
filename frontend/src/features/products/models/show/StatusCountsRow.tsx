import { Badge } from "../../../../components/ui/Badge";
import { itemStatusVariant } from "../../../../utils/inventoryBadges";

/** Per-status count chips for SERIALIZED (individual) stock. */
export function StatusCountsRow({ counts }: { counts: Record<string, number> }) {
    const entries = Object.entries(counts).filter(([, n]) => Number(n) > 0);
    if (entries.length === 0) return null;
    return (
        <div
            className="flex flex-wrap items-center gap-2"
            data-testid="status-counts-row"
        >
            {entries.map(([status, count]) => (
                <span
                    key={status}
                    data-testid={`status-count-${status}`}
                    className="inline-flex items-center gap-1 text-xs"
                >
                    <Badge variant={itemStatusVariant(status)} dot>
                        {status}
                    </Badge>
                    <span className="font-mono text-zinc-300">{count}</span>
                </span>
            ))}
        </div>
    );
}
