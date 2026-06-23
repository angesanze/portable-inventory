import React from "react";

// ── Tab Button ─────────────────────────────────────────────────────────

export const TabButton = ({
    active,
    onClick,
    children,
}: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) => (
    <button
        onClick={onClick}
        className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            active
                ? "bg-indigo-500/15 text-indigo-400 border border-indigo-500/30"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
        }`}
    >
        {children}
    </button>
);
