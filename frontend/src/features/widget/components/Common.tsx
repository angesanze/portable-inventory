import React from "react";

interface WidgetHeaderProps {
    companyName: string;
    onReset?: () => void;
}

export const WidgetHeader: React.FC<WidgetHeaderProps> = ({ companyName, onReset }) => {
    return (
        <div className="flex justify-between items-center mb-6">
            <h1
                className="text-2xl font-bold cursor-pointer transition-colors"
                style={{ color: 'var(--pi-text)' }}
                onClick={onReset}
            >
                {companyName || "Inventory"}
            </h1>
            <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'var(--pi-success)' }}></div>
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--pi-muted)' }}>Live System</span>
            </div>
        </div>
    );
};

interface AlertProps {
    message: { type: 'success' | 'error', text: string } | null;
}

export const Alert: React.FC<AlertProps> = ({ message }) => {
    if (!message) return null;

    return (
        <div className={`mb-6 p-4 rounded-xl border animate-slideDown ${message.type === 'success'
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}>
            <div className="flex items-center gap-3">
                <span className="text-xl">{message.type === 'success' ? '✅' : '❌'}</span>
                <p className="text-sm font-medium">{message.text}</p>
            </div>
        </div>
    );
};
