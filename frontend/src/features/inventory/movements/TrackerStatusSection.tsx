import { FormSection } from "../../../components/ui/FormSection";
import { Input } from "../../../components/ui/Input";
import { StatusPicker } from "../../widget/components/engines/StatusPicker";
import type { MovementCreateViewModel } from "./useMovementCreate";

/** Section 4c: status-change controls for engine-driven (tracker) products. */
export const TrackerStatusSection = ({ vm }: { vm: MovementCreateViewModel }) => {
    const {
        t,
        currentTrackerStatus,
        noTransitionsAvailable,
        allowedTrackerTargets,
        newStatus,
        setNewStatus,
        trackerNotes,
        setTrackerNotes,
    } = vm;

    return (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
            <FormSection title={t("movements.statusChangeMode")}>
                {currentTrackerStatus && (
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-zinc-500">
                            {t("movements.currentStatusLabel")}:
                        </span>
                        <span className="inline-flex items-center rounded-md bg-indigo-500/10 px-3 py-1.5 text-sm font-medium text-indigo-300 ring-1 ring-indigo-500/20">
                            {currentTrackerStatus}
                        </span>
                    </div>
                )}
                {noTransitionsAvailable ? (
                    <p className="text-sm text-zinc-400">
                        {t("movements.noTransitionsAvailable", {
                            status: currentTrackerStatus,
                        })}
                    </p>
                ) : (
                    <>
                        <StatusPicker
                            label={t("movements.newStatusLabel")}
                            statuses={allowedTrackerTargets}
                            value={newStatus}
                            onChange={setNewStatus}
                        />
                        <Input
                            label={t("movements.statusChangeNotes")}
                            value={trackerNotes}
                            onChange={(e) => setTrackerNotes(e.target.value)}
                            placeholder={t("movements.reasonPlaceholderInbound")}
                            helperText={t("movements.reasonHelper")}
                        />
                    </>
                )}
            </FormSection>
        </div>
    );
};
