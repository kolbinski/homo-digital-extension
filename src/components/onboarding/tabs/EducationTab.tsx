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
import type { EducationEntry } from '../types';

interface Props {
  education: EducationEntry[];
  onChange: (education: EducationEntry[]) => void;
}

function reorderIndex(i: number, from: number, to: number): number {
  if (i === from) return to;
  if (from < to && i > from && i <= to) return i - 1;
  if (from > to && i >= to && i < from) return i + 1;
  return i;
}

const fieldClass =
  'w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blye-500 focus:border-transparent';

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-600">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

export default function EducationTab({ education, onChange }: Props) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const dragFromIdx = useRef<number | null>(null);

  function addEntry() {
    const idx = education.length;
    onChange([...education, { institution: '' }]);
    setExpanded(prev => new Set(prev).add(idx));
  }

  function updateEntry(idx: number, patch: Partial<EducationEntry>) {
    onChange(education.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  }

  function deleteEntry(idx: number) {
    onChange(education.filter((_, i) => i !== idx));
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
    const reordered = [...education];
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
      {education.length === 0 && (
        <p className="text-sm text-gray-400">
          No education entries yet. Add one below.
        </p>
      )}

      {education.map((entry, idx) => {
        const isOpen = expanded.has(idx);
        const isDragTarget = dragOverIdx === idx;
        const isComplete = !!entry.institution?.trim();

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
                    {entry.institution || 'Untitled institution'}
                  </p>
                  {entry.degree && (
                    <p className="text-xs text-gray-500 truncate">
                      {entry.degree}
                    </p>
                  )}
                </div>
              </div>

              {/* Completion status */}
              <span className="shrink-0 p-0.5">
                {isComplete ? (
                  <CheckCircle
                    size={20}
                    weight="fill"
                    className="text-green-500"
                  />
                ) : (
                  <XCircle size={20} weight="fill" className="text-red-400" />
                )}
              </span>

              {/* Delete */}
              <button
                type="button"
                onClick={() => deleteEntry(idx)}
                aria-label="Delete education entry"
                className="shrink-0 text-red-400 hover:text-red-600 transition-colors p-1"
              >
                <Trash size={20} />
              </button>
            </div>

            {/* Expanded fields */}
            {isOpen && (
              <div className="px-3 pb-3 pt-2 border-t border-gray-100 flex flex-col gap-3">
                <Field label="Institution" required>
                  <div className="flex items-start gap-1.5">
                    <textarea
                      rows={2}
                      value={entry.institution}
                      onChange={e =>
                        updateEntry(idx, { institution: e.target.value })
                      }
                      placeholder="e.g. Warsaw University of Technology"
                      className={`${fieldClass} resize-y flex-1`}
                    />
                    {!entry.institution?.trim() && (
                      <XCircle size={16} weight="fill" className="shrink-0 text-red-400 mt-1.5" />
                    )}
                  </div>
                </Field>

                <Field label="Degree">
                  <textarea
                    rows={2}
                    value={entry.degree ?? ''}
                    onChange={e => updateEntry(idx, { degree: e.target.value })}
                    placeholder="e.g. Master of Science"
                    className={`${fieldClass} resize-y`}
                  />
                </Field>

                <Field label="Field of study">
                  <textarea
                    rows={2}
                    value={entry.field ?? ''}
                    onChange={e => updateEntry(idx, { field: e.target.value })}
                    placeholder="e.g. Computer Science"
                    className={`${fieldClass} resize-y`}
                  />
                </Field>

                <Field label="Thesis">
                  <textarea
                    rows={3}
                    value={entry.thesis ?? ''}
                    onChange={e => updateEntry(idx, { thesis: e.target.value })}
                    placeholder="e.g. Machine Learning approaches to..."
                    className={`${fieldClass} resize-y`}
                  />
                </Field>

                <Field label="GPA">
                  <input
                    type="text"
                    value={entry.gpa ?? ''}
                    onChange={e => updateEntry(idx, { gpa: e.target.value })}
                    placeholder="e.g. 3.8 / 4.0 or 4.5 / 5.0"
                    className={fieldClass}
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Date from">
                    <input
                      type="text"
                      value={entry.date_from ?? ''}
                      onChange={e =>
                        updateEntry(idx, { date_from: e.target.value })
                      }
                      placeholder="YYYY-MM"
                      className={fieldClass}
                    />
                  </Field>
                  <Field label="Date to">
                    <input
                      type="text"
                      value={entry.date_to ?? ''}
                      onChange={e =>
                        updateEntry(idx, { date_to: e.target.value })
                      }
                      placeholder="YYYY-MM"
                      className={fieldClass}
                    />
                  </Field>
                </div>
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
        Add education
      </button>
    </div>
  );
}
