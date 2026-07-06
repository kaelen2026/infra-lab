"use client";

import { useRef, useState } from "react";

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

type Props = {
  imageSrc: string | null;
  onImageChange: (src: string | null) => void;
};

export default function ImageUploader({ imageSrc, onImageChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFile(file: File | undefined) {
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("unsupported type. use png / jpg / webp / svg.");
      return;
    }
    setError(null);
    // Data URL (not a blob URL) so the design survives reload via localStorage
    const reader = new FileReader();
    reader.onload = () => onImageChange(reader.result as string);
    reader.onerror = () => setError("could not read file. retry.");
    reader.readAsDataURL(file);
  }

  function handleRemove() {
    if (inputRef.current) inputRef.current.value = "";
    setError(null);
    onImageChange(null);
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          // allow re-selecting the same file (change won't fire otherwise)
          e.target.value = "";
        }}
      />
      <button
        type="button"
        className="flex w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-hairline px-4 py-6 text-center transition-colors hover:border-hairline-bright hover:bg-panel-2"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFile(e.dataTransfer.files?.[0]);
        }}
      >
        <span className="text-xs text-text">
          {imageSrc ? "replace image" : "click or drop an image"}
        </span>
        <span className="text-[10px] text-text-faint">png · jpg · webp · svg</span>
      </button>
      {error && <p className="text-[11px] text-red-400">{error}</p>}
      {imageSrc && (
        <button
          type="button"
          onClick={handleRemove}
          className="w-full rounded-sm border border-hairline px-3 py-1.5 text-[11px] text-text-dim transition-all hover:border-red-500/50 hover:text-red-400 active:scale-[0.97]"
        >
          remove image
        </button>
      )}
    </div>
  );
}
