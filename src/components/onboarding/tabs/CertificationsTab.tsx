import { useRef, useState } from 'react';
import {
  CaretDown,
  CaretRight,
  CheckCircle,
  DotsSixVertical,
  Plus,
  Trash,
  XCircle,
} from '@phosphor-icons/react';
import type { CertificationEntry } from '../types';

const CERT_DATE_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function isUrlInvalid(value: string): boolean {
  if (!value.trim()) return false;
  try {
    const u = new URL(value.startsWith('http') ? value : `https://${value}`);
    return (
      (u.protocol !== 'http:' && u.protocol !== 'https:') ||
      !u.hostname.includes('.')
    );
  } catch {
    return true;
  }
}

interface Props {
  certifications: CertificationEntry[];
  onChange: (certifications: CertificationEntry[]) => void;
}

function reorderIndex(i: number, from: number, to: number): number {
  if (i === from) return to;
  if (from < to && i > from && i <= to) return i - 1;
  if (from > to && i >= to && i < from) return i + 1;
  return i;
}

export default function CertificationsTab({ certifications, onChange }: Props) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const dragFromIdx = useRef<number | null>(null);

  function addEntry() {
    const idx = certifications.length;
    onChange([...certifications, { name: '', issuer: '', date: '', url: '' }]);
    setExpanded(prev => new Set(prev).add(idx));
  }

  function updateEntry(
    idx: number,
    field: keyof CertificationEntry,
    value: string,
  ) {
    onChange(
      certifications.map((c, i) => (i === idx ? { ...c, [field]: value } : c)),
    );
  }

  function deleteEntry(idx: number) {
    onChange(certifications.filter((_, i) => i !== idx));
    setExpanded(prev => {
      const next = new Set<number>();
      prev.forEach(i => {
        if (i < idx) next.add(i);
        else if (i > idx) next.add(i - 1);
      });
      return next;
    });
  }

  function toggleExpand(idx: number) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function handleDragStart(idx: number) {
    dragFromIdx.current = idx;
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    setDragOverIdx(idx);
  }

  function handleDrop(e: React.DragEvent, toIdx: number) {
    e.preventDefault();
    const fromIdx = dragFromIdx.current;
    if (fromIdx === null || fromIdx === toIdx) {
      setDragOverIdx(null);
      return;
    }
    const reordered = [...certifications];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    onChange(reordered);
    setExpanded(prev => {
      const next = new Set<number>();
      prev.forEach(i => next.add(reorderIndex(i, fromIdx, toIdx)));
      return next;
    });
    dragFromIdx.current = null;
    setDragOverIdx(null);
  }

  function handleDragEnd() {
    dragFromIdx.current = null;
    setDragOverIdx(null);
  }

  return (
    <div className="flex flex-col gap-3">
      {certifications.length === 0 && (
        <p className="text-sm text-gray-400">
          No certifications yet. Add one below.
        </p>
      )}

      {certifications.map((cert, idx) => {
        const isOpen = expanded.has(idx);
        const isDragTarget = dragOverIdx === idx;
        const invalidCount =
          (!cert.name?.trim() ? 1 : 0) +
          (!cert.issuer?.trim() ? 1 : 0) +
          (cert.date?.trim() && !CERT_DATE_RE.test(cert.date) ? 1 : 0) +
          (isUrlInvalid(cert.url ?? '') ? 1 : 0);

        return (
          <div
            key={idx}
            onDragOver={e => handleDragOver(e, idx)}
            onDrop={e => handleDrop(e, idx)}
            className={`bg-white rounded-lg border shadow-sm overflow-hidden transition-colors ${
              isDragTarget ? 'border-blue-400' : 'border-gray-200'
            }`}
          >
            {/* Card header */}
            <div className="flex items-center gap-1 px-2 py-2.5">
              {/* Drag handle */}
              <div
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragEnd={handleDragEnd}
                className="shrink-0 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-500 transition-colors p-0.5"
                aria-label="Drag to reorder"
              >
                <DotsSixVertical size={20} />
              </div>

              {/* Expand toggle */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggleExpand(idx)}
                onKeyDown={e => e.key === 'Enter' && toggleExpand(idx)}
                className="flex flex-1 items-center gap-1.5 cursor-pointer min-w-0"
              >
                {isOpen ? (
                  <CaretDown size={20} className="text-gray-400 shrink-0" />
                ) : (
                  <CaretRight size={20} className="text-gray-400 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {cert.name || 'Untitled certification'}
                  </p>
                  {cert.issuer && (
                    <p className="text-xs text-gray-500 truncate">
                      {cert.issuer}
                    </p>
                  )}
                </div>
              </div>

              {/* Completion status */}
              <span className="shrink-0 p-0.5">
                {invalidCount === 0 ? (
                  <CheckCircle
                    size={20}
                    weight="fill"
                    className="text-green-500"
                  />
                ) : (
                  <span
                    className="inline-flex items-center justify-center rounded-full bg-red-500 text-white leading-none"
                    style={{ fontSize: 9, width: 18, height: 18 }}
                  >
                    {invalidCount}
                  </span>
                )}
              </span>

              {/* Delete */}
              <button
                type="button"
                onClick={() => deleteEntry(idx)}
                aria-label="Delete certification"
                className="shrink-0 text-red-400 hover:text-red-600 transition-colors p-1"
              >
                <Trash size={20} />
              </button>
            </div>

            {/* Expanded fields */}
            {isOpen && (
              <div className="px-3 pb-3 pt-2 border-t border-gray-100 flex flex-col gap-3">
                <Field
                  label="Name"
                  value={cert.name}
                  onChange={v => updateEntry(idx, 'name', v)}
                  placeholder="e.g. AWS Solutions Architect"
                  required
                  multiline
                  invalid={!cert.name?.trim()}
                />
                <Field
                  label="Issuer"
                  value={cert.issuer}
                  onChange={v => updateEntry(idx, 'issuer', v)}
                  placeholder="e.g. Amazon Web Services"
                  required
                  multiline
                  invalid={!cert.issuer?.trim()}
                />
                <Field
                  label="Date"
                  value={cert.date ?? ''}
                  onChange={v => updateEntry(idx, 'date', v)}
                  placeholder="YYYY-MM"
                  invalid={
                    !!cert.date?.trim() &&
                    !/^\d{4}-(0[1-9]|1[0-2])$/.test(cert.date)
                  }
                />
                <Field
                  label="URL"
                  value={cert.url ?? ''}
                  onChange={v => updateEntry(idx, 'url', v)}
                  placeholder="https://..."
                  invalid={isUrlInvalid(cert.url ?? '')}
                />
              </div>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={addEntry}
        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors w-fit"
      >
        <Plus size={16} />
        Add certification
      </button>
    </div>
  );
}

const fieldClass =
  'w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
  multiline,
  invalid,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  multiline?: boolean;
  invalid?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-600">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <div className="flex items-start gap-1.5">
        {multiline ? (
          <textarea
            rows={2}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            className={`${fieldClass} resize-y flex-1`}
          />
        ) : (
          <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            className={`${fieldClass} flex-1`}
          />
        )}
        {invalid && (
          <XCircle
            size={16}
            weight="fill"
            className="shrink-0 text-red-400 mt-1.5"
          />
        )}
      </div>
    </div>
  );
}
