import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Trash2, Download } from "lucide-react";

import { BulkActionsBar } from "../BulkActionsBar";
import { renderWithI18n as render } from "../../../test-utils/i18n-wrapper";

describe("BulkActionsBar", () => {
    it("renders nothing when count is 0", () => {
        const { container } = render(
            <BulkActionsBar count={0} onClear={vi.fn()} actions={[]} />,
        );
        expect(container.firstChild).toBeNull();
    });

    it("renders count text when count > 0", () => {
        render(<BulkActionsBar count={3} onClear={vi.fn()} actions={[]} />);
        expect(screen.getByText("3 selected")).toBeInTheDocument();
    });

    it("clear button fires onClear", () => {
        const onClear = vi.fn();
        render(<BulkActionsBar count={1} onClear={onClear} actions={[]} />);
        fireEvent.click(screen.getByLabelText("Clear selection"));
        expect(onClear).toHaveBeenCalledTimes(1);
    });

    it("renders each action and fires its onClick", () => {
        const onDelete = vi.fn();
        const onExport = vi.fn();
        render(
            <BulkActionsBar
                count={2}
                onClear={vi.fn()}
                actions={[
                    { label: "Delete", icon: Trash2, onClick: onDelete, variant: "danger" },
                    { label: "Export selected", icon: Download, onClick: onExport },
                ]}
            />,
        );

        const del = screen.getByRole("button", { name: /Delete/i });
        const exp = screen.getByRole("button", { name: /Export selected/i });

        fireEvent.click(del);
        fireEvent.click(exp);

        expect(onDelete).toHaveBeenCalledTimes(1);
        expect(onExport).toHaveBeenCalledTimes(1);
    });

    it("applies danger styling to danger-variant actions", () => {
        render(
            <BulkActionsBar
                count={1}
                onClear={vi.fn()}
                actions={[
                    { label: "Delete", icon: Trash2, onClick: vi.fn(), variant: "danger" },
                ]}
            />,
        );
        const del = screen.getByRole("button", { name: /Delete/i });
        expect(del.className).toContain("bg-red-500/10");
    });

    it("uses sticky top positioning", () => {
        render(<BulkActionsBar count={1} onClear={vi.fn()} actions={[]} />);
        const region = screen.getByRole("region");
        expect(region.className).toContain("sticky");
        expect(region.className).toContain("top-0");
    });
});
