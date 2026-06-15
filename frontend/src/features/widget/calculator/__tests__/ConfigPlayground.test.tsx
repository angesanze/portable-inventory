import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ConfigPlayground } from "../ConfigPlayground";

vi.mock("../useCalculatorTemplates", () => ({
    useCalculatorTemplates: () => ({
        templates: [
            {
                id: "tmpl-1",
                name: "Test Counter",
                engine_type: "counter",
                engine_config: { step: 1 },
            },
            {
                id: "tmpl-2",
                name: "Test Bucket",
                engine_type: "bucket",
                engine_config: {
                    fields: [{ key: "expiry", label: "Expiry" }],
                },
            },
        ],
        saving: false,
        loadTemplates: vi.fn(),
        saveTemplate: vi.fn(),
        deleteTemplate: vi.fn(),
    }),
}));

describe("ConfigPlayground", () => {
    it("renders page header and main sections", () => {
        render(<ConfigPlayground />);

        expect(screen.getByText("Calculator Playground")).toBeInTheDocument();
        expect(
            screen.getByText("Design and test custom inventory calculators.")
        ).toBeInTheDocument();
    });

    it("renders preset buttons", () => {
        render(<ConfigPlayground />);

        expect(screen.getByText("Standard Counter")).toBeInTheDocument();
        expect(screen.getByText("Dimensional (Length)")).toBeInTheDocument();
        expect(screen.getByText("Batch & Expiry")).toBeInTheDocument();
    });

    it("shows VALID YAML badge when yaml is valid", () => {
        render(<ConfigPlayground />);

        expect(screen.getByText("VALID YAML")).toBeInTheDocument();
    });

    it("renders saved templates with category badges", () => {
        render(<ConfigPlayground />);

        expect(screen.getByText("Test Counter")).toBeInTheDocument();
        expect(screen.getByText("COUNTER")).toBeInTheDocument();
        expect(screen.getByText("Test Bucket")).toBeInTheDocument();
        expect(screen.getByText("EXPIRY")).toBeInTheDocument();
    });

    it("renders save button", () => {
        render(<ConfigPlayground />);

        expect(
            screen.getByRole("button", { name: /save template/i })
        ).toBeInTheDocument();
    });

    it("renders live preview badge", () => {
        render(<ConfigPlayground />);

        expect(screen.getByText("LIVE PREVIEW")).toBeInTheDocument();
    });

    it("loads preset when clicking preset button", () => {
        render(<ConfigPlayground />);

        const volumeBtn = screen.getByText("Volume (Liquid)");
        fireEvent.click(volumeBtn);

        // After clicking, the textarea should contain the volume preset YAML
        const textarea = screen.getByPlaceholderText("# YAML Configuration...");
        expect((textarea as HTMLTextAreaElement).value).toContain(
            "Chemical Tank"
        );
    });

    it("shows INVALID YAML when yaml is broken", () => {
        render(<ConfigPlayground />);

        const textarea = screen.getByPlaceholderText("# YAML Configuration...");
        fireEvent.change(textarea, { target: { value: "invalid: yaml: :" } });

        expect(screen.getByText("INVALID YAML")).toBeInTheDocument();
    });
});
