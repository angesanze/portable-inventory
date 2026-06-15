import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Package, Box, Tag, Hash } from "lucide-react";
import { EmptyState, FilteredEmptyState } from "../EmptyState";

describe("EmptyState", () => {
    it("renders icon, title, and description", () => {
        render(
            <EmptyState
                icon={Package}
                title="No items yet"
                description="Create your first item."
            />
        );
        expect(screen.getByText("No items yet")).toBeDefined();
        expect(screen.getByText("Create your first item.")).toBeDefined();
    });

    it("renders action button when actionLabel and onAction provided", () => {
        const onClick = vi.fn();
        render(
            <EmptyState
                icon={Package}
                title="No items"
                description="Get started."
                actionLabel="Create Item"
                onAction={onClick}
            />
        );
        const btn = screen.getByText("Create Item");
        expect(btn).toBeDefined();
        fireEvent.click(btn);
        expect(onClick).toHaveBeenCalledOnce();
    });

    it("does not render action button without onAction", () => {
        render(
            <EmptyState
                icon={Package}
                title="No items"
                description="Get started."
                actionLabel="Create Item"
            />
        );
        expect(screen.queryByText("Create Item")).toBeNull();
    });

    it("does not render action button without actionLabel", () => {
        render(
            <EmptyState
                icon={Package}
                title="No items"
                description="Get started."
                onAction={() => {}}
            />
        );
        // Only title and description, no button
        expect(screen.getByText("No items")).toBeDefined();
    });

    it("applies custom className", () => {
        const { container } = render(
            <EmptyState
                icon={Package}
                title="Test"
                description="Desc"
                className="my-custom"
            />
        );
        expect(container.firstElementChild?.className).toContain("my-custom");
    });

    it("renders helpItems list", () => {
        render(
            <EmptyState
                icon={Package}
                title="No items"
                description="Get started."
                helpItems={[
                    { icon: Box, text: "Simple Count — track by quantity" },
                    { icon: Tag, text: "Batch Tracked — track by lot number" },
                    { icon: Hash, text: "Serialized — track by serial number" },
                ]}
            />
        );
        expect(screen.getByText("Simple Count — track by quantity")).toBeDefined();
        expect(screen.getByText("Batch Tracked — track by lot number")).toBeDefined();
        expect(screen.getByText("Serialized — track by serial number")).toBeDefined();
    });

    it("renders secondary action button", () => {
        const onSecondary = vi.fn();
        render(
            <EmptyState
                icon={Package}
                title="No items"
                description="Get started."
                secondaryActionLabel="Import from CSV"
                onSecondaryAction={onSecondary}
            />
        );
        const btn = screen.getByText("Import from CSV");
        expect(btn).toBeDefined();
        fireEvent.click(btn);
        expect(onSecondary).toHaveBeenCalledOnce();
    });

    it("does not render secondary action without handler", () => {
        render(
            <EmptyState
                icon={Package}
                title="No items"
                description="Get started."
                secondaryActionLabel="Import"
            />
        );
        expect(screen.queryByText("Import")).toBeNull();
    });

    it("renders learn more link", () => {
        render(
            <EmptyState
                icon={Package}
                title="No items"
                description="Get started."
                learnMoreUrl="https://docs.example.com"
            />
        );
        const link = screen.getByText("Learn more");
        expect(link).toBeDefined();
        expect(link.getAttribute("href")).toBe("https://docs.example.com");
        expect(link.getAttribute("target")).toBe("_blank");
    });

    it("renders all optional props together", () => {
        const onAction = vi.fn();
        const onSecondary = vi.fn();
        render(
            <EmptyState
                icon={Package}
                title="Empty"
                description="Nothing here."
                helpItems={[{ icon: Box, text: "Hint one" }]}
                actionLabel="Primary"
                onAction={onAction}
                secondaryActionLabel="Secondary"
                onSecondaryAction={onSecondary}
                learnMoreUrl="https://example.com"
            />
        );
        expect(screen.getByText("Empty")).toBeDefined();
        expect(screen.getByText("Hint one")).toBeDefined();
        expect(screen.getByText("Primary")).toBeDefined();
        expect(screen.getByText("Secondary")).toBeDefined();
        expect(screen.getByText("Learn more")).toBeDefined();
    });
});

describe("FilteredEmptyState", () => {
    it("renders no-results message", () => {
        render(<FilteredEmptyState />);
        expect(screen.getByText("No results found")).toBeDefined();
        expect(screen.getByText("Try adjusting or clearing your filters.")).toBeDefined();
    });

    it("applies custom className", () => {
        const { container } = render(<FilteredEmptyState className="extra" />);
        expect(container.firstElementChild?.className).toContain("extra");
    });
});
