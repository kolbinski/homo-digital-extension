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
import { API_BASE_URL } from '../../../config';
import { useGeneralSettings } from '../../../store/generalSettingsStore';
import Spinner from '../../Spinner';
import type { ProjectEntry, WorkExperienceEntry } from '../types';

interface Props {
  workExperience: WorkExperienceEntry[];
  onChange: (entries: WorkExperienceEntry[]) => void;
}

const fieldClass =
  'w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const TEAM_SIZE_OPTIONS = [
  '1',
  '2-5',
  '6-10',
  '11-20',
  '21-50',
  '51-200',
  '201-1000',
  '1000+',
];

function emptyProject(): ProjectEntry {
  return {
    name: '',
    role: null,
    skills: [],
    team_size: null,
    achievements: [],
  };
}

function emptyExperience(): WorkExperienceEntry {
  return {
    title: '',
    company: '',
    date_from: '',
    date_to: null,
    currently_working: false,
    industry: null,
    location: null,
    work_model: null,
    company_type: null,
    projects: [emptyProject()],
  };
}

function countExpInvalid(e: WorkExperienceEntry): number {
  let count = 0;
  if (!e.title?.trim()) count++;
  if (!e.company?.trim()) count++;
  if (!DATE_RE.test(e.date_from ?? '')) count++;
  if (!e.currently_working && !DATE_RE.test(e.date_to ?? '')) count++;
  if (!e.work_model) count++;
  const projects = e.projects ?? [];
  for (const proj of projects) {
    if (projects.length > 1 && !proj.name?.trim()) count++;
    if (!proj.role?.trim()) count++;
    const achievements = proj.achievements ?? [];
    if (achievements.length === 0) {
      count++;
    } else {
      count += achievements.filter(a => !a.trim()).length;
    }
  }
  return count;
}

function reorderArr<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

// ── Chip ──────────────────────────────────────────────────────────────────────
function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
        selected
          ? 'bg-blue-600 text-white'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {label}
    </button>
  );
}

// ── RemovableChip ─────────────────────────────────────────────────────────────
function RemovableChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-600 text-white">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="hover:text-blue-200 transition-colors"
      >
        <XCircle size={13} weight="fill" />
      </button>
    </span>
  );
}

