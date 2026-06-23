
import { useForm } from "@refinedev/core";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Save, Loader } from "lucide-react";

export const ProductPolyEdit = () => {
    const { t } = useTranslation(["products", "common"]);
    const navigate = useNavigate();
    const { id } = useParams();

    const { onFinish, queryResult, mutationResult, formLoading } = useForm({
        action: "edit",
        resource: "products-poly",
        id: id,
        redirect: "list"
    });

    const record = queryResult?.data?.data;
    const isLoading = mutationResult.isLoading || formLoading;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const formData = new FormData(e.target as HTMLFormElement);
        const rawData = Object.fromEntries(formData.entries());

        // Clean data: filter out empty strings
        const data: Record<string, FormDataEntryValue> = {};
        for (const [key, value] of Object.entries(rawData)) {
            if (value !== '') {
                data[key] = value;
            }
        }

        await onFinish(data);
    };

    if (formLoading) {
        return (
            <div className="flex items-center justify-center h-screen text-zinc-500 gap-3">
                <Loader className="animate-spin" /> {t("products:poly.loadingDetails")}
            </div>
        );
    }

    return (
        <div className="p-6 max-w-2xl mx-auto">
            <div className="flex items-center gap-4 mb-8">
                <button
                    onClick={() => navigate(-1)}
                    className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors"
                >
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">{t("products:poly.editTitle")}</h1>
                    <div className="text-sm text-zinc-500 font-mono mt-1">{String(record?.id || "").slice(0, 8)}</div>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="bg-zinc-900 border border-white/[0.06] rounded-xl p-8 shadow-lg space-y-6">
                <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">
                        {t("products:poly.instanceName")} <span className="text-red-400">*</span>
                    </label>
                    <input
                        name="name"
                        defaultValue={record?.name}
                        required
                        type="text"
                        className="w-full bg-zinc-950 border border-white/[0.06] rounded-lg px-4 py-3 text-white focus-visible:ring-2 focus-visible:ring-emerald-500 outline-none"
                        placeholder={t("products:poly.instanceNamePlaceholder")}
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">
                        {t("products:productModelFallback")}
                    </label>
                    <div className="px-4 py-3 bg-zinc-800 border border-white/5 rounded-lg text-zinc-400 font-medium">
                        {record?.product_model_name || record?.product_model?.name || t("products:poly.unknownModel")}
                    </div>
                    <p className="mt-1 text-xs text-zinc-600 italic">{t("products:poly.modelLocked")}</p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">
                        {t("products:poly.engineType")}
                    </label>
                    <div className="px-4 py-3 bg-zinc-800 border border-white/5 rounded-lg">
                        <span className="px-2 py-1 rounded text-xs font-bold uppercase bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                            {record?.engine_type || "N/A"}
                        </span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-600 italic">{t("products:poly.engineLocked")}</p>
                </div>

                <div className="pt-6 border-t border-white/5 flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={() => navigate(-1)}
                        className="px-6 py-2 rounded-lg font-medium text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                    >
                        {t("common:cancel")}
                    </button>
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="flex items-center gap-2 px-8 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-bold shadow-lg shadow-emerald-900/20 transition-all duration-150 active:scale-95"
                    >
                        {isLoading ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <Save size={18} />
                        )}
                        {t("products:poly.saveChanges")}
                    </button>
                </div>
            </form>
        </div>
    );
};
