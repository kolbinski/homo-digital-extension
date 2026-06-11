import { useRef, useState } from 'react';
import {
  CaretDown,
  CaretRight,
  DotsSixVertical,
  Plus,
  Trash,
} from '@phosphor-icons/react';
import type { CertificationEntry } from '../types';

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

        return (
          <div
            key={idx}
            onDragOver={e => handleDragOver(e, idx)}
            onDrop={e => handleDrop(e, idx)}
            className={`bg-white rounded-lg border shadow-sm overflow-hidden transition-colors ${
              isDragTarget ? 'border-green-400' : 'border-gray-200'
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
                <DotsSixVertical size={14} />
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
                  <CaretDown size={14} className="text-gray-400 shrink-0" />
                ) : (
                  <CaretRight size={14} className="text-gray-400 shrink-0" />
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

              {/* Delete */}
              <button
                type="button"
                onClick={() => deleteEntry(idx)}
                aria-label="Delete certification"
                className="shrink-0 text-red-400 hover:text-red-600 transition-colors p-1"
              >
                <Trash size={14} />
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
                />
                <Field
                  label="Issuer"
                  value={cert.issuer}
                  onChange={v => updateEntry(idx, 'issuer', v)}
                  placeholder="e.g. Amazon Web Services"
                  required
                  multiline
                />
                <Field
                  label="Date"
                  value={cert.date ?? ''}
                  onChange={v => updateEntry(idx, 'date', v)}
                  placeholder="YYYY-MM"
                />
                <Field
                  label="URL"
                  value={cert.url ?? ''}
                  onChange={v => updateEntry(idx, 'url', v)}
                  placeholder="https://..."
                />
              </div>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={addEntry}
        className="flex items-center gap-1.5 text-sm font-medium text-white px-3 py-2 rounded-md transition-colors w-fit bg-blue-600"
      >
        <Plus size={14} />
        Add certification
      </button>
    </div>
  );
}

const fieldClass =
  'w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent';
const ringStyle = { ['--tw-ring-color' as string]: '#16a34a' };

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  multiline?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-600">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {multiline ? (
        <textarea
          rows={2}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={`${fieldClass} resize-y`}
          style={ringStyle}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={fieldClass}
          style={ringStyle}
        />
      )}
    </div>
  );
}
