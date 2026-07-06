import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ImageUploader from "@/components/ImageUploader";

describe("ImageUploader", () => {
  it("rejects unsupported file types", () => {
    const { container } = render(<ImageUploader imageSrc={null} onImageChange={vi.fn()} />);
    const input = container.querySelector('input[type="file"]');

    if (!(input instanceof HTMLInputElement)) {
      throw new Error("file input missing");
    }

    fireEvent.change(input, {
      target: {
        files: [new File(["hello"], "notes.txt", { type: "text/plain" })],
      },
    });

    expect(screen.getByText("unsupported type. use png / jpg / webp / svg.")).toBeInTheDocument();
  });

  it("reads supported files as data URLs", async () => {
    const onImageChange = vi.fn();
    const { container } = render(<ImageUploader imageSrc={null} onImageChange={onImageChange} />);
    const input = container.querySelector('input[type="file"]');

    if (!(input instanceof HTMLInputElement)) {
      throw new Error("file input missing");
    }

    fireEvent.change(input, {
      target: {
        files: [new File(["image"], "icon.png", { type: "image/png" })],
      },
    });

    await waitFor(() =>
      expect(onImageChange).toHaveBeenCalledWith(expect.stringMatching(/^data:image\/png;base64,/)),
    );
  });

  it("removes the current image", async () => {
    const onImageChange = vi.fn();
    const user = userEvent.setup();

    render(
      <ImageUploader imageSrc="data:image/png;base64,aW1hZ2U=" onImageChange={onImageChange} />,
    );

    await user.click(screen.getByRole("button", { name: "remove image" }));

    expect(onImageChange).toHaveBeenCalledWith(null);
  });
});
