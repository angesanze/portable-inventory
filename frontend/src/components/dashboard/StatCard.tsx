import React from "react";
import { Link } from "react-router-dom";
import { Card } from "../ui/Card";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Skeleton } from "../ui/Skeleton";

type StatCardProps = {
    title: string;
    value: number | string;
    icon?: React.ReactNode;
    iconColor?: string;
    isLoading?: boolean;
    href?: string;
    trend?: {
        value: number; // percentage, e.g. 12 for +12%
        direction: "up" | "down";
    };
};

export const StatCard: React.FC<StatCardProps> = ({
    title,
    value,
    icon,
    iconColor = "bg-indigo-500/15 text-indigo-400",
    isLoading = false,
    href,
    trend,
}) => {
    const card = (
        <Card padding="md" className={href ? "cursor-pointer hover:ring-1 hover:ring-indigo-500/30 transition-shadow" : undefined}>
            <div className="flex items-start gap-3">
                {icon && (
                    <div className={`flex-shrink-0 p-2 rounded-lg ${iconColor}`}>
                        {icon}
                    </div>
                )}
                <div className="min-w-0 flex-1">
                    {isLoading ? (
                        <Skeleton className="h-7 w-16 mb-1" />
                    ) : (
                        <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-semibold text-zinc-50">
                                {typeof value === "number" ? value.toLocaleString() : value}
                            </span>
                            {trend && (
                                <span
                                    className={`inline-flex items-center gap-0.5 text-xs font-medium ${
                                        trend.direction === "up"
                                            ? "text-emerald-400"
                                            : "text-red-400"
                                    }`}
                                >
                                    {trend.direction === "up" ? (
                                        <TrendingUp className="w-3 h-3" />
                                    ) : (
                                        <TrendingDown className="w-3 h-3" />
                                    )}
                                    {trend.value}%
                                </span>
                            )}
                        </div>
                    )}
                    <p className="text-sm text-zinc-400">{title}</p>
                </div>
            </div>
        </Card>
    );

    if (href) {
        return <Link to={href}>{card}</Link>;
    }

    return card;
};
