import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Badge, type BadgeVariant } from "./Badge";
import { Button } from "./Button";
import { SkeletonDetailPage } from "./Skeleton";

export interface DetailPageBadge {
    label: string;
    variant?: BadgeVariant;
    dot?: boolean;
}

interface DetailPageProps {
    title: string;
    subtitle?: string;
    badges?: DetailPageBadge[];
    actions?: React.ReactNode;
    isLoading?: boolean;
    children: React.ReactNode;
}

export const DetailPage: React.FC<DetailPageProps> = ({
    title,
    subtitle,
    badges,
    actions,
    isLoading = false,
    children,
}) => {
    const navigate = useNavigate();

    if (isLoading) {
        return <SkeletonDetailPage />;
    }

    return (
        <div>
            {/* Header */}
            <div className="mb-8">
                <button
                    type="button"
                    onClick={() => navigate(-1)}
                    className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors mb-4"
                >
                    <ArrowLeft size={16} />
                    Back
                </button>

                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-semibold text-zinc-50">
                            {title}
                        </h1>
                        {subtitle && (
                            <p className="text-sm text-zinc-400 mt-1">
                                {subtitle}
                            </p>
                        )}
                        {badges && badges.length > 0 && (
                            <div className="flex items-center gap-2 mt-2">
                                {badges.map((badge, i) => (
                                    <Badge
                                        key={i}
                                        variant={badge.variant}
                                        dot={badge.dot}
                                    >
                                        {badge.label}
                                    </Badge>
                                ))}
                            </div>
                        )}
                    </div>

                    {actions && (
                        <div className="flex items-center gap-2 shrink-0">
                            {actions}
                        </div>
                    )}
                </div>
            </div>

            {/* Content sections */}
            <div className="flex flex-col gap-6">{children}</div>
        </div>
    );
};
