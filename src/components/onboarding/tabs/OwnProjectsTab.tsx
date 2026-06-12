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
import { API_BASE_URL } from '../../../config';
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

function UrlList({
  urls,
  onChange,
}: {
  urls: Array<{ label: string; url: string }>;
  onChange: (next: Array<{ label: string; url: string }>) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {urls.map((u, i) => (
        <div key={i} className="flex flex-col gap-1">
          <input
            type="text"
            value={u.label}
            onChange={e => {
              const next = [...urls];
              next[i] = { ...u, label: e.target.value };
              onChange(next);
            }}
            placeholder="e.g. GitHub, npm, ProductHunt, Live app…"
            className={fieldClass}
          />
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={u.url}
              onChange={e => {
                const next = [...urls];
                next[i] = { ...u, url: e.target.value };
                onChange(next);
              }}
              placeholder="https://..."
              className={`${fieldClass} flex-1`}
            />
            {isUrlInvalid(u.url) && (
              <XCircle size={16} weight="fill" className="shrink-0 text-red-400" />
            )}
            <button
              type="button"
              onClick={() => onChange(urls.filter((_, j) => j !== i))}
              aria-label="Remove URL"
              className="shrink-0 text-red-400 hover:text-red-600 transition-colors"
            >
              <Trash size={16} />
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...urls, { label: '', url: '' }])}
        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors w-fit"
      >
        <Plus size={16} />
        Add URL
      </button>
    </div>
  );
}

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
  const [results, setResults] = useState<{ name: string; category: string }[]>(
    [],
  );
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = input.trim();
    if (!q) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/v1/skills/search?q=${encodeURIComponent(q)}`,
        );
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setResults(
            (data.skills ?? []).filter(
              (s: { name: string }) => !skills.includes(s.name),
            ),
          );
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setResults([]);
          setLoading(false);
        }
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [input, skills]);

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
      const trimmed = input.trim();
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
          !!input.trim() &&
          (loading || results.length > 0) &&
          createPortal(
            <div
              ref={portalRef}
              style={portalStyle}
              className="bg-white border border-gray-200 rounded-md shadow-md max-h-44 overflow-y-auto"
            >
              {loading ? (
                <div className="flex items-center justify-center px-3 py-2.5">
                  <div className="w-4 h-4 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
                </div>
              ) : (
                results.map(r => (
                  <button
                    key={r.name}
                    type="button"
                    onMouseDown={e => {
                      e.preventDefault();
                      onAdd(r.name);
                      setInput('');
                      setDropdownOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 flex items-center justify-between gap-2 hover:bg-blue-50 transition-colors"
                  >
                    <span className="text-sm text-gray-700">{r.name}</span>
                    <span className="text-xs text-gray-400 shrink-0">
                      {r.category}
                    </span>
                  </button>
                ))
              )}
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
      { name: '', urls: [], skills: [], achievements: [] },
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
        const achievements = project.achievements ?? [];
        const skills = project.skills ?? [];
        const invalidCount =
          (!project.name?.trim() ? 1 : 0) +
          (achievements.length === 0
            ? 1
            : achievements.filter(a => !a.trim()).length);

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
                  {(project.urls ?? []).length > 0 ? (
                    <p className="text-xs text-gray-500 truncate">
                      {project.urls![0].url || project.urls![0].label || 'URL added'}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-400">No URLs</p>
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
                  <div className="flex items-start gap-1.5">
                    <textarea
                      rows={2}
                      value={project.name}
                      onChange={e => updateProject(idx, { name: e.target.value })}
                      placeholder="e.g. Open Source CLI Tool"
                      className={`${fieldClass} resize-y flex-1`}
                    />
                    {!project.name?.trim() && (
                      <XCircle size={16} weight="fill" className="shrink-0 text-red-400 mt-1.5" />
                    )}
                  </div>
                </div>

                {/* URLs */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-600">
                    URLs
                  </label>
                  <UrlList
                    urls={project.urls ?? []}
                    onChange={next => updateProject(idx, { urls: next })}
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
                  <div className="flex items-center gap-1">
                    <label className="text-xs font-medium text-gray-600">
                      Achievements <span className="text-red-500">*</span>
                    </label>
                    {achievements.length === 0 && (
                      <XCircle size={14} weight="fill" className="text-red-400" />
                    )}
                  </div>
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
        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors w-fit"
      >
        <Plus size={16} />
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
            className={`${fieldClass} resize-y flex-1`}
          />
          {!ach.trim() && (
            <XCircle size={16} weight="fill" className="shrink-0 text-red-400 mt-1.5" />
          )}
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
