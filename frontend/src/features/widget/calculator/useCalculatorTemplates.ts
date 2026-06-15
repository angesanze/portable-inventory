import { useState, useCallback } from "react";
import { API_URL } from "../../../config";
import { useToast } from "../../../components/ui/Toast";

export const useCalculatorTemplates = () => {
    const { toast } = useToast();
    const [templates, setTemplates] = useState<any[]>([]);
    const [saving, setSaving] = useState(false);

    const getAuthHeaders = (): HeadersInit => {
        const token = localStorage.getItem("access_token");
        if (token) {
            return {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            };
        }
        return { "Content-Type": "application/json" };
    };

    const loadTemplates = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/api/v1/calculator-templates/?page_size=100`, {
                headers: getAuthHeaders(),
                cache: "no-store"
            });
            if (res.ok) {
                const text = await res.text();
                try {
                    const data = text ? JSON.parse(text) : {};
                    const results = Array.isArray(data) ? data : (data.results || []);
                    setTemplates(results);
                } catch (e) {
                    console.error("Failed to parse templates JSON. Response text preview:", text.substring(0, 100));
                    setTemplates([]);
                }
            } else {
                console.error("Load templates failed:", res.status, res.statusText);
            }
        } catch (e) {
            console.error("Failed to load templates", e);
        }
    }, []);

    const saveTemplate = async (parsed: any) => {
        if (!parsed) return false;
        setSaving(true);
        try {
            const payload = {
                name: parsed.name,
                engine_type: parsed.engine?.type,
                engine_config: parsed.engine?.config
            };

            const res = await fetch(`${API_URL}/api/v1/calculator-templates/`, {
                method: "POST",
                headers: getAuthHeaders(),
                body: JSON.stringify(payload)
            });

            const text = await res.text();
            let data: any = {};
            try {
                data = text ? JSON.parse(text) : {};
            } catch (jsonErr) { }

            if (!res.ok) {
                toast({ message: `Error saving (${res.status}): ` + (JSON.stringify(data) || res.statusText), variant: "error" });
                return false;
            } else {
                toast({ message: "Saved Template!", variant: "success" });
                loadTemplates();
                return true;
            }
        } catch (e: any) {
            console.error("Save Error:", e);
            toast({ message: "Network Error: " + e.message, variant: "error" });
            return false;
        } finally {
            setSaving(false);
        }
    };

    const deleteTemplate = async (id: string) => {
        try {
            const res = await fetch(`${API_URL}/api/v1/calculator-templates/${id}/`, {
                method: "DELETE",
                headers: getAuthHeaders()
            });

            if (res.ok) {
                loadTemplates();
                return true;
            } else {
                toast({ message: "Failed to delete template", variant: "error" });
                return false;
            }
        } catch (e: any) {
            toast({ message: "Network Error: " + e.message, variant: "error" });
            return false;
        }
    };

    return {
        templates,
        saving,
        loadTemplates,
        saveTemplate,
        deleteTemplate
    };
};
