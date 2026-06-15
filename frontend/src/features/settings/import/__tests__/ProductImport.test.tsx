import { screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithI18n } from "../../../../test-utils/i18n-wrapper";
import { ProductImport } from "../ProductImport";

const { postMock, writeFileMock } = vi.hoisted(() => ({
    postMock: vi.fn(),
    writeFileMock: vi.fn(),
}));

vi.mock("../../../../providers/axios-client", () => ({
    axiosInstance: { post: postMock },
}));

vi.mock("xlsx", () => ({
    utils: {
        aoa_to_sheet: vi.fn(() => ({})),
        book_new: vi.fn(() => ({})),
        book_append_sheet: vi.fn(),
    },
    writeFile: writeFileMock,
}));

function selectFile(name = "catalogue.csv") {
    const input = screen.getByTestId("file-input") as HTMLInputElement;
    const file = new File(["sku,name,profile\nA,B,SIMPLE_COUNT"], name, { type: "text/csv" });
    fireEvent.change(input, { target: { files: [file] } });
    return file;
}

describe("ProductImport wizard", () => {
    beforeEach(() => {
        postMock.mockReset();
        writeFileMock.mockReset();
    });

    it("renders the upload step with a template download", () => {
        renderWithI18n(<ProductImport />);
        expect(screen.getByTestId("dropzone")).toBeTruthy();
        const tmplBtn = screen.getByText("Download template (.xlsx)");
        fireEvent.click(tmplBtn);
        expect(writeFileMock).toHaveBeenCalledTimes(1);
    });

    it("upload → preview → commit flow (mocked)", async () => {
        // dry-run preview response
        postMock.mockResolvedValueOnce({
            data: {
                dry_run: true,
                total: 2,
                counts: { create: 1, update: 1, error: 0 },
                results: [
                    { row: 1, sku: "NEW1", name: "New", action: "CREATE", errors: [] },
                    { row: 2, sku: "EXIST", name: "Upd", action: "UPDATE", errors: [] },
                ],
            },
        });
        // commit response
        postMock.mockResolvedValueOnce({
            data: {
                dry_run: false,
                total: 2,
                counts: { create: 1, update: 1, error: 0 },
                results: [
                    { row: 1, sku: "NEW1", action: "CREATE", errors: [] },
                    { row: 2, sku: "EXIST", action: "UPDATE", errors: [] },
                ],
            },
        });

        renderWithI18n(<ProductImport />);
        selectFile();

        fireEvent.click(screen.getByText("Analyze file"));

        await waitFor(() => expect(screen.getByText("Validation preview")).toBeTruthy());
        // dry_run=true URL used for first call
        expect(postMock.mock.calls[0][0]).toContain("dry_run=true");
        expect(screen.getByText("NEW1")).toBeTruthy();
        expect(screen.getByText("EXIST")).toBeTruthy();

        fireEvent.click(screen.getByText("Confirm import"));

        await waitFor(() => expect(screen.getByText("Import complete")).toBeTruthy());
        // commit URL has no dry_run
        expect(postMock.mock.calls[1][0]).not.toContain("dry_run");
        expect(postMock).toHaveBeenCalledTimes(2);
    });

    it("blocks commit when there are errors and 'skip errors' is off", async () => {
        postMock.mockResolvedValueOnce({
            data: {
                dry_run: true,
                total: 2,
                counts: { create: 1, update: 0, error: 1 },
                results: [
                    { row: 1, sku: "OK", name: "Ok", action: "CREATE", errors: [] },
                    { row: 2, sku: "BAD", name: "Bad", action: "ERROR", errors: ["profile invalid"] },
                ],
            },
        });

        renderWithI18n(<ProductImport />);
        selectFile();
        fireEvent.click(screen.getByText("Analyze file"));

        await waitFor(() => expect(screen.getByText("Validation preview")).toBeTruthy());

        const confirmBtn = screen.getByText("Confirm import") as HTMLButtonElement;
        expect(confirmBtn.disabled).toBe(true);
        // The blocked-by-errors warning is shown.
        expect(screen.getByText(/Enable "skip rows with errors"/i)).toBeTruthy();

        // Enable skip-errors → commit unblocked.
        fireEvent.click(screen.getByTestId("skip-errors"));
        expect((screen.getByText("Confirm import") as HTMLButtonElement).disabled).toBe(false);
    });

    it("surfaces a parse error from the backend", async () => {
        postMock.mockRejectedValueOnce({ response: { data: { detail: "File too large." } } });
        renderWithI18n(<ProductImport />);
        selectFile();
        fireEvent.click(screen.getByText("Analyze file"));
        await waitFor(() => expect(screen.getByText("File too large.")).toBeTruthy());
    });
});
