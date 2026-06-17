import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CaretDown,
  CaretRight,
  CheckCircle,
  CircleDashed,
  XCircle,
} from '@phosphor-icons/react';
import { API_BASE_URL } from '../../../config';
import Spinner from '../../Spinner';
import type { OfferSkill, SkillEntry } from '../types';

interface Props {
  skills: Record<string, SkillEntry[]>;
  onChange: (skills: Record<string, SkillEntry[]>) => void;
  offerSkills?: OfferSkill[];
  onDismissOfferSkill?: (skillName: string) => Promise<void>;
  openedFromBlueDot?: boolean;
}

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 41 }, (_, i) => CURRENT_YEAR - i);

function yearLabel(year: number): string {
  const n = CURRENT_YEAR - year;
  if (n === 0) return `${year} (< 1 yr)`;
  return `${year} (${n === 1 ? '1 yr' : `${n} yrs`})`;
}

const inputClass =
  'w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent';

function CategorySection({
  category,
  skills,
  isExpanded,
  onToggle,
  onAdd,
  onRemove,
  onUpdate,
  offerSkills,
  onDismissSkill,
}: {
  category: string;
  skills: SkillEntry[];
  isExpanded: boolean;
  onToggle: () => void;
  onAdd: (skill: string) => void;
  onRemove: (skill: string) => void;
  onUpdate: (skill: string, since: number) => void;
  offerSkills?: OfferSkill[];
  onDismissSkill?: (skillName: string) => Promise<void>;
}) {
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [suggOpen, setSuggOpen] = useState(false);
  const [suggPos, setSuggPos] = useState({ top: 0, left: 0, width: 0 });
  const [pickerSkill, setPickerSkill] = useState<string | null>(null);
  const [pickerPos, setPickerPos] = useState({ top: 0, left: 0 });
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trimmed = input.trim();
    if (!trimmed) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/v1/skills` +
            `?category=${encodeURIComponent(category)}` +
            `&q=${encodeURIComponent(trimmed)}`,
        );
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          const skillNames = skills.map(e => e.name);
          setSuggestions(
            (data.skills ?? []).filter((s: string) => !skillNames.includes(s)),
          );
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setSuggestions([]);
          setLoading(false);
        }
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [input, category, skills]);

  // Close year picker on any outside mousedown
  useEffect(() => {
    if (!pickerSkill) return;
    function handler() {
      setPickerSkill(null);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [pickerSkill]);

  function openSuggDropdown() {
    if (wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      setSuggPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
    setSuggOpen(true);
  }

  function addSkill(skill: string) {
    onAdd(skill);
    setInput('');
    setSuggestions([]);
    setSuggOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const val = input.trim();
    if ((e.key === 'Enter' || e.key === ',') && val) {
      e.preventDefault();
      addSkill(val);
    }
    if (e.key === 'Escape') setSuggOpen(false);
  }

  function openYearPicker(
    skill: string,
    e: React.MouseEvent<HTMLButtonElement>,
  ) {
    const rect = e.currentTarget.getBoundingClientRect();
    setPickerPos({ top: rect.bottom + 4, left: rect.left });
    setPickerSkill(skill);
  }

  const [dismissError, setDismissError] = useState<string | null>(null);

  async function handleDismiss(skillName: string) {
    try {
      await onDismissSkill?.(skillName);
      setDismissError(null);
    } catch {
      setDismissError('Failed to dismiss. Try again.');
    }
  }

  const missingCount = skills.filter(s => s.since === null).length;
  const isEmpty = skills.length === 0;
  const allFilled = !isEmpty && missingCount === 0;
  const pendingOfferSkills = offerSkills ?? [];

  return (
    <div className="border border-gray-200 rounded-lg bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={e => e.key === 'Enter' && onToggle()}
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors"
      >
        {isExpanded ? (
          <CaretDown size={16} className="text-gray-400 shrink-0" />
        ) : (
          <CaretRight size={16} className="text-gray-400 shrink-0" />
        )}
        <span className="text-sm font-medium text-gray-900 flex-1 capitalize">
          {category.replace(/_/g, ' ')}
        </span>
        <span className="text-xs text-gray-400 shrink-0">{skills.length}</span>
        {isEmpty && (
          <CircleDashed
            size={24}
            weight="fill"
            className="text-gray-300 shrink-0"
          />
        )}
        {allFilled && (
          <CheckCircle
            size={24}
            weight="fill"
            className="text-green-500 shrink-0"
          />
        )}
        {!isEmpty && missingCount > 0 && (
          <span
            className="inline-flex items-center justify-center rounded-full bg-red-500 text-white leading-none shrink-0"
            style={{ fontSize: 8, width: 16, height: 16 }}
          >
            {missingCount}
          </span>
        )}
        {pendingOfferSkills.length > 0 && (
          <span
            className="inline-flex items-center justify-center rounded-full bg-orange-400 text-white leading-none shrink-0"
            style={{ fontSize: 8, width: 16, height: 16 }}
          >
            {pendingOfferSkills.length}
          </span>
        )}
      </div>

      {/* Body */}
      {isExpanded && (
        <div className="px-3 pb-3 pt-2 border-t border-gray-100 flex flex-col gap-2">
          {pendingOfferSkills.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-orange-400 font-medium">
                Suggested skills from job offers
              </span>
              <div className="flex flex-wrap gap-1.5">
                {pendingOfferSkills.map(s => (
                  <span
                    key={s.name}
                    className="inline-flex items-center rounded-full text-xs font-medium bg-orange-100 text-orange-700 border border-orange-200 overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onAdd(s.name);
                        void handleDismiss(s.name);
                      }}
                      className="flex items-center gap-1 pl-2.5 py-1 hover:bg-orange-200 transition-colors"
                    >
                      <span>{s.name}</span>
                      {s.count > 1 && (
                        <span className="opacity-60 text-[10px]">
                          ·{s.count}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDismiss(s.name)}
                      title="Dismiss"
                      className="px-2 py-1 hover:bg-orange-200 transition-colors opacity-60 hover:opacity-100 text-sm leading-none"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              {dismissError && (
                <p className="text-xs text-red-500">{dismissError}</p>
              )}
            </div>
          )}
          {skills.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {skills.map(entry => (
                <span
                  key={entry.name}
                  className="inline-flex items-center rounded-full text-xs font-medium bg-blue-600 text-white overflow-hidden"
                >
                  {/* Clickable body — opens year picker */}
                  <button
                    type="button"
                    onClick={e => openYearPicker(entry.name, e)}
                    className="flex items-center gap-1 pl-2.5 py-1 hover:bg-blue-500 transition-colors"
                  >
                    <span>{entry.name}</span>
                    <span className="opacity-60">·</span>
                    <span>{entry.since ?? '?'}</span>
                    {entry.since === null && (
                      <XCircle
                        size={12}
                        weight="fill"
                        className="text-red-300"
                      />
                    )}
                  </button>
                  {/* Remove button */}
                  <button
                    type="button"
                    onClick={() => onRemove(entry.name)}
                    className="px-2 py-1 hover:bg-blue-500 transition-colors opacity-70 hover:opacity-100 text-sm leading-none"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Year picker portal */}
          {pickerSkill !== null &&
            createPortal(
              <div
                onMouseDown={e => e.stopPropagation()}
                style={{
                  position: 'fixed',
                  top: pickerPos.top,
                  left: pickerPos.left,
                  minWidth: 170,
                  zIndex: 9999,
                }}
                className="bg-white border border-gray-200 rounded-md shadow-lg max-h-44 overflow-y-auto"
              >
                {YEARS.map(year => (
                  <button
                    key={year}
                    type="button"
                    onMouseDown={() => {
                      onUpdate(pickerSkill, year);
                      setPickerSkill(null);
                    }}
                    className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-blue-50 transition-colors"
                  >
                    {yearLabel(year)}
                  </button>
                ))}
              </div>,
              document.body,
            )}

          {/* Autocomplete input */}
          <div ref={wrapperRef}>
            <input
              type="text"
              value={input}
              onChange={e => {
                setInput(e.target.value);
                openSuggDropdown();
              }}
              onFocus={openSuggDropdown}
              onKeyDown={handleKeyDown}
              onBlur={() => setTimeout(() => setSuggOpen(false), 150)}
              placeholder="Type to search or add skill…"
              className={inputClass}
            />
            {suggOpen &&
              !!input.trim() &&
              (loading || suggestions.length > 0) &&
              createPortal(
                <div
                  style={{
                    position: 'fixed',
                    top: suggPos.top,
                    left: suggPos.left,
                    width: suggPos.width,
                    zIndex: 9999,
                  }}
                  className="bg-white border border-gray-200 rounded-md shadow-lg max-h-44 overflow-y-auto"
                >
                  {loading ? (
                    <div className="flex items-center justify-center px-3 py-2.5">
                      <Spinner className="text-blue-500" />
                    </div>
                  ) : (
                    suggestions.map(s => (
                      <button
                        key={s}
                        type="button"
                        onMouseDown={() => addSkill(s)}
                        className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-blue-50 transition-colors"
                      >
                        <span className="text-sm text-gray-700">{s}</span>
                      </button>
                    ))
                  )}
                </div>,
                document.body,
              )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SkillsTab({
  skills,
  onChange,
  offerSkills,
  onDismissOfferSkill,
  openedFromBlueDot,
}: Props) {
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const initialSkillsRef = useRef(skills);

  useEffect(() => {
    fetch(`${API_BASE_URL}/v1/skill-categories`)
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then((data: { categories: string[] }) => {
        setCategories(data.categories);
        if (!openedFromBlueDot) {
          setExpanded(prev => {
            const next = new Set(
              data.categories.filter(
                cat => (initialSkillsRef.current[cat]?.length ?? 0) > 0,
              ),
            );
            prev.forEach(c => next.add(c));
            return next;
          });
        }
        setLoading(false);
      })
      .catch((err: Error) => {
        setFetchError(`Failed to load categories: ${err.message}`);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!categories.length) return;
    const catsWithSuggestions = new Set(
      (offerSkills ?? []).map(s => s.category_name),
    );
    if (openedFromBlueDot) {
      setExpanded(catsWithSuggestions);
    } else if (catsWithSuggestions.size > 0) {
      setExpanded(prev => {
        const next = new Set(prev);
        catsWithSuggestions.forEach(c => next.add(c));
        return next;
      });
    }
  }, [categories, offerSkills]);

  function toggleExpand(cat: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  function addSkill(cat: string, skill: string) {
    const existing = skills[cat] ?? [];
    if (existing.some(e => e.name === skill)) return;
    onChange({ ...skills, [cat]: [...existing, { name: skill, since: null }] });
  }

  function removeSkill(cat: string, skill: string) {
    onChange({
      ...skills,
      [cat]: (skills[cat] ?? []).filter(e => e.name !== skill),
    });
  }

  function updateSkillSince(cat: string, skill: string, since: number) {
    onChange({
      ...skills,
      [cat]: (skills[cat] ?? []).map(e =>
        e.name === skill ? { ...e, since } : e,
      ),
    });
  }

  if (loading) {
    return <p className="text-sm text-gray-400">Loading categories…</p>;
  }

  if (fetchError) {
    return <p className="text-sm text-red-500">{fetchError}</p>;
  }

  const totalSkillsCount = Object.values(skills).flat().length;

  return (
    <div className="flex flex-col gap-2">
      {totalSkillsCount < 5 && (
        <div className="flex items-center gap-2">
          <p className="text-sm text-gray-500">
            You have to add at least 5 skills to get matched with job offers.
          </p>
          <XCircle size={16} weight="fill" className="shrink-0 text-red-400" />
        </div>
      )}
      {categories.map(cat => {
        const existingNames = new Set((skills[cat] ?? []).map(e => e.name));
        const catOfferSkills = (offerSkills ?? []).filter(
          s =>
            s.category_name?.toLowerCase() === cat.toLowerCase() &&
            !existingNames.has(s.name),
        );
        return (
          <CategorySection
            key={cat}
            category={cat}
            skills={skills[cat] ?? []}
            isExpanded={expanded.has(cat)}
            onToggle={() => toggleExpand(cat)}
            onAdd={skill => addSkill(cat, skill)}
            onRemove={skill => removeSkill(cat, skill)}
            onUpdate={(skill, since) => updateSkillSince(cat, skill, since)}
            offerSkills={catOfferSkills}
            onDismissSkill={onDismissOfferSkill ? skillName => onDismissOfferSkill(skillName) : undefined}
          />
        );
      })}
    </div>
  );
}
