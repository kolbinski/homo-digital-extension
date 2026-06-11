import { useEffect, useRef, useState } from 'react';
import { XCircleIcon } from '@phosphor-icons/react';
import { CONFIG } from '../../../config';
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

const SKILLS_SUGGESTIONS = CONFIG.skills_suggestions;

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
  const [otherInput, setOtherInput] = useState('');
  const skillWrapperRef = useRef<HTMLDivElement>(null);

  const filteredSuggestions = SKILLS_SUGGESTIONS.filter(
    s =>
      !skills.includes(s) &&
      s.toLowerCase().includes(skillInput.toLowerCase().trim()),
  );

  useEffect(() => {
    if (!skillDropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (!skillWrapperRef.current?.contains(e.target as Node)) {
        setSkillDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [skillDropdownOpen]);

  function toggleCompanyType(value: string) {
    const next = companyTypes.includes(value)
      ? companyTypes.filter(v => v !== value)
      : [...companyTypes, value];
    onChange(setDescriptions(redFlags, 'company_type', next));
  }

  function addSkill(value: string) {
    const trimmed = value.trim().toLowerCase();
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
        <div ref={skillWrapperRef} className="relative">
          <input
            type="text"
            value={skillInput}
            onChange={e => {
              setSkillInput(e.target.value);
              setSkillDropdownOpen(true);
            }}
            onFocus={() => setSkillDropdownOpen(true)}
            onKeyDown={handleSkillKeyDown}
            placeholder="Type and press Enter or comma…"
            className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
          />
          {skillDropdownOpen && filteredSuggestions.length > 0 && (
            <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-md overflow-hidden">
              {filteredSuggestions.map(s => (
                <button
                  key={s}
                  type="button"
                  onMouseDown={e => {
                    e.preventDefault();
                    addSkill(s);
                    setSkillInput('');
                    setSkillDropdownOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
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
