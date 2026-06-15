import React from "react";
import { TableRow, TableCell } from "./Table";

// --- Base Skeleton ---

interface SkeletonProps {
    className?: string;
    width?: string;
    height?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({
    className = "",
    width,
    height,
}) => (
    <div
        className={`animate-pulse rounded bg-zinc-800 ${className}`}
        style={{ width, height }}
        role="status"
        aria-label="Loading"
    />
);

// --- SkeletonRow ---

interface SkeletonRowProps {
    columns: number;
    rows?: number;
}

export const SkeletonRow: React.FC<SkeletonRowProps> = ({
    columns,
    rows = 5,
}) => (
    <>
        {Array.from({ length: rows }).map((_, rowIdx) => (
            <TableRow key={rowIdx}>
                {Array.from({ length: columns }).map((_, colIdx) => (
                    <TableCell key={colIdx}>
                        <Skeleton className="h-4 w-3/4" />
                    </TableCell>
                ))}
            </TableRow>
        ))}
    </>
);

// --- SkeletonCard ---

interface SkeletonCardProps {
    lines?: number;
    className?: string;
}

export const SkeletonCard: React.FC<SkeletonCardProps> = ({
    lines = 3,
    className = "",
}) => (
    <div
        className={`bg-zinc-900/80 border border-white/[0.06] rounded-xl p-5 space-y-3 ${className}`}
        role="status"
        aria-label="Loading"
    >
        {Array.from({ length: lines }).map((_, i) => (
            <Skeleton
                key={i}
                className={`h-4 ${i === 0 ? "w-1/3" : i === lines - 1 ? "w-1/2" : "w-full"}`}
            />
        ))}
    </div>
);

// --- SkeletonDetailPage ---

export const SkeletonDetailPage: React.FC = () => (
    <div className="space-y-6" role="status" aria-label="Loading">
        {/* Back button skeleton */}
        <Skeleton className="h-4 w-12" />
        {/* Title + badges */}
        <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <div className="flex gap-2">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
            </div>
        </div>
        {/* Card skeleton */}
        <SkeletonCard lines={4} />
        <SkeletonCard lines={3} />
    </div>
);

// --- SkeletonList ---

interface SkeletonListProps {
    items?: number;
}

export const SkeletonList: React.FC<SkeletonListProps> = ({ items = 4 }) => (
    <div className="space-y-2" role="status" aria-label="Loading">
        {Array.from({ length: items }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3">
                <Skeleton className="h-2 w-2 rounded-full" />
                <div className="flex-1 space-y-1">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-3 w-2/3" />
                </div>
                <Skeleton className="h-3 w-12" />
            </div>
        ))}
    </div>
);
