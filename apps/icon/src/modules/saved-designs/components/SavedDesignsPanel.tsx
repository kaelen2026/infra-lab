"use client";

import type { SavedDesign } from "../lib/savedDesigns";

type Props = {
  designs: SavedDesign[];
  onSave: () => void;
  onRestore: (design: SavedDesign) => void;
  onDelete: (id: string) => void;
};

function formatSavedTime(createdAt: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(createdAt);
}

export default function SavedDesignsPanel({ designs, onSave, onRestore, onDelete }: Props) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[11px] tracking-[0.18em] text-text-faint">saved</h2>
        <button
          type="button"
          onClick={onSave}
          className="min-h-11 rounded-sm border border-hairline px-3 py-2 text-[11px] text-text-dim transition-colors hover:border-hairline-bright hover:text-text sm:min-h-0 sm:py-1.5"
        >
          save current
        </button>
      </div>
      {designs.length === 0 ? (
        <p className="text-[11px] text-text-faint">no saved designs yet</p>
      ) : (
        <ul className="space-y-1.5">
          {designs.map((design) => (
            <li
              key={design.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-sm border border-hairline p-2"
            >
              <button
                type="button"
                onClick={() => onRestore(design)}
                aria-label={`restore ${design.name}`}
                className="min-w-0 text-left"
                title={`restore ${design.name}`}
              >
                <span className="block truncate text-[11px] text-text">{design.name}</span>
                <span className="block text-[10px] text-text-faint">
                  {formatSavedTime(design.createdAt)}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onDelete(design.id)}
                aria-label={`delete ${design.name}`}
                className="min-h-11 px-2 text-[11px] text-text-faint transition-colors hover:text-red-400 sm:min-h-0"
                title={`delete ${design.name}`}
              >
                delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
