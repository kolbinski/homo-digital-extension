import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DotsSixVertical, Plus, Trash, XCircle } from '@phosphor-icons/react';
import { API_BASE_URL } from '../../../config';
import { useGeneralSettings } from '../../../store/generalSettingsStore';
import Spinner from '../../Spinner';
import type { ProfilePreferences } from '../types';

interface Props {
  preferences: ProfilePreferences;
  onChange: (preferences: ProfilePreferences) => void;
  preferredCurrency?: string;
}

const inputClass =
  'w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

const selectClass =
  'px-2 py-1.5 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white';

function Section({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {title}
        </h3>
        {badge}
      </div>
      {children}
    </div>
  );
}

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

function toggle(arr: string[], val: string): string[] {
  return arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val];
}

function labelFor(val: string): string {
  return val.replace(/_/g, ' ');
}

export default function PreferencesTab({
  preferences: prefs,
  onChange,
  preferredCurrency,
}: Props) {
  const [cityInput, setCityInput] = useState('');
  const [industryInput, setIndustryInput] = useState('');
  const [skillInput, setSkillInput] = useState('');
  const [skillDropdownOpen, setSkillDropdownOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({
    top: 0,
    left: 0,
    width: 0,
  });
  const [skillLoading, setSkillLoading] = useState(false);
  const [skillResults, setSkillResults] = useState<
    { name: string; category: string }[]
  >([]);
  const skillWrapperRef = useRef<HTMLDivElement>(null);
  const roleDragFrom = useRef<number | null>(null);
  const [roleDragOver, setRoleDragOver] = useState<number | null>(null);

  const { settings } = useGeneralSettings();
  const currencies = settings?.currencies ?? [];
  const companyTypes = settings?.company_types ?? [];
  const industries = settings?.industries ?? [];
  const markets = settings?.markets ?? [];

  const showOfficeFields =
    prefs.work_model.includes('hybrid') || prefs.work_model.includes('office');

  // ── Salary ──────────────────────────────────────────────────────────────
  const contractEntry = prefs.salary.find(s => s.type === 'contract');
  const permanentEntry = prefs.salary.find(s => s.type === 'permanent');
  const contractChecked = !!contractEntry;
  const contractMin = contractEntry?.min ?? 0;
  const contractUnit = contractEntry?.unit ?? 'month';
  const permanentChecked = !!permanentEntry;
  const permanentMin = permanentEntry?.min ?? 0;
  const permanentUnit = permanentEntry?.unit ?? 'month';
  const noneChecked = !contractChecked && !permanentChecked;

  const [sharedCurrency, setSharedCurrency] = useState<string>(
    () =>
      prefs.salary[0]?.currency ?? preferredCurrency ?? currencies[0] ?? 'USD',
  );

  useEffect(() => {
    if (prefs.salary.length === 0 && preferredCurrency) {
      setSharedCurrency(preferredCurrency);
    }
  }, [preferredCurrency]);

  useEffect(() => {
    if (prefs.salary.length > 0) {
      setSharedCurrency(prefs.salary[0].currency);
    }
  }, [prefs.salary]);

  function handleContractCheck(checked: boolean) {
    if (checked) {
      const without = prefs.salary.filter(s => s.type !== 'contract');
      onChange({
        ...prefs,
        salary: [
          ...without,
          {
            type: 'contract',
            min: contractMin,
            currency: sharedCurrency,
            unit: contractUnit,
          },
        ],
      });
    } else {
      onChange({
        ...prefs,
        salary: prefs.salary.filter(s => s.type !== 'contract'),
      });
    }
  }

  function handlePermanentCheck(checked: boolean) {
    if (checked) {
      const without = prefs.salary.filter(s => s.type !== 'permanent');
      onChange({
        ...prefs,
        salary: [
          ...without,
          {
            type: 'permanent',
            min: permanentMin,
            currency: sharedCurrency,
            unit: permanentUnit,
          },
        ],
      });
    } else {
      onChange({
        ...prefs,
        salary: prefs.salary.filter(s => s.type !== 'permanent'),
      });
    }
  }

  function handleContractMin(val: number) {
    onChange({
      ...prefs,
      salary: prefs.salary.map(s =>
        s.type === 'contract' ? { ...s, min: val } : s,
      ),
    });
  }

  function handlePermanentMin(val: number) {
    onChange({
      ...prefs,
      salary: prefs.salary.map(s =>
        s.type === 'permanent' ? { ...s, min: val } : s,
      ),
    });
  }

  function handleContractUnit(val: string) {
    onChange({
      ...prefs,
      salary: prefs.salary.map(s =>
        s.type === 'contract' ? { ...s, unit: val } : s,
      ),
    });
  }

  function handlePermanentUnit(val: string) {
    onChange({
      ...prefs,
      salary: prefs.salary.map(s =>
        s.type === 'permanent' ? { ...s, unit: val } : s,
      ),
    });
  }

  function handleSalaryCurrency(val: string) {
    setSharedCurrency(val);
    onChange({
      ...prefs,
      salary: prefs.salary.map(s => ({ ...s, currency: val })),
    });
  }

  // ── Target role ──────────────────────────────────────────────────────────
  function addRole() {
    onChange({ ...prefs, target_role: [...prefs.target_role, ''] });
  }

  function updateRole(idx: number, val: string) {
    onChange({
      ...prefs,
      target_role: prefs.target_role.map((r, i) => (i === idx ? val : r)),
    });
  }

  function removeRole(idx: number) {
    onChange({
      ...prefs,
      target_role: prefs.target_role.filter((_, i) => i !== idx),
    });
  }

  function handleRoleDragStart(i: number) {
    roleDragFrom.current = i;
  }

  function handleRoleDragOver(e: React.DragEvent, i: number) {
    e.preventDefault();
    setRoleDragOver(i);
  }

  function handleRoleDrop(e: React.DragEvent, toIdx: number) {
    e.preventDefault();
    const fromIdx = roleDragFrom.current;
    if (fromIdx === null || fromIdx === toIdx) {
      setRoleDragOver(null);
      return;
    }
    const next = [...prefs.target_role];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    onChange({ ...prefs, target_role: next });
    roleDragFrom.current = null;
    setRoleDragOver(null);
  }

  function handleRoleDragEnd() {
    roleDragFrom.current = null;
    setRoleDragOver(null);
  }

  // ── Industries (custom) ─────────────────────────────────────────────────
  function handleIndustryKey(e: React.KeyboardEvent<HTMLInputElement>) {
    const val = industryInput.trim();
    if ((e.key === 'Enter' || e.key === ',') && val) {
      e.preventDefault();
      if (!prefs.industries.includes(val)) {
        onChange({ ...prefs, industries: [...prefs.industries, val] });
      }
      setIndustryInput('');
    }
  }

  // ── Office cities ────────────────────────────────────────────────────────
  function handleCityKey(e: React.KeyboardEvent<HTMLInputElement>) {
    const val = cityInput.trim();
    if ((e.key === 'Enter' || e.key === ',') && val) {
      e.preventDefault();
      if (!prefs.office_location_cities.includes(val)) {
        onChange({
          ...prefs,
          office_location_cities: [...prefs.office_location_cities, val],
        });
      }
      setCityInput('');
    }
  }

  function removeCity(city: string) {
    onChange({
      ...prefs,
      office_location_cities: prefs.office_location_cities.filter(
        c => c !== city,
      ),
    });
  }

  // ── Learning goals autocomplete ──────────────────────────────────────────
  const goals = prefs.learning_skills_goals ?? [];

  useEffect(() => {
    const q = skillInput.trim();
    if (!q) {
      setSkillResults([]);
      setSkillLoading(false);
      return;
    }
    setSkillLoading(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/v1/skills/search?q=${encodeURIComponent(q)}`,
        );
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          const q_lower = q.toLowerCase();
          const filtered = (data.skills ?? []).filter(
            (s: { name: string }) => !goals.includes(s.name),
          );
          filtered.sort((a: { name: string }, b: { name: string }) => {
            const aStarts = a.name.toLowerCase().startsWith(q_lower);
            const bStarts = b.name.toLowerCase().startsWith(q_lower);
            if (aStarts && !bStarts) return -1;
            if (!aStarts && bStarts) return 1;
            return 0;
          });
          setSkillResults(filtered);
          setSkillLoading(false);
        }
      } catch {
        if (!cancelled) {
          setSkillResults([]);
          setSkillLoading(false);
        }
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [skillInput, goals]);

  function openSkillDropdown() {
    if (skillWrapperRef.current) {
      const rect = skillWrapperRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    }
    setSkillDropdownOpen(true);
  }

  function addSkill(skill: string) {
    if (!goals.includes(skill)) {
      onChange({ ...prefs, learning_skills_goals: [...goals, skill] });
    }
    setSkillInput('');
    setSkillDropdownOpen(false);
  }

  function handleSkillKey(e: React.KeyboardEvent<HTMLInputElement>) {
    const val = skillInput.trim();
    if ((e.key === 'Enter' || e.key === ',') && val) {
      e.preventDefault();
      addSkill(val);
    }
    if (e.key === 'Escape') setSkillDropdownOpen(false);
  }

  function removeSkill(skill: string) {
    onChange({
      ...prefs,
      learning_skills_goals: goals.filter(s => s !== skill),
    });
  }

  const customIndustries = prefs.industries.filter(
    ind => !industries.includes(ind),
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Salary */}
      <Section
        title="Salary expectations"
        badge={
          noneChecked ? (
            <XCircle
              size={16}
              weight="fill"
              className="text-red-400 shrink-0"
            />
          ) : undefined
        }
      >
        <div className="flex flex-col gap-2">
          {(
            [
              ['contract', 'Contr.'],
              ['permanent', 'Perm.'],
            ] as const
          ).map(([type, label]) => {
            const isChecked =
              type === 'contract' ? contractChecked : permanentChecked;
            const minVal = type === 'contract' ? contractMin : permanentMin;
            const unitVal = type === 'contract' ? contractUnit : permanentUnit;
            const handleCheck =
              type === 'contract' ? handleContractCheck : handlePermanentCheck;
            const handleMin =
              type === 'contract' ? handleContractMin : handlePermanentMin;
            const handleUnit =
              type === 'contract' ? handleContractUnit : handlePermanentUnit;
            const hasMinError = isChecked && minVal <= 0;
            return (
              <div key={type} className="flex items-center gap-1 flex-wrap">
                <input
                  type="checkbox"
                  id={`salary-${type}`}
                  checked={isChecked}
                  onChange={e => handleCheck(e.target.checked)}
                  className="w-4 h-4 accent-blue-600 cursor-pointer shrink-0"
                />
                <label
                  htmlFor={`salary-${type}`}
                  className="text-sm text-gray-700 shrink-0 cursor-pointer"
                  style={{ width: 40 }}
                >
                  {label}
                </label>
                {isChecked && (
                  <>
                    <select
                      value={sharedCurrency}
                      onChange={e => handleSalaryCurrency(e.target.value)}
                      className={selectClass}
                    >
                      {(currencies.length > 0 ? currencies : ['USD']).map(c => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={minVal || ''}
                      onChange={e => handleMin(Number(e.target.value))}
                      placeholder="Min salary"
                      min={1}
                      className={`px-2.5 py-1.5 border ${hasMinError ? 'border-red-400' : 'border-gray-300'} rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                      style={{ width: 90 }}
                    />
                    <select
                      value={unitVal}
                      onChange={e => handleUnit(e.target.value)}
                      className={selectClass}
                    >
                      {['hour', 'day', 'month', 'year'].map(u => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                    {hasMinError && (
                      <XCircle
                        size={16}
                        weight="fill"
                        className="text-red-400 shrink-0"
                      />
                    )}
                  </>
                )}
              </div>
            );
          })}
          {noneChecked && (
            <p className="text-xs text-red-500">
              Select at least one salary type
            </p>
          )}
        </div>
      </Section>

      {/* Work model */}
      <Section
        title="Work model"
        badge={
          prefs.work_model.length === 0 ? (
            <XCircle
              size={16}
              weight="fill"
              className="text-red-400 shrink-0"
            />
          ) : undefined
        }
      >
        <div className="flex flex-wrap gap-1.5">
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
              selected={prefs.work_model.includes(val)}
              onClick={() =>
                onChange({
                  ...prefs,
                  work_model: toggle(prefs.work_model, val),
                })
              }
            />
          ))}
        </div>
      </Section>

      {/* Office-relevant fields — hidden when only remote */}
      {showOfficeFields && (
        <>
          <Section
            title="Max office days per week"
            badge={
              <span className="text-xs font-bold text-blue-600">
                {prefs.max_office_days_per_week ?? 0}
              </span>
            }
          >
            <input
              type="range"
              min={0}
              max={7}
              value={prefs.max_office_days_per_week ?? 0}
              onChange={e =>
                onChange({
                  ...prefs,
                  max_office_days_per_week: Number(e.target.value),
                })
              }
              className="w-full accent-blue-600"
            />
            <div className="flex justify-between text-xs text-gray-400 px-0.5">
              {[0, 1, 2, 3, 4, 5, 6, 7].map(n => (
                <span key={n}>{n}</span>
              ))}
            </div>
          </Section>

          <Section title="Office location cities">
            {prefs.office_location_cities.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {prefs.office_location_cities.map(city => (
                  <RemovableChip
                    key={city}
                    label={city}
                    onRemove={() => removeCity(city)}
                  />
                ))}
              </div>
            )}
            <input
              type="text"
              value={cityInput}
              onChange={e => setCityInput(e.target.value)}
              onKeyDown={handleCityKey}
              placeholder="Type city name, Enter to add"
              className={inputClass}
            />
          </Section>
        </>
      )}

      {/* Target role */}
      <Section
        title="Target role"
        badge={
          prefs.target_role.length === 0 ? (
            <XCircle
              size={16}
              weight="fill"
              className="text-red-400 shrink-0"
            />
          ) : undefined
        }
      >
        <div className="flex flex-col gap-1.5">
          {prefs.target_role.map((role, i) => (
            <div
              key={i}
              onDragOver={e => handleRoleDragOver(e, i)}
              onDrop={e => handleRoleDrop(e, i)}
              className={`flex items-start gap-1.5 rounded transition-colors ${
                roleDragOver === i ? 'bg-blue-50' : ''
              }`}
            >
              <div
                draggable
                onDragStart={() => handleRoleDragStart(i)}
                onDragEnd={handleRoleDragEnd}
                className="shrink-0 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-500 transition-colors mt-1.5"
                aria-label="Drag to reorder"
              >
                <DotsSixVertical size={20} />
              </div>
              <textarea
                rows={2}
                value={role}
                onChange={e => updateRole(i, e.target.value)}
                placeholder="e.g. Senior Fullstack Engineer"
                className={`${inputClass} resize-y flex-1`}
              />
              <span className="shrink-0 mt-1.5">
                {role.trim() === '' && (
                  <XCircle size={20} weight="fill" className="text-red-400" />
                )}
              </span>
              <button
                type="button"
                onClick={() => removeRole(i)}
                aria-label="Remove role"
                className="shrink-0 text-red-400 hover:text-red-600 transition-colors mt-1.5"
              >
                <Trash size={20} />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addRole}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors w-fit"
        >
          <Plus size={16} />
          Add target role
        </button>
      </Section>

      {/* Company type preferred */}
      <Section title="Company type (preferred)">
        <div className="flex flex-wrap gap-1.5">
          {companyTypes.map(ct => (
            <Chip
              key={ct}
              label={labelFor(ct)}
              selected={prefs.company_type.includes(ct)}
              onClick={() =>
                onChange({
                  ...prefs,
                  company_type: toggle(prefs.company_type, ct),
                })
              }
            />
          ))}
        </div>
      </Section>

      {/* Company type excluded */}
      <Section title="Company type (excluded)">
        <div className="flex flex-wrap gap-1.5">
          {companyTypes.map(ct => (
            <Chip
              key={ct}
              label={labelFor(ct)}
              selected={prefs.company_type_excluded.includes(ct)}
              onClick={() =>
                onChange({
                  ...prefs,
                  company_type_excluded: toggle(
                    prefs.company_type_excluded,
                    ct,
                  ),
                })
              }
            />
          ))}
        </div>
      </Section>

      {/* Industries */}
      <Section title="Industries">
        <div className="flex flex-wrap gap-1.5">
          {industries.map(ind => (
            <Chip
              key={ind}
              label={labelFor(ind)}
              selected={prefs.industries.includes(ind)}
              onClick={() =>
                onChange({
                  ...prefs,
                  industries: toggle(prefs.industries, ind),
                })
              }
            />
          ))}
          {customIndustries.map(custom => (
            <RemovableChip
              key={custom}
              label={custom}
              onRemove={() =>
                onChange({
                  ...prefs,
                  industries: prefs.industries.filter(i => i !== custom),
                })
              }
            />
          ))}
        </div>
        <input
          type="text"
          value={industryInput}
          onChange={e => setIndustryInput(e.target.value)}
          onKeyDown={handleIndustryKey}
          placeholder="Add custom industry, Enter to add"
          className={inputClass}
        />
      </Section>

      {/* Markets */}
      <Section title="Markets">
        <div className="flex flex-wrap gap-1.5">
          {markets.map(m => (
            <Chip
              key={m}
              label={labelFor(m)}
              selected={prefs.markets.includes(m)}
              onClick={() =>
                onChange({ ...prefs, markets: toggle(prefs.markets, m) })
              }
            />
          ))}
        </div>
      </Section>

      {/* Learning & skill goals */}
      <Section title="Learning & skill goals">
        {goals.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {goals.map(s => (
              <RemovableChip
                key={s}
                label={s}
                onRemove={() => removeSkill(s)}
              />
            ))}
          </div>
        )}
        <div ref={skillWrapperRef} className="relative">
          <input
            type="text"
            value={skillInput}
            onChange={e => {
              setSkillInput(e.target.value);
              openSkillDropdown();
            }}
            onFocus={openSkillDropdown}
            onKeyDown={handleSkillKey}
            onBlur={() => setTimeout(() => setSkillDropdownOpen(false), 150)}
            placeholder="Type to search or add skill…"
            className={inputClass}
          />
          {skillDropdownOpen &&
            !!skillInput.trim() &&
            (skillLoading || skillResults.length > 0) &&
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
                {skillLoading ? (
                  <div className="flex items-center justify-center px-3 py-2.5">
                    <Spinner className="text-blue-500" />
                  </div>
                ) : (
                  skillResults.map(r => (
                    <button
                      key={r.name}
                      type="button"
                      onMouseDown={() => {
                        addSkill(r.name);
                        setSkillDropdownOpen(false);
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
      </Section>
    </div>
  );
}
