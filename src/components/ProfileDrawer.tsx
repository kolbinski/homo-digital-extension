import { useState } from 'react';
import { createPortal } from 'react-dom';

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

function ProfileNode({
  label,
  value,
  depth,
}: {
  label: string;
  value: JsonValue;
  depth: number;
}) {
  const [open, setOpen] = useState(false);
  const indent = depth * 12;
  const isPrimitive = value === null || typeof value !== 'object';

  if (isPrimitive) {
    return (
      <div
        className="flex items-baseline gap-1 py-px"
        style={{ paddingLeft: indent }}
      >
        <span className="text-xs text-gray-500 shrink-0">{label}:</span>
        <span className="text-xs text-gray-800 break-all">
          {value === null ? 'null' : String(value)}
        </span>
      </div>
    );
  }

  const isArray = Array.isArray(value);
  const entries = isArray
    ? (value as JsonValue[]).map((v, i) => [String(i), v] as [string, JsonValue])
    : Object.entries(value as Record<string, JsonValue>);
  const count = entries.length;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 py-px w-full text-left hover:bg-gray-50 rounded"
        style={{ paddingLeft: indent }}
      >
        <span className="text-gray-400 text-xs w-3 shrink-0">
          {open ? '▾' : '▸'}
        </span>
        <span className="text-xs text-gray-500">{label}</span>
        <span className="text-xs text-gray-400">({count})</span>
      </button>
      {open &&
        entries.map(([k, v]) => (
          <ProfileNode key={k} label={k} value={v as JsonValue} depth={depth + 1} />
        ))}
    </div>
  );
}

interface Props {
  clientName: string;
  profile: Record<string, unknown>;
  onClose: () => void;
}

export default function ProfileDrawer({ clientName, profile, onClose }: Props) {
  return createPortal(
    <div
      className="fixed inset-y-0 right-0 w-full bg-white z-50 flex flex-col shadow-2xl border-l border-gray-200"
      style={{ maxWidth: '100%' }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
        <span className="text-sm font-semibold text-gray-900 truncate">
          {clientName}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-700 transition-colors ml-2 shrink-0"
          aria-label="Close"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {Object.entries(profile).map(([k, v]) => (
          <ProfileNode key={k} label={k} value={v as JsonValue} depth={0} />
        ))}
      </div>
    </div>,
    document.body,
  );
}
