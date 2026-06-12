import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { XCircleIcon } from '@phosphor-icons/react';
import { API_BASE_URL } from '../../../config';
import Spinner from '../../Spinner';
import type { RedFlagEntry } from '../types';

interface Props {
  redFlags: RedFlagEntry[];
  onChange: (redFlags: RedFlagEntry[]) => void;
}

const COMPANY_TYPE_OPTIONS = [
  'outsourcing',
  'body_leasing',
  'agency',
  'consultancy',
  'corporation',
];

const OTHER_PREDEFINED = [
  'no code review',
  'no automated tests',
  'micromanagement',
  'take-home task over 2 hours',
  'no flexible hours',
  'high turnover',
  'no mentoring',
];

function getDescriptions(
  redFlags: RedFlagEntry[],
  category: RedFlagEntry['category'],
): string[] {
  return redFlags.find(r => r.category === category)?.description ?? [];
}

function setDescriptions(
  redFlags: RedFlagEntry[],
  category: RedFlagEntry['category'],
  descriptions: string[],
): RedFlagEntry[] {
  if (redFlags.some(r => r.category === category)) {
    return redFlags.map(r =>
      r.category === category ? { ...r, description: descriptions } : r,
    );
  }
  return [...redFlags, { category, description: descriptions }];
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-medium text-gray-700 mb-2">{children}</p>;
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
      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
        selected
          ? 'bg-blue-500 border-blue-500 text-white'
          : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'
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

export default function RedFlagsTab({ redFlags, onChange }: Props) {
  const companyTypes = getDescriptions(redFlags, 'company_type');
  const skills = getDescriptions(redFlags, 'skills');
  const other = getDescriptions(redFlags, 'other');

  const [skillInput, setSkillInput] = useState('');
  const [skillDropdownOpen, setSkillDropdownOpen] = useState(false);
  const [skillResults, setSkillResults] = useState<
    { name: string; category: string }[]
  >([]);
  const [skillLoading, setSkillLoading] = useState(false);
  const [skillPos, setSkillPos] = useState({ top: 0, left: 0, width: 0 });
  const [otherInput, setOtherInput] = useState('');
  const skillWrapperRef = useRef<HTMLDivElement>(null);

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
          setSkillResults(
            (data.skills ?? []).filter(
              (s: { name: string }) => !skills.includes(s.name),
            ),
          );
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
  }, [skillInput, skills]);

  function toggleCompanyType(value: string) {
    const next = companyTypes.includes(value)
      ? companyTypes.filter(v => v !== value)
      : [...companyTypes, value];
    onChange(setDescriptions(redFlags, 'company_type', next));
  }

  function measureSkill() {
    if (skillWrapperRef.current) {
      const r = skillWrapperRef.current.getBoundingClientRect();
      setSkillPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
  }

  function addSkill(value: string) {
    const trimmed = value.trim();
    if (!trimmed || skills.includes(trimmed)) return;
    onChange(setDescriptions(redFlags, 'skills', [...skills, trimmed]));
  }

  function removeSkill(value: string) {
    onChange(
      setDescriptions(
        redFlags,
        'skills',
        skills.filter(s => s !== value),
      ),
    );
  }

  function handleSkillKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addSkill(skillInput);
      setSkillInput('');
      setSkillDropdownOpen(false);
    } else if (e.key === 'Escape') {
      setSkillDropdownOpen(false);
    }
  }

  function toggleOther(value: string) {
    const next = other.includes(value)
      ? other.filter(v => v !== value)
      : [...other, value];
    onChange(setDescriptions(redFlags, 'other', next));
  }

  function addCustomOther(value: string) {
    const trimmed = value.trim();
    if (!trimmed || other.includes(trimmed)) return;
    onChange(setDescriptions(redFlags, 'other', [...other, trimmed]));
  }

  function removeOther(value: string) {
    onChange(
      setDescriptions(
        redFlags,
        'other',
        other.filter(o => o !== value),
      ),
    );
  }

  function handleOtherKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCustomOther(otherInput);
      setOtherInput('');
    }
  }

  const customOther = other.filter(o => !OTHER_PREDEFINED.includes(o));

  return (
    <div className="flex flex-col gap-6">
      {/* Company type */}
      <div>
        <SectionTitle>Company type</SectionTitle>
        <div className="flex flex-wrap gap-2">
          {COMPANY_TYPE_OPTIONS.map(opt => (
            <Chip
              key={opt}
              label={opt.replace('_', ' ')}
              selected={companyTypes.includes(opt)}
              onClick={() => toggleCompanyType(opt)}
            />
          ))}
        </div>
      </div>

      {/* Skills to avoid */}
      <div>
        <SectionTitle>Skills to avoid</SectionTitle>
        {skills.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {skills.map(skill => (
              <RemovableChip
                key={skill}
                label={skill}
                onRemove={() => removeSkill(skill)}
              />
            ))}
          </div>
        )}
        <div ref={skillWrapperRef}>
          <input
            type="text"
            value={skillInput}
            onChange={e => {
              setSkillInput(e.target.value);
              measureSkill();
              setSkillDropdownOpen(true);
            }}
            onFocus={() => {
              measureSkill();
              setSkillDropdownOpen(true);
            }}
            onKeyDown={handleSkillKeyDown}
            onBlur={() => setTimeout(() => setSkillDropdownOpen(false), 150)}
            placeholder="Type to search or add skill…"
            className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
          />
          {skillDropdownOpen &&
            !!skillInput.trim() &&
            (skillLoading || skillResults.length > 0) &&
            createPortal(
              <div
                style={{
                  position: 'fixed',
                  top: skillPos.top,
                  left: skillPos.left,
                  width: skillPos.width,
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
                        setSkillInput('');
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
      </div>

      {/* Other red flags */}
      <div>
        <SectionTitle>Other red flags</SectionTitle>
        <div className="flex flex-wrap gap-2 mb-3">
          {OTHER_PREDEFINED.map(opt => (
            <Chip
              key={opt}
              label={opt}
              selected={other.includes(opt)}
              onClick={() => toggleOther(opt)}
            />
          ))}
          {customOther.map(item => (
            <RemovableChip
              key={item}
              label={item}
              onRemove={() => removeOther(item)}
            />
          ))}
        </div>
        <input
          type="text"
          value={otherInput}
          onChange={e => setOtherInput(e.target.value)}
          onKeyDown={handleOtherKeyDown}
          placeholder="Add custom red flag and press Enter…"
          className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
        />
      </div>
    </div>
  );
}
