import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CaretDown, CaretRight, XCircle } from '@phosphor-icons/react';
import { API_BASE_URL } from '../../../config';

interface Props {
  skills: Record<string, string[]>;
  onChange: (skills: Record<string, string[]>) => void;
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
}: {
  category: string;
  skills: string[];
  isExpanded: boolean;
  onToggle: () => void;
  onAdd: (skill: string) => void;
  onRemove: (skill: string) => void;
}) {
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
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
          setSuggestions(
            (data.skills ?? []).filter((s: string) => !skills.includes(s)),
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

  function openDropdown() {
    if (wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
    setDropdownOpen(true);
  }

  function addSkill(skill: string) {
    onAdd(skill);
    setInput('');
    setSuggestions([]);
    setDropdownOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const val = input.trim();
    if ((e.key === 'Enter' || e.key === ',') && val) {
      e.preventDefault();
      addSkill(val);
    }
    if (e.key === 'Escape') setDropdownOpen(false);
  }

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
        {
          <span className="text-xs text-gray-400 shrink-0">
            {skills.length}
          </span>
        }
      </div>

      {/* Body */}
      {isExpanded && (
        <div className="px-3 pb-3 pt-2 border-t border-gray-100 flex flex-col gap-2">
          {skills.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {skills.map(skill => (
                <span
                  key={skill}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-600 text-white"
                >
                  {skill}
                  <button
                    type="button"
                    onClick={() => onRemove(skill)}
                    className="hover:text-blue-200 transition-colors"
                  >
                    <XCircle size={13} weight="fill" />
                  </button>
                </span>
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
              onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
              placeholder="Type to search or add skill…"
              className={inputClass}
            />
            {dropdownOpen &&
              !!input.trim() &&
              (loading || suggestions.length > 0) &&
              createPortal(
                <div
                  style={{
                    position: 'fixed',
                    top: dropdownPos.top,
                    left: dropdownPos.left,
                    width: dropdownPos.width,
                    zIndex: 9999,
                  }}
                  className="bg-white border border-gray-200 rounded-md shadow-lg max-h-44 overflow-y-auto"
                >
                  {loading ? (
                    <div className="flex items-center justify-center px-3 py-2.5">
                      <div className="w-4 h-4 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
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

export default function SkillsTab({ skills, onChange }: Props) {
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
        setExpanded(
          new Set(
            data.categories.filter(
              cat => (initialSkillsRef.current[cat]?.length ?? 0) > 0,
            ),
          ),
        );
        setLoading(false);
      })
      .catch((err: Error) => {
        setFetchError(`Failed to load categories: ${err.message}`);
        setLoading(false);
      });
  }, []);

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
    if (existing.includes(skill)) return;
    onChange({ ...skills, [cat]: [...existing, skill] });
  }

  function removeSkill(cat: string, skill: string) {
    onChange({
      ...skills,
      [cat]: (skills[cat] ?? []).filter(s => s !== skill),
    });
  }

  if (loading) {
    return <p className="text-sm text-gray-400">Loading categories…</p>;
  }

  if (fetchError) {
    return <p className="text-sm text-red-500">{fetchError}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {categories.map(cat => (
        <CategorySection
          key={cat}
          category={cat}
          skills={skills[cat] ?? []}
          isExpanded={expanded.has(cat)}
          onToggle={() => toggleExpand(cat)}
          onAdd={skill => addSkill(cat, skill)}
          onRemove={skill => removeSkill(cat, skill)}
        />
      ))}
    </div>
  );
}
