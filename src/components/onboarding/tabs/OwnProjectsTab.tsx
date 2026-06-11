import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CaretDown,
  CaretRight,
  CheckCircle,
  DotsSixVertical,
  Plus,
  Trash,
  XCircle,
} from '@phosphor-icons/react';
import { XCircleIcon } from '@phosphor-icons/react';
import { CONFIG } from '../../../config';
import type { OwnProjectEntry } from '../types';

interface Props {
  projects: OwnProjectEntry[];
  onChange: (projects: OwnProjectEntry[]) => void;
}

function reorderIndex(i: number, from: number, to: number): number {
  if (i === from) return to;
  if (from < to && i > from && i <= to) return i - 1;
  if (from > to && i >= to && i < from) return i + 1;
  return i;
}

function RemovableChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 pl-3 pr-1 py-1 rounded-full text-xs font-medium bg-blue-500 border border-blue-500 text-white">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="text-white/70 hover:text-white transition-colors"
        aria-label={`Remove ${label}`}
      >
        <XCircleIcon size={16} weight="fill" />
      </button>
    </span>
  );
}

const fieldClass =
  'w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

function SkillsInput({
  skills,
  onAdd,
  onRemove,
}: {
  skills: string[];
  onAdd: (s: string) => void;
  onRemove: (s: string) => void;
}) {
  const [input, setInput] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [portalStyle, setPortalStyle] = useState<React.CSSProperties>({});
  const wrapperRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);

  const suggestions = CONFIG.skills_suggestions.filter(
    s =>
      !skills.includes(s) &&
      s.toLowerCase().includes(input.toLowerCase().trim()),
  );

  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      const inWrapper = wrapperRef.current?.contains(e.target as Node);
      const inPortal = portalRef.current?.contains(e.target as Node);
      if (!inWrapper && !inPortal) setDropdownOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  function openDropdown() {
    if (wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      setPortalStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
      });
    }
    setDropdownOpen(true);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const trimmed = input.trim().toLowerCase();
      if (trimmed && !skills.includes(trimmed)) onAdd(trimmed);
      setInput('');
      setDropdownOpen(false);
    } else if (e.key === 'Escape') {
      setDropdownOpen(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {skills.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {skills.map(s => (
            <RemovableChip key={s} label={s} onRemove={() => onRemove(s)} />
          ))}
        </div>
      )}
      <div ref={wrapperRef}>
        <input
          type="text"
          value={input}
          onChange={e => {
            setInput(e.target.value);
            openDropdown();
          }}
          onFocus={openDropdown}
          onKeyDown={handleKeyDown}
          placeholder="Type and press Enter or comma…"
          className={fieldClass}
        />
        {dropdownOpen &&
          suggestions.length > 0 &&
          createPortal(
            <div
              ref={portalRef}
              style={portalStyle}
              className="bg-white border border-gray-200 rounded-md shadow-md overflow-hidden"
            >
              {suggestions.map(s => (
                <button
                  key={s}
                  type="button"
                  onMouseDown={e => {
                    e.preventDefault();
                    onAdd(s);
                    setInput('');
                    setDropdownOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>,
            document.body,
          )}
      </div>
    </div>
  );
}

export default function OwnProjectsTab({ projects, onChange }: Props) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const dragFromIdx = useRef<number | null>(null);

  function addProject() {
    const idx = projects.length;
    onChange([
      ...projects,
      { name: '', url: '', skills: [], achievements: [] },
    ]);
    setExpanded(prev => new Set(prev).add(idx));
  }

  function updateProject(idx: number, patch: Partial<OwnProjectEntry>) {
    onChange(projects.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }

  function deleteProject(idx: number) {
    onChange(projects.filter((_, i) => i !== idx));
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
    const reordered = [...projects];
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
      {projects.length === 0 && (
        <p className="text-sm text-gray-400">No projects yet. Add one below.</p>
      )}

      {projects.map((project, idx) => {
        const isOpen = expanded.has(idx);
        const isDragTarget = dragOverIdx === idx;
        const isComplete = !!project.name?.trim();
        const achievements = project.achievements ?? [];
        const skills = project.skills ?? [];

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
                    {project.name || 'Untitled project'}
                  </p>
                  {project.url ? (
                    <p className="text-xs text-gray-500 truncate">
                      {project.url}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-400">No URL</p>
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
                onClick={() => deleteProject(idx)}
                aria-label="Delete project"
                className="shrink-0 text-red-400 hover:text-red-600 transition-colors p-1"
              >
                <Trash size={20} />
              </button>
            </div>

            {/* Expanded fields */}
            {isOpen && (
              <div className="px-3 pb-3 pt-2 border-t border-gray-100 flex flex-col gap-3">
                {/* Name */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-600">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows={2}
                    value={project.name}
                    onChange={e => updateProject(idx, { name: e.target.value })}
                    placeholder="e.g. Open Source CLI Tool"
                    className={`${fieldClass} resize-y`}
                  />
                </div>

                {/* URL */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-600">
                    URL
                  </label>
                  <input
                    type="text"
                    value={project.url ?? ''}
                    onChange={e => updateProject(idx, { url: e.target.value })}
                    placeholder="https://github.com/..."
                    className={fieldClass}
                  />
                </div>

                {/* Skills */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-600">
                    Skills used
                  </label>
                  <SkillsInput
                    skills={skills}
                    onAdd={s => updateProject(idx, { skills: [...skills, s] })}
                    onRemove={s =>
                      updateProject(idx, {
                        skills: skills.filter(x => x !== s),
                      })
                    }
                  />
                </div>

                {/* Achievements */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-600">
                    Achievements
                  </label>
                  <AchievementsList
                    achievements={achievements}
                    onChange={next =>
                      updateProject(idx, { achievements: next })
                    }
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={addProject}
        className="flex items-center gap-1.5 text-sm font-medium text-white px-3 py-2 rounded-md transition-colors w-fit bg-blue-600"
      >
        <Plus size={20} />
        Add project
      </button>
    </div>
  );
}

function AchievementsList({
  achievements,
  onChange,
}: {
  achievements: string[];
  onChange: (next: string[]) => void;
}) {
  const [dragOver, setDragOver] = useState<number | null>(null);
  const dragFrom = useRef<number | null>(null);

  function handleDragStart(i: number) {
    dragFrom.current = i;
  }

  function handleDragOver(e: React.DragEvent, i: number) {
    e.preventDefault();
    setDragOver(i);
  }

  function handleDrop(e: React.DragEvent, toIdx: number) {
    e.preventDefault();
    const fromIdx = dragFrom.current;
    if (fromIdx === null || fromIdx === toIdx) {
      setDragOver(null);
      return;
    }
    const next = [...achievements];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    onChange(next);
    dragFrom.current = null;
    setDragOver(null);
  }

  function handleDragEnd() {
    dragFrom.current = null;
    setDragOver(null);
  }

  return (
    <div className="flex flex-col gap-1.5">
      {achievements.map((ach, aIdx) => (
        <div
          key={aIdx}
          onDragOver={e => handleDragOver(e, aIdx)}
          onDrop={e => handleDrop(e, aIdx)}
          className={`flex items-start gap-1.5 rounded transition-colors ${
            dragOver === aIdx ? 'bg-blue-50' : ''
          }`}
        >
          <div
            draggable
            onDragStart={() => handleDragStart(aIdx)}
            onDragEnd={handleDragEnd}
            className="shrink-0 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-500 transition-colors mt-1.5"
            aria-label="Drag to reorder"
          >
            <DotsSixVertical size={20} />
          </div>
          <textarea
            rows={2}
            value={ach}
            onChange={e => {
              const next = [...achievements];
              next[aIdx] = e.target.value;
              onChange(next);
            }}
            placeholder="e.g. Reduced build time by 40%"
            className={`${fieldClass} resize-y`}
          />
          <button
            type="button"
            onClick={() => onChange(achievements.filter((_, i) => i !== aIdx))}
            aria-label="Remove achievement"
            className="shrink-0 text-red-400 hover:text-red-600 transition-colors mt-1.5"
          >
            <Trash size={20} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...achievements, ''])}
        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors w-fit"
      >
        <Plus size={16} />
        Add achievement
      </button>
    </div>
  );
}
