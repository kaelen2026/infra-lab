"use client";

import { TIMELINE_IMAGE_CONTENT_TYPES, TIMELINE_IMAGES_MAX, TIMELINE_TEXT_MAX } from "@infra/sdk";
import { ImagePlus, Send, X } from "lucide-react";
import Image from "next/image";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { PublishInput } from "../use-timeline";

interface ComposeTimelineProps {
  onPublish: (input: PublishInput) => Promise<void>;
  busy: boolean;
}

const ACCEPT = TIMELINE_IMAGE_CONTENT_TYPES.join(",");

/**
 * Inline composer (mirrors the todo add-form): a text area, an image picker (up to
 * {@link TIMELINE_IMAGES_MAX} images), and a publish button. A post needs text or
 * at least one image. Preview object-urls are revoked when the selection changes.
 */
export function ComposeTimeline({ onPublish, busy }: ComposeTimelineProps) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Create one object-url per selected file, and revoke them when the selection
  // changes / on unmount — object urls are created once per change, never per render.
  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [files]);

  const trimmed = text.trim();
  const canSubmit = (trimmed.length > 0 || files.length > 0) && !busy;

  function addFiles(selected: FileList | null) {
    if (!selected) return;
    const next = [...files];
    for (const file of Array.from(selected)) {
      if (next.length >= TIMELINE_IMAGES_MAX) break;
      if ((TIMELINE_IMAGE_CONTENT_TYPES as readonly string[]).includes(file.type)) next.push(file);
    }
    setFiles(next);
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeAt(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    await onPublish({ text: trimmed, files });
    setText("");
    setFiles([]);
  }

  return (
    <Card>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, TIMELINE_TEXT_MAX))}
            placeholder="分享此刻…"
            aria-label="动态内容"
            disabled={busy}
          />

          {previews.length > 0 && (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {previews.map((url, i) => (
                <li key={url} className="relative aspect-square overflow-hidden rounded-lg border">
                  {/* Local preview of a not-yet-uploaded file. */}
                  <Image
                    src={url}
                    alt="待发布图片预览"
                    fill
                    unoptimized
                    sizes="(max-width: 640px) 33vw, 160px"
                    className="object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeAt(i)}
                    disabled={busy}
                    aria-label="移除图片"
                    className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-background/80 text-foreground shadow-sm transition-colors hover:bg-background disabled:opacity-50"
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
          />

          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={busy || files.length >= TIMELINE_IMAGES_MAX}
            >
              <ImagePlus />
              图片
              <span className="text-muted-foreground">
                {files.length}/{TIMELINE_IMAGES_MAX}
              </span>
            </Button>

            <Button type="submit" disabled={!canSubmit}>
              <Send />
              发布
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
