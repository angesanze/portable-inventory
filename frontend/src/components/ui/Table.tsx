import React from 'react';

// --- Table ---

interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
    className?: string;
    children: React.ReactNode;
}

export const Table: React.FC<TableProps> = ({
    className = '',
    children,
    ...props
}) => (
    <div className="w-full">
        <table
            {...props}
            className={`w-full text-sm text-left ${className}`}
        >
            {children}
        </table>
    </div>
);

// --- TableHeader ---

interface TableSectionProps extends React.HTMLAttributes<HTMLTableSectionElement> {
    className?: string;
    children: React.ReactNode;
}

export const TableHeader: React.FC<TableSectionProps> = ({
    className = '',
    children,
    ...props
}) => (
    <thead {...props} className={className}>
        {children}
    </thead>
);

// --- TableBody ---

export const TableBody: React.FC<TableSectionProps> = ({
    className = '',
    children,
    ...props
}) => (
    <tbody {...props} className={className}>
        {children}
    </tbody>
);

// --- TableRow ---

interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
    className?: string;
    children: React.ReactNode;
}

export const TableRow: React.FC<TableRowProps> = ({
    className = '',
    children,
    ...props
}) => (
    <tr
        {...props}
        className={`border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors ${className}`}
    >
        {children}
    </tr>
);

// --- TableHead ---

interface TableCellBaseProps {
    className?: string;
    children?: React.ReactNode;
}

type TableHeadProps = TableCellBaseProps & React.ThHTMLAttributes<HTMLTableCellElement>;

export const TableHead: React.FC<TableHeadProps> = ({
    className = '',
    children,
    ...props
}) => (
    <th
        {...props}
        className={`py-3 px-4 text-xs font-medium text-zinc-500 uppercase tracking-wider border-b border-white/[0.06] ${className}`}
    >
        {children}
    </th>
);

// --- TableCell ---

type TableCellProps = TableCellBaseProps & React.TdHTMLAttributes<HTMLTableCellElement>;

export const TableCell: React.FC<TableCellProps> = ({
    className = '',
    children,
    ...props
}) => (
    <td
        {...props}
        className={`py-3 px-4 text-sm text-zinc-50 ${className}`}
    >
        {children}
    </td>
);