// ── SkillsSearchInput ─────────────────────────────────────────────────────────
function SkillsSearchInput({
  skills,
  onAdd,
  onRemove,
}: {
  skills: string[];
  onAdd: (s: string) => void;
  onRemove: (s: string) => void;
}) {
  const [input, setInput] = useState('');
  const [results, setResults] = useState<{ name: string; category: string }[]>(
    [],
  );
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);

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
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [input, skills]);

  function measure() {
    if (wrapRef.current) {
      const r = wrapRef.current.getBoundingClientRect();
      setPos({ top: r.bottom, left: r.left, width: r.width });
    }
  }

  function addSkill(name: string) {
    onAdd(name);
    setInput('');
    setResults([]);
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
      e.preventDefault();
      const name = input.trim();
      if (!skills.includes(name)) onAdd(name);
      setInput('');
      setOpen(false);
    }
    if (e.key === 'Escape') setOpen(false);
  }

  const showDropdown = open && input.trim().length > 0;

  return (
    <div className="flex flex-col gap-2">
      {skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {skills.map(s => (
            <RemovableChip key={s} label={s} onRemove={() => onRemove(s)} />
          ))}
        </div>
      )}
      <div ref={wrapRef}>
        <input
          type="text"
          value={input}
          onChange={e => {
            setInput(e.target.value);
            measure();
            setOpen(true);
          }}
          onFocus={() => {
            measure();
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Type to search skills…"
          className={fieldClass}
        />
        {showDropdown &&
          createPortal(
            <div
              style={{
                position: 'fixed',
                top: pos.top,
                left: pos.left,
                width: pos.width,
                zIndex: 9999,
              }}
              className="bg-white border border-gray-200 rounded-md shadow-lg max-h-44 overflow-y-auto"
            >
              {loading ? (
                <div className="flex items-center justify-center px-3 py-2.5">
                  <Spinner className="text-blue-500" />
                </div>
              ) : results.length === 0 ? (
                <p className="px-3 py-2 text-sm text-gray-400">No results</p>
              ) : (
                results.map(r => (
                  <button
                    key={`${r.category}:${r.name}`}
                    type="button"
                    onMouseDown={() => addSkill(r.name)}
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

// ── AchievementsList ──────────────────────────────────────────────────────────
function AchievementsList({
  achievements,
  onChange,
}: {
  achievements: string[];
  onChange: (next: string[]) => void;
}) {
  const [dragOver, setDragOver] = useState<number | null>(null);
  const dragFrom = useRef<number | null>(null);

  return (
    <div className="flex flex-col gap-1.5">
      {achievements.map((ach, i) => (
        <div
          key={i}
          onDragOver={e => {
            e.preventDefault();
            setDragOver(i);
          }}
          onDrop={e => {
            e.preventDefault();
            const from = dragFrom.current;
            if (from === null || from === i) {
              setDragOver(null);
              return;
            }
            onChange(reorderArr(achievements, from, i));
            dragFrom.current = null;
            setDragOver(null);
          }}
          className={`flex items-start gap-1.5 rounded transition-colors ${
            dragOver === i ? 'bg-blue-50' : ''
          }`}
        >
          <div
            draggable
            onDragStart={() => {
              dragFrom.current = i;
            }}
            onDragEnd={() => {
              dragFrom.current = null;
              setDragOver(null);
            }}
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
              next[i] = e.target.value;
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
            onClick={() => onChange(achievements.filter((_, j) => j !== i))}
            aria-label="Remove achievement"
            className="shrink-0 text-red-400 hover:text-red-600 transition-colors mt-1.5"
          >
            <Trash size={18} />
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

// ── ProjectCard ───────────────────────────────────────────────────────────────
function ProjectCard({
  project,
  isOnly,
  requireName,
  onChange,
  onRemove,
  onDragStart,
  onDragEnd,
}: {
  project: ProjectEntry;
  isOnly: boolean;
  requireName: boolean;
  onChange: (patch: Partial<ProjectEntry>) => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const [open, setOpen] = useState(isOnly);
  const nameInvalid = requireName && !project.name.trim();
  const roleInvalid = !project.role?.trim();
  const achievementsInvalid =
    project.achievements.length === 0 ||
    project.achievements.some(a => !a.trim());
  const projInvalid = nameInvalid || roleInvalid || achievementsInvalid;

  return (
    <div className="border border-gray-200 rounded-md bg-gray-50 overflow-hidden">
      {/* Project header */}
      <div className="flex items-center gap-1 px-2 py-2">
        {/* Drag handle */}
        {!isOnly && (
          <div
            draggable
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            className="shrink-0 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-500 transition-colors p-0.5"
            aria-label="Drag to reorder"
          >
            <DotsSixVertical size={16} />
          </div>
        )}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setOpen(o => !o)}
          onKeyDown={e => e.key === 'Enter' && setOpen(o => !o)}
          className="flex flex-1 items-center gap-1.5 cursor-pointer min-w-0"
        >
          {open ? (
            <CaretDown size={16} className="text-gray-400 shrink-0" />
          ) : (
            <CaretRight size={16} className="text-gray-400 shrink-0" />
          )}
          <span className="text-xs font-medium text-gray-700 truncate flex-1">
            {project.name.trim() || 'Untitled project'}
          </span>
        </div>
        {projInvalid ? (
          <XCircle size={16} weight="fill" className="shrink-0 text-red-400" />
        ) : (
          <CheckCircle
            size={16}
            weight="fill"
            className="shrink-0 text-green-500"
          />
        )}
        {!isOnly && (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove project"
            className="shrink-0 text-red-400 hover:text-red-600 transition-colors ml-1"
          >
            <Trash size={16} />
          </button>
        )}
      </div>

      {open && (
        <div className="px-3 pb-3 pt-2 border-t border-gray-200 flex flex-col gap-3">
          {/* Name */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">
              Project name
              {requireName && <span className="text-red-500 ml-0.5">*</span>}
            </label>
            <div className="flex items-start gap-1.5">
              <textarea
                rows={2}
                value={project.name}
                onChange={e => onChange({ name: e.target.value })}
                placeholder="e.g. Customer portal redesign"
                className={`${fieldClass} resize-y flex-1`}
              />
              {nameInvalid && (
                <XCircle size={16} weight="fill" className="shrink-0 text-red-400 mt-1.5" />
              )}
            </div>
          </div>

          {/* Role */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">
              Role <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={project.role ?? ''}
                onChange={e => onChange({ role: e.target.value || null })}
                placeholder="e.g. Tech Lead"
                className={`${fieldClass} flex-1`}
              />
              {roleInvalid && (
                <XCircle
                  size={16}
                  weight="fill"
                  className="shrink-0 text-red-400"
                />
              )}
            </div>
          </div>

          {/* Team size */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">
              Team size
            </label>
            <select
              value={project.team_size ?? ''}
              onChange={e => onChange({ team_size: e.target.value || null })}
              className="w-32 px-2 py-1.5 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
            >
              <option value="">—</option>
              {TEAM_SIZE_OPTIONS.map(o => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>

          {/* Skills */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">Skills</label>
            <SkillsSearchInput
              skills={project.skills}
              onAdd={s => onChange({ skills: [...project.skills, s] })}
              onRemove={s =>
                onChange({ skills: project.skills.filter(x => x !== s) })
              }
            />
          </div>

          {/* Achievements */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-medium text-gray-600">
                Achievements <span className="text-red-500">*</span>
              </label>
              {achievementsInvalid && (
                <XCircle
                  size={14}
                  weight="fill"
                  className="shrink-0 text-red-400"
                />
              )}
            </div>
            <AchievementsList
              achievements={project.achievements}
              onChange={achievements => onChange({ achievements })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── ExperienceCard ────────────────────────────────────────────────────────────
function ExperienceCard({
  entry,
  onChange,
  onRemove,
  onDragStart,
  onDragEnd,
}: {
  entry: WorkExperienceEntry;
  onChange: (patch: Partial<WorkExperienceEntry>) => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [industryInput, setIndustryInput] = useState('');
  const [projDragOver, setProjDragOver] = useState<number | null>(null);
  const projDragFrom = useRef<number | null>(null);

  const { settings } = useGeneralSettings();
  const companyTypes = settings?.company_types ?? [];
  const industryOptions = settings?.industries ?? [];

  const invalidCount = countExpInvalid(entry);
  const projects = entry.projects ?? [emptyProject()];

  const dateLabel = entry.date_from
    ? `${entry.date_from} → ${entry.currently_working ? 'present' : (entry.date_to ?? '')}`
    : '';

  function setIndustry(val: string | null) {
    onChange({ industry: val });
    setIndustryInput('');
  }

  function handleIndustryKey(e: React.KeyboardEvent<HTMLInputElement>) {
    const val = industryInput.trim();
    if ((e.key === 'Enter' || e.key === ',') && val) {
      e.preventDefault();
      setIndustry(val);
    }
  }

  function updateProject(idx: number, patch: Partial<ProjectEntry>) {
    onChange({
      projects: projects.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    });
  }

  function addProject() {
    onChange({ projects: [...projects, emptyProject()] });
  }

  function removeProject(idx: number) {
    if (projects.length <= 1) return;
    onChange({ projects: projects.filter((_, i) => i !== idx) });
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      {/* Card header */}
      <div className={`flex items-center gap-1 px-2 py-2.5 sticky top-0 z-10 bg-white rounded-t-lg${open ? ' border-b border-gray-200' : ''}`}>
        {/* Drag handle */}
        <div
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          className="shrink-0 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-500 transition-colors p-0.5"
          aria-label="Drag to reorder"
        >
          <DotsSixVertical size={20} />
        </div>
        <div
          role="button"
          tabIndex={0}
          onClick={() => setOpen(o => !o)}
          onKeyDown={e => e.key === 'Enter' && setOpen(o => !o)}
          className="flex flex-1 items-center gap-1.5 cursor-pointer min-w-0"
        >
          {open ? (
            <CaretDown size={20} className="text-gray-400 shrink-0" />
          ) : (
            <CaretRight size={20} className="text-gray-400 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {entry.title.trim() || 'Untitled experience'}
            </p>
            {entry.company.trim() && (
              <p className="text-xs text-gray-400 truncate">
                {entry.company.trim()}
              </p>
            )}
            {dateLabel && <p className="text-xs text-gray-400">{dateLabel}</p>}
          </div>
        </div>
        <span className="shrink-0 p-0.5">
          {invalidCount === 0 ? (
            <CheckCircle size={20} weight="fill" className="text-green-500" />
          ) : (
            <span
              className="inline-flex items-center justify-center rounded-full bg-red-500 text-white leading-none"
              style={{ fontSize: 9, width: 18, height: 18 }}
            >
              {invalidCount}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Delete experience"
          className="shrink-0 text-red-400 hover:text-red-600 transition-colors p-1"
        >
          <Trash size={20} />
        </button>
      </div>

      {open && (
        <div className="px-3 pb-4 pt-2 border-t border-gray-100 flex flex-col gap-3">
          {/* Title */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">
              Title <span className="text-red-500">*</span>
            </label>
            <div className="flex items-start gap-1.5">
              <textarea
                rows={2}
                value={entry.title}
                onChange={e => onChange({ title: e.target.value })}
                placeholder="e.g. Senior Frontend Engineer"
                className={`${fieldClass} resize-y flex-1`}
              />
              {!entry.title.trim() && (
                <XCircle size={16} weight="fill" className="shrink-0 text-red-400 mt-1.5" />
              )}
            </div>
          </div>

          {/* Company */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">
              Company <span className="text-red-500">*</span>
            </label>
            <div className="flex items-start gap-1.5">
              <textarea
                rows={2}
                value={entry.company}
                onChange={e => onChange({ company: e.target.value })}
                placeholder="e.g. Acme Corp"
                className={`${fieldClass} resize-y flex-1`}
              />
              {!entry.company.trim() && (
                <XCircle size={16} weight="fill" className="shrink-0 text-red-400 mt-1.5" />
              )}
            </div>
          </div>

          {/* Dates */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">
              Date from <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={entry.date_from}
                onChange={e => onChange({ date_from: e.target.value })}
                placeholder="YYYY-MM"
                className={`${fieldClass} flex-1`}
              />
              {!DATE_RE.test(entry.date_from) && (
                <XCircle
                  size={16}
                  weight="fill"
                  className="shrink-0 text-red-400"
                />
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 cursor-pointer w-fit">
              <input
                type="checkbox"
                checked={entry.currently_working ?? false}
                onChange={e =>
                  onChange({
                    currently_working: e.target.checked,
                    date_to: e.target.checked ? null : '',
                  })
                }
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-xs text-gray-600">
                I currently work here
              </span>
            </label>
            {!entry.currently_working && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-600">
                  Date to <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={entry.date_to ?? ''}
                    onChange={e => onChange({ date_to: e.target.value })}
                    placeholder="YYYY-MM"
                    className={`${fieldClass} flex-1`}
                  />
                  {!DATE_RE.test(entry.date_to ?? '') && (
                    <XCircle
                      size={16}
                      weight="fill"
                      className="shrink-0 text-red-400"
                    />
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Location */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">
              Location
            </label>
            <input
              type="text"
              value={entry.location ?? ''}
              onChange={e => onChange({ location: e.target.value || null })}
              placeholder="e.g. Warsaw, PL"
              className={fieldClass}
            />
          </div>

          {/* Work model */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">
              Work model <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-1.5">
              {(
                [
                  ['remote', 'Remote'],
                  ['hybrid', 'Hybrid'],
                  ['office', 'Office'],
                ] as const
              ).map(([val, label]) => (
                <Chip
                  key={val}
                  label={label}
                  selected={entry.work_model === val}
                  onClick={() =>
                    onChange({
                      work_model: entry.work_model === val ? null : val,
                    })
                  }
                />
              ))}
              {!entry.work_model && (
                <XCircle size={16} weight="fill" className="shrink-0 text-red-400" />
              )}
            </div>
          </div>

          {/* Company type */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">
              Company type
            </label>
            <div className="flex flex-wrap gap-1.5">
              {companyTypes.map(ct => (
                <Chip
                  key={ct}
                  label={ct.replace(/_/g, ' ')}
                  selected={entry.company_type === ct}
                  onClick={() =>
                    onChange({
                      company_type: entry.company_type === ct ? null : ct,
                    })
                  }
                />
              ))}
            </div>
          </div>

          {/* Industry */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">
              Industry
            </label>
            <div className="flex flex-wrap gap-1.5 mb-1">
              {industryOptions.map(ind => (
                <Chip
                  key={ind}
                  label={ind.replace(/_/g, ' ')}
                  selected={entry.industry === ind}
                  onClick={() =>
                    onChange({
                      industry: entry.industry === ind ? null : ind,
                    })
                  }
                />
              ))}
              {entry.industry && !industryOptions.includes(entry.industry) && (
                <RemovableChip
                  label={entry.industry}
                  onRemove={() => onChange({ industry: null })}
                />
              )}
            </div>
            {!entry.industry && (
              <input
                type="text"
                value={industryInput}
                onChange={e => setIndustryInput(e.target.value)}
                onKeyDown={handleIndustryKey}
                placeholder="Add custom industry, Enter to add"
                className={fieldClass}
              />
            )}
          </div>

          {/* Projects */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Projects
            </span>
            <div className="flex flex-col gap-2">
              {projects.map((proj, pi) => (
                <div
                  key={pi}
                  onDragOver={e => {
                    e.preventDefault();
                    setProjDragOver(pi);
                  }}
                  onDrop={e => {
                    e.preventDefault();
                    const from = projDragFrom.current;
                    if (from === null || from === pi) {
                      setProjDragOver(null);
                      return;
                    }
                    onChange({ projects: reorderArr(projects, from, pi) });
                    projDragFrom.current = null;
                    setProjDragOver(null);
                  }}
                  className={`rounded transition-colors ${
                    projDragOver === pi ? 'bg-blue-50' : ''
                  }`}
                >
                  <ProjectCard
                    project={proj}
                    isOnly={projects.length === 1}
                    requireName={projects.length > 1}
                    onChange={patch => updateProject(pi, patch)}
                    onRemove={() => removeProject(pi)}
                    onDragStart={() => {
                      projDragFrom.current = pi;
                    }}
                    onDragEnd={() => {
                      projDragFrom.current = null;
                      setProjDragOver(null);
                    }}
                  />
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addProject}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors w-fit"
            >
              <Plus size={16} />
              Add project
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── WorkExperienceTab ─────────────────────────────────────────────────────────
export default function WorkExperienceTab({ workExperience, onChange }: Props) {
  const [dragOver, setDragOver] = useState<number | null>(null);
  const dragFrom = useRef<number | null>(null);

  function addExperience() {
    onChange([...workExperience, emptyExperience()]);
  }

  function updateExperience(idx: number, patch: Partial<WorkExperienceEntry>) {
    onChange(
      workExperience.map((e, i) => (i === idx ? { ...e, ...patch } : e)),
    );
  }

  function removeExperience(idx: number) {
    onChange(workExperience.filter((_, i) => i !== idx));
  }

  return (
    <div className="flex flex-col gap-3">
      {workExperience.length === 0 && (
        <div className="flex items-center gap-2">
          <p className="text-sm text-gray-400">
            No work experience yet. Add one below.
          </p>
          <XCircle size={16} weight="fill" className="shrink-0 text-red-400" />
        </div>
      )}

      {workExperience.map((entry, idx) => (
        <div
          key={idx}
          onDragOver={e => {
            e.preventDefault();
            setDragOver(idx);
          }}
          onDrop={e => {
            e.preventDefault();
            const from = dragFrom.current;
            if (from === null || from === idx) {
              setDragOver(null);
              return;
            }
            onChange(reorderArr(workExperience, from, idx));
            dragFrom.current = null;
            setDragOver(null);
          }}
          className={`rounded transition-colors ${
            dragOver === idx ? 'bg-blue-50' : ''
          }`}
        >
          <ExperienceCard
            entry={entry}
            onChange={patch => updateExperience(idx, patch)}
            onRemove={() => removeExperience(idx)}
            onDragStart={() => {
              dragFrom.current = idx;
            }}
            onDragEnd={() => {
              dragFrom.current = null;
              setDragOver(null);
            }}
          />
        </div>
      ))}

      <button
        type="button"
        onClick={addExperience}
        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors w-fit"
      >
        <Plus size={16} />
        Add experience
      </button>
    </div>
  );
}
