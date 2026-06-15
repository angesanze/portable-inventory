import React from "react";
import { Card } from "./Card";

interface FormSectionProps {
    title: string;
    titleExtra?: React.ReactNode;
    description?: string;
    children: React.ReactNode;
}

export const FormSection: React.FC<FormSectionProps> = ({
    title,
    titleExtra,
    description,
    children,
}) => (
    <Card>
        <h3 className="text-lg font-semibold text-zinc-200 mb-1 inline-flex items-center gap-1.5">
            {title}
            {titleExtra}
        </h3>
        {description && (
            <p className="text-sm text-zinc-500 mb-4">{description}</p>
        )}
        {!description && <div className="mb-4" />}
        <div className="flex flex-col gap-4">{children}</div>
    </Card>
);
