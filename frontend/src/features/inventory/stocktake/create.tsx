import { useEffect, useState } from "react";
import { useList, useCustomMutation } from "@refinedev/core";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ClipboardCheck } from "lucide-react";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Select } from "../../../components/ui/Select";
import { Textarea } from "../../../components/ui/Input";
import { useToast } from "../../../components/ui/Toast";
import { FormErrorBanner } from "../../../components/ui/ErrorState";
import { API_URL } from "../../../config";
import type { StocktakeLocationRow, CreateSessionResponse } from "./types";

export const StocktakeCreate = () => {
    const { t } = useTranslation(["stocktake", "common"]);
    const navigate = useNavigate();
    const { toast } = useToast();

    const { data: locationsData } = useList<StocktakeLocationRow>({
        resource: "locations",
        pagination: { mode: "off" },
    });
    const realLocations = (locationsData?.data || []).filter(
        (l) => l.type === "WAREHOUSE" || l.type === "STORE",
    );
    const locationOptions = realLocations.map((l) => ({
        value: l.id,
        label: l.name,
        description: l.type,
    }));

    const [locationId, setLocationId] = useState("");
    const [notes, setNotes] = useState("");
    const [error, setError] = useState<unknown>(null);

    useEffect(() => {
        if (realLocations.length === 1 && !locationId) {
            // Auto-select the sole location once the fetched list resolves.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setLocationId(String(realLocations[0].id));
        }
    }, [realLocations.length]); // eslint-disable-line react-hooks/exhaustive-deps

    const { mutateAsync: postAction, isLoading } = useCustomMutation<CreateSessionResponse>();

    const handleOpen = async () => {
        setError(null);
        if (!locationId) {
            toast({ message: t("create.locationRequired"), variant: "error" });
            return;
        }
        try {
            const res = await postAction({
                url: `${API_URL}/api/v1/count-sessions/`,
                method: "post",
                values: { location_id: locationId, notes },
                successNotification: false,
                errorNotification: false,
            });
            toast({ message: t("create.openSuccess"), variant: "success" });
            const newId = res?.data?.id;
            navigate(newId ? `/stocktake/${newId}` : "/stocktake");
        } catch (err) {
            setError(err);
            toast({ message: t("create.openFailed"), variant: "error" });
        }
    };

    return (
        <div className="max-w-xl">
            <div className="flex items-center gap-3 mb-5">
                <button
                    onClick={() => navigate("/stocktake")}
                    className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg"
                    aria-label={t("common:back")}
                >
                    <ArrowLeft size={18} />
                </button>
                <h1 className="text-lg text-zinc-100">{t("create.title")}</h1>
            </div>

            {!!error && (
                <div className="mb-4">
                    <FormErrorBanner title={t("create.openFailed")} error={error} />
                </div>
            )}

            <Card>
                <p className="text-xs text-zinc-400 mb-4">{t("create.desc")}</p>
                <Select
                    custom
                    label={t("create.location")}
                    value={locationId}
                    onChange={(val) => setLocationId(String(val))}
                    options={locationOptions}
                    placeholder={t("create.locationPlaceholder")}
                    required
                />
                <div className="mt-3">
                    <Textarea
                        label={t("create.notes")}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder={t("create.notesPlaceholder")}
                    />
                </div>
                <div className="mt-4">
                    <Button
                        variant="primary"
                        icon={ClipboardCheck}
                        disabled={!locationId || isLoading}
                        onClick={handleOpen}
                        data-testid="open-session-button"
                    >
                        {t("create.openAction")}
                    </Button>
                </div>
            </Card>
        </div>
    );
};
