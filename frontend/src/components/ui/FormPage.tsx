import React from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { Button } from "./Button";

interface FormPageProps {
    title: string;
    onSubmit: (e: React.FormEvent) => void;
    onCancel?: () => void;
    isLoading?: boolean;
    submitDisabled?: boolean;
    submitLabel?: string;
    children: React.ReactNode;
}

export const FormPage: React.FC<FormPageProps> = ({
    title,
    onSubmit,
    onCancel,
    isLoading = false,
    submitDisabled = false,
    submitLabel,
    children,
}) => {
    const navigate = useNavigate();
    const { t } = useTranslation("common");

    const handleCancel = () => {
        if (onCancel) {
            onCancel();
        } else {
            navigate(-1);
        }
    };

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                onSubmit(e);
            }}
            className="max-w-2xl mx-auto pb-24"
        >
            {/* Header */}
            <div className="mb-6">
                <button
                    type="button"
                    onClick={handleCancel}
                    className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors mb-4"
                >
                    <ArrowLeft size={16} />
                    {t("back")}
                </button>
                <h1 className="text-2xl font-semibold text-zinc-50">{title}</h1>
            </div>

            {/* Form sections */}
            <div className="flex flex-col gap-6">{children}</div>

            {/* Sticky footer */}
            <div className="fixed bottom-0 left-0 right-0 border-t border-white/[0.06] bg-zinc-950/80 backdrop-blur-sm z-10">
                <div className="max-w-2xl mx-auto flex justify-end gap-3 px-4 py-3">
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={handleCancel}
                    >
                        {t("cancel")}
                    </Button>
                    <Button type="submit" loading={isLoading} disabled={submitDisabled}>
                        {submitLabel ?? t("save")}
                    </Button>
                </div>
            </div>
        </form>
    );
};
