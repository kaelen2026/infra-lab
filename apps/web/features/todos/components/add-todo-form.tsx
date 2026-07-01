"use client";

import { Plus } from "lucide-react";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AddTodoFormProps {
  onAdd: (title: string) => Promise<void>;
  busy: boolean;
}

const MAX_TITLE = 200;

/** Single-line composer: type a title, Enter or the button adds it. */
export function AddTodoForm({ onAdd, busy }: AddTodoFormProps) {
  const [title, setTitle] = useState("");
  const trimmed = title.trim();
  const canSubmit = trimmed.length > 0 && !busy;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    await onAdd(trimmed);
    setTitle("");
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value.slice(0, MAX_TITLE))}
        placeholder="添加一项待办…"
        aria-label="待办标题"
        disabled={busy}
      />
      <Button type="submit" disabled={!canSubmit}>
        <Plus />
        添加
      </Button>
    </form>
  );
}
