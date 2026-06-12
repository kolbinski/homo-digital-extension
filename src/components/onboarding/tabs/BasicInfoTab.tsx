import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DotsSixVertical, Plus, Trash, XCircle } from '@phosphor-icons/react';
import { useGeneralSettings } from '../../../store/generalSettingsStore';
import type {
  LanguageEntry,
  ProfileBasicInfo,
  ProfileLocation,
} from '../types';

interface Props {
  basicInfo: ProfileBasicInfo;
  onChange: (basicInfo: ProfileBasicInfo) => void;
}

const fieldClass =
  'w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Section({
  title,
  required,
  children,
}: {
  title: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        {title}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </h3>
      {children}
    </div>
  );
}

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

function StringAutocomplete({
  value,
  onChange,
  options,
  placeholder,
  className,
  wrapperClass,
}: {
  value: string;
  onChange: (val: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
  wrapperClass?: string;
}) {
  const valueRef = useRef(value);
  const [input, setInput] = useState(value);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    valueRef.current = value;
    setInput(value);
  }, [value]);

  const filtered = options
    .filter(o => !input.trim() || o.toLowerCase().includes(input.toLowerCase()))
    .slice(0, 8);
  const noResults = !!input.trim() && filtered.length === 0;

  function measure() {
    if (wrapRef.current) {
      const r = wrapRef.current.getBoundingClientRect();
      setPos({ top: r.bottom, left: r.left, width: r.width });
    }
  }

  return (
    <div ref={wrapRef} className={wrapperClass}>
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
        onBlur={() =>
          setTimeout(() => {
            setOpen(false);
            setInput(valueRef.current);
          }, 150)
        }
        placeholder={placeholder}
        className={className}
      />
      {open &&
        (filtered.length > 0 || noResults) &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              width: pos.width,
              zIndex: 9999,
            }}
            className="bg-white border border-gray-200 rounded-md shadow-lg max-h-40 overflow-y-auto"
          >
            {noResults ? (
              <p className="px-3 py-2 text-sm text-gray-400">No results</p>
            ) : (
              filtered.map(opt => (
                <button
                  key={opt}
                  type="button"
                  onMouseDown={() => {
                    onChange(opt);
                    setInput(opt);
                    setOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                >
                  {opt}
                </button>
              ))
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

function CountryAutocomplete({
  code,
  onChange,
  className,
}: {
  code: string;
  onChange: (code: string) => void;
  className?: string;
}) {
  const { settings } = useGeneralSettings();
  const countries = settings?.countries ?? [];
  const codeRef = useRef(code);
  const [input, setInput] = useState(
    () => countries.find(c => c.code === code)?.name ?? '',
  );
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    codeRef.current = code;
    setInput(countries.find(c => c.code === code)?.name ?? '');
  }, [code, countries]);

  const filtered = countries
    .filter(
      c => !input.trim() || c.name.toLowerCase().includes(input.toLowerCase()),
    )
    .slice(0, 8);

  function measure() {
    if (wrapRef.current) {
      const r = wrapRef.current.getBoundingClientRect();
      setPos({ top: r.bottom, left: r.left, width: r.width });
    }
  }

  return (
    <div ref={wrapRef}>
      <input
        type="text"
        value={input}
        onChange={e => {
          setInput(e.target.value);
          if (!e.target.value) onChange('');
          measure();
          setOpen(true);
        }}
        onFocus={() => {
          measure();
          setOpen(true);
        }}
        onBlur={() =>
          setTimeout(() => {
            setOpen(false);
            setInput(
              countries.find(c => c.code === codeRef.current)?.name ?? '',
            );
          }, 150)
        }
        placeholder="e.g. Poland"
        className={className}
      />
      {open &&
        filtered.length > 0 &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              width: pos.width,
              zIndex: 9999,
            }}
            className="bg-white border border-gray-200 rounded-md shadow-lg max-h-40 overflow-y-auto"
          >
            {filtered.map(c => (
              <button
                key={c.code}
                type="button"
                onMouseDown={() => {
                  onChange(c.code);
                  setInput(c.name);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
              >
                {c.name}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

function toggle(arr: string[], val: string): string[] {
  return arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val];
}

function labelFor(val: string): string {
  return val.replace(/_/g, ' ');
}

export default function BasicInfoTab({ basicInfo: b, onChange }: Props) {
  const { settings } = useGeneralSettings();
  const industryOptions = settings?.industries ?? [];
  const markets = settings?.markets ?? [];
  const languageOptions = settings?.languages ?? [];
  const languageLevels = settings?.language_levels ?? [];

  const [unit, setUnit] = useState<'km' | 'miles'>('km');
  const [industryInput, setIndustryInput] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const emailInvalid =
    emailTouched && (!b.email.trim() || !EMAIL_RE.test(b.email));

  const langDragFrom = useRef<number | null>(null);
  const [langDragOver, setLangDragOver] = useState<number | null>(null);
  const softDragFrom = useRef<number | null>(null);
  const [softDragOver, setSoftDragOver] = useState<number | null>(null);
  const bulletDragFrom = useRef<number | null>(null);
  const [bulletDragOver, setBulletDragOver] = useState<number | null>(null);

  function update(patch: Partial<ProfileBasicInfo>) {
    onChange({ ...b, ...patch });
  }

  function updateLocation(patch: Partial<ProfileLocation>) {
    onChange({ ...b, location: { ...b.location, ...patch } });
  }

  // ── Distance ──────────────────────────────────────────────────────────────
  const storedKm = b.location.max_distance_km ?? 0;
  const displayDist = unit === 'km' ? storedKm : Math.round(storedKm / 1.609);
  const distMax = unit === 'km' ? 322 : 200;

  function handleDistanceChange(val: number) {
    const km = unit === 'km' ? val : Math.round(val * 1.609);
    updateLocation({ max_distance_km: km });
  }

  // ── Languages ─────────────────────────────────────────────────────────────
  const languages = b.languages ?? [];

  function addLanguage() {
    update({ languages: [...languages, { name: '', level: '' }] });
  }

  function updateLanguage(idx: number, patch: Partial<LanguageEntry>) {
    update({
      languages: languages.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    });
  }

  function removeLanguage(idx: number) {
    update({ languages: languages.filter((_, i) => i !== idx) });
  }

  function handleLangDragOver(e: React.DragEvent, i: number) {
    e.preventDefault();
    setLangDragOver(i);
  }

  function handleLangDrop(e: React.DragEvent, toIdx: number) {
    e.preventDefault();
    const fromIdx = langDragFrom.current;
    if (fromIdx === null || fromIdx === toIdx) {
      setLangDragOver(null);
      return;
    }
    const next = [...languages];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    update({ languages: next });
    langDragFrom.current = null;
    setLangDragOver(null);
  }

  function handleLangDragEnd() {
    langDragFrom.current = null;
    setLangDragOver(null);
  }

  // ── Industries ────────────────────────────────────────────────────────────
  const industries = b.industries ?? [];

  function handleIndustryKey(e: React.KeyboardEvent<HTMLInputElement>) {
    const val = industryInput.trim();
    if ((e.key === 'Enter' || e.key === ',') && val) {
      e.preventDefault();
      if (!industries.includes(val)) {
        update({ industries: [...industries, val] });
      }
      setIndustryInput('');
    }
  }

  const customIndustries = industries.filter(
    ind => !industryOptions.includes(ind),
  );

  // ── DnD helpers for string[] lists ────────────────────────────────────────
  function makeDndHandlers(
    arr: string[],
    dragFrom: React.MutableRefObject<number | null>,
    setDragOver: React.Dispatch<React.SetStateAction<number | null>>,
    onReorder: (next: string[]) => void,
  ) {
    return {
      onDragOver: (e: React.DragEvent, i: number) => {
        e.preventDefault();
        setDragOver(i);
      },
      onDrop: (e: React.DragEvent, toIdx: number) => {
        e.preventDefault();
        const fromIdx = dragFrom.current;
        if (fromIdx === null || fromIdx === toIdx) {
          setDragOver(null);
          return;
        }
        const next = [...arr];
        const [moved] = next.splice(fromIdx, 1);
        next.splice(toIdx, 0, moved);
        onReorder(next);
        dragFrom.current = null;
        setDragOver(null);
      },
      onDragEnd: () => {
        dragFrom.current = null;
        setDragOver(null);
      },
    };
  }

  const softSkills = b.soft_skills ?? [];
  const softHandlers = makeDndHandlers(
    softSkills,
    softDragFrom,
    setSoftDragOver,
    next => update({ soft_skills: next }),
  );

  const bullets = b.cv_summary_bullets ?? [];
  const bulletHandlers = makeDndHandlers(
    bullets,
    bulletDragFrom,
    setBulletDragOver,
    next => update({ cv_summary_bullets: next }),
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Name */}
      <Section title="Name">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" required>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={b.first_name}
                onChange={e => update({ first_name: e.target.value })}
                placeholder="e.g. Anna"
                className={`${fieldClass} flex-1`}
              />
              {!b.first_name.trim() && (
                <XCircle
                  size={16}
                  weight="fill"
                  className="shrink-0 text-red-400"
                />
              )}
            </div>
          </Field>
          <Field label="Last name" required>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={b.last_name}
                onChange={e => update({ last_name: e.target.value })}
                placeholder="e.g. Kowalski"
                className={`${fieldClass} flex-1`}
              />
              {!b.last_name.trim() && (
                <XCircle
                  size={16}
                  weight="fill"
                  className="shrink-0 text-red-400"
                />
              )}
            </div>
          </Field>
        </div>
      </Section>

      {/* Contact */}
      <Section title="Contact">
        <Field label="Email" required>
          <div className="flex items-center gap-1.5">
            <input
              type="email"
              value={b.email}
              onChange={e => update({ email: e.target.value })}
              onBlur={() => setEmailTouched(true)}
              placeholder="you@example.com"
              className={`${fieldClass} flex-1`}
            />
            {emailInvalid && (
              <XCircle
                size={16}
                weight="fill"
                className="shrink-0 text-red-400"
              />
            )}
          </div>
        </Field>
        <Field label="Phone">
          <input
            type="text"
            value={b.phone}
            onChange={e => update({ phone: e.target.value })}
            placeholder="+1 415 555 0123"
            className={fieldClass}
          />
        </Field>
      </Section>

      {/* Links */}
      <Section title="Links">
        <Field label="GitHub">
          <input
            type="text"
            value={b.github}
            onChange={e => update({ github: e.target.value })}
            placeholder="https://github.com/username"
            className={fieldClass}
          />
        </Field>
        <Field label="LinkedIn">
          <input
            type="text"
            value={b.linkedin}
            onChange={e => update({ linkedin: e.target.value })}
            placeholder="https://linkedin.com/in/username"
            className={fieldClass}
          />
        </Field>
      </Section>

      {/* Gender */}
      <Section title="Gender" required>
        <div className="flex items-center gap-1.5">
          {(
            [
              ['M', 'Male'],
              ['F', 'Female'],
            ] as const
          ).map(([val, label]) => (
            <Chip
              key={val}
              label={label}
              selected={b.gender === val}
              onClick={() => update({ gender: b.gender === val ? '' : val })}
            />
          ))}
          {!b.gender && (
            <XCircle
              size={16}
              weight="fill"
              className="shrink-0 text-red-400"
            />
          )}
        </div>
      </Section>

      {/* Location */}
      <Section title="Location">
        <div className="grid grid-cols-2 gap-3">
          <Field label="City">
            <input
              type="text"
              value={b.location.city}
              onChange={e => updateLocation({ city: e.target.value })}
              placeholder="e.g. Warsaw"
              className={fieldClass}
            />
          </Field>
          <Field label="Country">
            <CountryAutocomplete
              code={b.location.country_code}
              onChange={code => updateLocation({ country_code: code })}
              className={fieldClass}
            />
          </Field>
        </div>
        <Field label={`Max commute distance — ${displayDist} ${unit}`}>
          <input
            type="range"
            min={0}
            max={distMax}
            value={displayDist}
            onChange={e => handleDistanceChange(Number(e.target.value))}
            className="w-full accent-blue-600"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">0</span>
            <div className="flex gap-1">
              {(['km', 'miles'] as const).map(u => (
                <Chip
                  key={u}
                  label={u === 'km' ? 'KM' : 'Miles'}
                  selected={unit === u}
                  onClick={() => setUnit(u)}
                />
              ))}
            </div>
            <span className="text-xs text-gray-400">{distMax}</span>
          </div>
        </Field>
      </Section>

      {/* Experience */}
      <Section title="Experience">
        <Field label="Experience level" required>
          <div className="flex flex-wrap items-center gap-1.5">
            {(['junior', 'mid', 'senior', 'lead'] as const).map(level => (
              <Chip
                key={level}
                label={level.charAt(0).toUpperCase() + level.slice(1)}
                selected={b.experience_level === level}
                onClick={() =>
                  update({
                    experience_level: b.experience_level === level ? '' : level,
                  })
                }
              />
            ))}
            {!b.experience_level && (
              <XCircle
                size={16}
                weight="fill"
                className="shrink-0 text-red-400"
              />
            )}
          </div>
        </Field>
        <Field label="Working in IT since">
          <input
            type="number"
            value={b.experience_since}
            onChange={e => update({ experience_since: e.target.value })}
            placeholder="YYYY"
            min={1950}
            max={new Date().getFullYear()}
            className={fieldClass}
          />
        </Field>
        <Field label="Job search status" required>
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                ['actively_looking', 'Actively seeking'],
                ['open_to_offers', 'Open'],
                ['not_looking', 'Passive'],
              ] as const
            ).map(([val, label]) => (
              <Chip
                key={val}
                label={label}
                selected={b.job_search_status === val}
                onClick={() =>
                  update({
                    job_search_status: b.job_search_status === val ? '' : val,
                  })
                }
              />
            ))}
            {!b.job_search_status && (
              <XCircle
                size={16}
                weight="fill"
                className="shrink-0 text-red-400"
              />
            )}
          </div>
        </Field>
      </Section>

      {/* Languages */}
      <Section title="Languages">
        <div className="flex flex-col gap-1.5">
          {languages.map((lang, i) => (
            <div
              key={i}
              onDragOver={e => handleLangDragOver(e, i)}
              onDrop={e => handleLangDrop(e, i)}
              className={`flex items-center gap-1.5 rounded transition-colors ${
                langDragOver === i ? 'bg-blue-50' : ''
              }`}
            >
              <div
                draggable
                onDragStart={() => {
                  langDragFrom.current = i;
                }}
                onDragEnd={handleLangDragEnd}
                className="shrink-0 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-500 transition-colors"
                aria-label="Drag to reorder"
              >
                <DotsSixVertical size={20} />
              </div>
              <StringAutocomplete
                value={lang.name}
                onChange={name => updateLanguage(i, { name })}
                options={languageOptions}
                placeholder="Language"
                wrapperClass="flex-1"
                className={fieldClass}
              />
              <select
                value={lang.level}
                onChange={e => updateLanguage(i, { level: e.target.value })}
                className="w-24 shrink-0 px-2 py-1.5 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              >
                <option value="" disabled>
                  Level
                </option>
                {languageLevels.map(l => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              {(!lang.name.trim() || !lang.level) && (
                <XCircle
                  size={16}
                  weight="fill"
                  className="shrink-0 text-red-400"
                />
              )}
              <button
                type="button"
                onClick={() => removeLanguage(i)}
                aria-label="Remove language"
                className="shrink-0 text-red-400 hover:text-red-600 transition-colors"
              >
                <Trash size={18} />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addLanguage}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors w-fit"
        >
          <Plus size={16} />
          Add language
        </button>
      </Section>

      {/* Industries */}
      <Section title="Experience in industry">
        <div className="flex flex-wrap gap-1.5">
          {industryOptions.map(ind => (
            <Chip
              key={ind}
              label={labelFor(ind)}
              selected={industries.includes(ind)}
              onClick={() => update({ industries: toggle(industries, ind) })}
            />
          ))}
          {customIndustries.map(custom => (
            <RemovableChip
              key={custom}
              label={custom}
              onRemove={() =>
                update({ industries: industries.filter(i => i !== custom) })
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
          className={fieldClass}
        />
      </Section>

      {/* Markets */}
      <Section title="Experience in country markets">
        <div className="flex flex-wrap gap-1.5">
          {markets.map(m => (
            <Chip
              key={m}
              label={labelFor(m)}
              selected={(b.markets ?? []).includes(m)}
              onClick={() => update({ markets: toggle(b.markets ?? [], m) })}
            />
          ))}
        </div>
      </Section>

      {/* Soft skills */}
      <Section title="Soft skills">
        <div className="flex flex-col gap-1.5">
          {softSkills.map((skill, i) => (
            <div
              key={i}
              onDragOver={e => softHandlers.onDragOver(e, i)}
              onDrop={e => softHandlers.onDrop(e, i)}
              className={`flex items-start gap-1.5 rounded transition-colors ${
                softDragOver === i ? 'bg-blue-50' : ''
              }`}
            >
              <div
                draggable
                onDragStart={() => {
                  softDragFrom.current = i;
                }}
                onDragEnd={softHandlers.onDragEnd}
                className="shrink-0 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-500 transition-colors mt-1.5"
                aria-label="Drag to reorder"
              >
                <DotsSixVertical size={20} />
              </div>
              <textarea
                rows={2}
                value={skill}
                onChange={e => {
                  const next = [...softSkills];
                  next[i] = e.target.value;
                  update({ soft_skills: next });
                }}
                placeholder="e.g. Strong communicator"
                className={`${fieldClass} resize-y flex-1`}
              />
              {!skill.trim() && (
                <XCircle
                  size={16}
                  weight="fill"
                  className="shrink-0 text-red-400 mt-1.5"
                />
              )}
              <button
                type="button"
                onClick={() =>
                  update({ soft_skills: softSkills.filter((_, j) => j !== i) })
                }
                aria-label="Remove soft skill"
                className="shrink-0 text-red-400 hover:text-red-600 transition-colors mt-1.5"
              >
                <Trash size={18} />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => update({ soft_skills: [...softSkills, ''] })}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors w-fit"
        >
          <Plus size={16} />
          Add soft skill
        </button>
      </Section>

      {/* CV summary bullets */}
      <Section title="CV summary bullets">
        <div className="flex flex-col gap-1.5">
          {bullets.map((bullet, i) => (
            <div
              key={i}
              onDragOver={e => bulletHandlers.onDragOver(e, i)}
              onDrop={e => bulletHandlers.onDrop(e, i)}
              className={`flex items-start gap-1.5 rounded transition-colors ${
                bulletDragOver === i ? 'bg-blue-50' : ''
              }`}
            >
              <div
                draggable
                onDragStart={() => {
                  bulletDragFrom.current = i;
                }}
                onDragEnd={bulletHandlers.onDragEnd}
                className="shrink-0 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-500 transition-colors mt-1.5"
                aria-label="Drag to reorder"
              >
                <DotsSixVertical size={20} />
              </div>
              <textarea
                rows={2}
                value={bullet}
                onChange={e => {
                  const next = [...bullets];
                  next[i] = e.target.value;
                  update({ cv_summary_bullets: next });
                }}
                placeholder="e.g. 8 years building scalable APIs"
                className={`${fieldClass} resize-y flex-1`}
              />
              {!bullet.trim() && (
                <XCircle
                  size={16}
                  weight="fill"
                  className="shrink-0 text-red-400 mt-1.5"
                />
              )}
              <button
                type="button"
                onClick={() =>
                  update({
                    cv_summary_bullets: bullets.filter((_, j) => j !== i),
                  })
                }
                aria-label="Remove bullet"
                className="shrink-0 text-red-400 hover:text-red-600 transition-colors mt-1.5"
              >
                <Trash size={18} />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => update({ cv_summary_bullets: [...bullets, ''] })}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors w-fit"
        >
          <Plus size={16} />
          Add bullet
        </button>
      </Section>
    </div>
  );
}
