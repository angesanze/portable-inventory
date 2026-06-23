import { useEffect, useState } from "react";
import { useCreate, useUpdate } from "@refinedev/core";
import { useTranslation } from "react-i18next";
import { Modal } from "../../../components/ui/Modal";
import { Button } from "../../../components/ui/Button";
import { Input, Textarea } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { useToast } from "../../../components/ui/Toast";
import type { ChannelKind, NotificationChannel } from "./types";

const EVENT_TYPES = ["THRESHOLD", "DATE_OFFSET"] as const;

interface ChannelFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    /** null = create, otherwise edit */
    channel: NotificationChannel | null;
}

interface FormState {
    name: string;
    kind: ChannelKind;
    recipients: string;
    url: string;
    headersText: string;
    eventFilter: string[];
    isActive: boolean;
}

const EMPTY: FormState = {
    name: "",
    kind: "EMAIL",
    recipients: "",
    url: "",
    headersText: "",
    eventFilter: [],
    isActive: true,
};

function toFormState(channel: NotificationChannel | null): FormState {
    if (!channel) return EMPTY;
    return {
        name: channel.name,
        kind: channel.kind,
        recipients: channel.recipients ?? "",
        url: channel.url ?? "",
        headersText:
            channel.headers && Object.keys(channel.headers).length > 0
                ? JSON.stringify(channel.headers, null, 2)
                : "",
        eventFilter: channel.event_filter ?? [],
        isActive: channel.is_active,
    };
}

export const ChannelFormModal = ({ isOpen, onClose, onSuccess, channel }: ChannelFormModalProps) => {
    const { t } = useTranslation(["settings", "common"]);
    const { toast } = useToast();
    const [form, setForm] = useState<FormState>(EMPTY);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const { mutate: createChannel, isLoading: isCreating } = useCreate();
    const { mutate: updateChannel, isLoading: isUpdating } = useUpdate();
    const isSaving = isCreating || isUpdating;

    // Re-seed the form whenever the modal opens (create vs edit target).
    useEffect(() => {
        if (isOpen) {
            // Prop-sync: hydrate the form from the edit target each time the modal
            // opens; gated on `isOpen` so it runs only on open transitions.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setForm(toFormState(channel));
            setErrors({});
        }
    }, [isOpen, channel]);

    const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
        setForm((prev) => ({ ...prev, [key]: value }));

    const toggleEventType = (type: string) =>
        setForm((prev) => ({
            ...prev,
            eventFilter: prev.eventFilter.includes(type)
                ? prev.eventFilter.filter((x) => x !== type)
                : [...prev.eventFilter, type],
        }));

    const validate = (): Record<string, string> => {
        const next: Record<string, string> = {};
        if (!form.name.trim()) next.name = t("settings:notifications.nameRequired");
        if (form.kind === "EMAIL" && !form.recipients.trim()) {
            next.recipients = t("settings:notifications.recipientsRequired");
        }
        if (form.kind === "WEBHOOK" && !form.url.trim()) {
            next.url = t("settings:notifications.urlRequired");
        }
        if (form.headersText.trim()) {
            try {
                const parsed = JSON.parse(form.headersText);
                if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
                    next.headers = t("settings:notifications.headersError");
                }
            } catch {
                next.headers = t("settings:notifications.headersError");
            }
        }
        return next;
    };

    const handleSubmit = () => {
        const nextErrors = validate();
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0) return;

        const values = {
            name: form.name.trim(),
            kind: form.kind,
            is_active: form.isActive,
            recipients: form.kind === "EMAIL" ? form.recipients.trim() : "",
            url: form.kind === "WEBHOOK" ? form.url.trim() : "",
            headers: form.kind === "WEBHOOK" && form.headersText.trim() ? JSON.parse(form.headersText) : {},
            event_filter: form.eventFilter,
        };

        const callbacks = {
            onSuccess: () => {
                onSuccess();
                onClose();
            },
            onError: () => {
                toast({ message: t("settings:notifications.saveFailed"), variant: "error" as const });
            },
        };

        if (channel) {
            updateChannel({ resource: "notification-channels", id: channel.id, values }, callbacks);
        } else {
            createChannel({ resource: "notification-channels", values }, callbacks);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={channel ? t("settings:notifications.editChannel") : t("settings:notifications.addChannel")}
            footer={
                <>
                    <Button variant="ghost" onClick={onClose} disabled={isSaving}>
                        {t("settings:notifications.cancel")}
                    </Button>
                    <Button variant="primary" onClick={handleSubmit} disabled={isSaving} data-testid="channel-form-save">
                        {t("settings:notifications.save")}
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <Input
                    label={t("settings:notifications.name")}
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                    error={errors.name}
                    data-testid="channel-name-input"
                />

                <Select
                    custom={false}
                    label={t("settings:notifications.kind")}
                    value={form.kind}
                    onChange={(e) => set("kind", e.target.value as ChannelKind)}
                    options={[
                        { value: "EMAIL", label: t("settings:notifications.kindEmail") },
                        { value: "WEBHOOK", label: t("settings:notifications.kindWebhook") },
                    ]}
                    data-testid="channel-kind-select"
                />

                {form.kind === "EMAIL" ? (
                    <Textarea
                        label={t("settings:notifications.recipients")}
                        helperText={t("settings:notifications.recipientsHelp")}
                        value={form.recipients}
                        onChange={(e) => set("recipients", e.target.value)}
                        error={errors.recipients}
                        rows={2}
                        data-testid="channel-recipients-input"
                    />
                ) : (
                    <>
                        <Input
                            label={t("settings:notifications.url")}
                            placeholder="https://example.com/hooks/inventory"
                            value={form.url}
                            onChange={(e) => set("url", e.target.value)}
                            error={errors.url}
                            data-testid="channel-url-input"
                        />
                        {channel?.secret && (
                            <Input
                                label={t("settings:notifications.secret")}
                                helperText={t("settings:notifications.secretHelp")}
                                value={channel.secret}
                                readOnly
                                data-testid="channel-secret-input"
                            />
                        )}
                        <Textarea
                            label={t("settings:notifications.headersLabel")}
                            placeholder='{"Authorization": "Bearer ..."}'
                            value={form.headersText}
                            onChange={(e) => set("headersText", e.target.value)}
                            error={errors.headers}
                            rows={2}
                            data-testid="channel-headers-input"
                        />
                    </>
                )}

                <div>
                    <div className="text-sm font-medium text-zinc-300 mb-1.5">
                        {t("settings:notifications.eventFilter")}
                    </div>
                    <div className="flex flex-col gap-1.5">
                        {EVENT_TYPES.map((type) => (
                            <label key={type} className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={form.eventFilter.includes(type)}
                                    onChange={() => toggleEventType(type)}
                                    className="accent-indigo-500"
                                    data-testid={`channel-filter-${type}`}
                                />
                                {type === "THRESHOLD"
                                    ? t("settings:notifications.filterThreshold")
                                    : t("settings:notifications.filterDateOffset")}
                            </label>
                        ))}
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">{t("settings:notifications.eventFilterHelp")}</p>
                </div>

                <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={form.isActive}
                        onChange={(e) => set("isActive", e.target.checked)}
                        className="accent-indigo-500"
                        data-testid="channel-active-checkbox"
                    />
                    {t("settings:notifications.active")}
                </label>
            </div>
        </Modal>
    );
};
