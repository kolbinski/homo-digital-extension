import { useRef, useState } from 'react';
import { X } from '@phosphor-icons/react';
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

const SKILLS_SUGGESTIONS = ['php', 'jquery', 'legacy', 'cobol', 'wordpress', '.net framework'];

const OTHER_PREDEFINED = [
  'no code review',
  'no automated tests',
  'micromanagement',
  'take-home task over 2 hours',
  'no flexible hours',
  'high turnover',
  'no mentoring',
];

function getDescriptions(redFlags: RedFlagEntry[], category: RedFlagEntry['category']): string[] {
  return redFlags.find(r => r.category === category)?.description ?? [];
}

function setDescriptions(
  redFlags: RedFlagEntry[],
  category: RedFlagEntry['category'],
  descriptions: string[],
): RedFlagEntry[] {
  if (redFlags.some(r => r.category === category)) {
    return redFlags.map(r => (r.category === category ? { ...r, description: descriptions } : r));
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
          ? 'bg-red-500 border-red-500 text-white'
          : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'
      }`}
    >
      {label}
    </button>
  );
}

function Tag({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-100 border border-gray-200 text-xs text-gray-700">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="text-gray-400 hover:text-gray-600 transition-colors"
        aria-label={`Remove ${label}`}
      >
        <X size={20} />
      </button>
    </span>
  );
}

export default function RedFlagsTab({ redFlags, onChange }: Props) {
  const companyTypes = getDescriptions(redFlags, 'company_type');
  const skills = getDescriptions(redFlags, 'skills');
  const other = getDescriptions(redFlags, 'other');

  const [skillInput, setSkillInput] = useState('');
  const [otherInput, setOtherInput] = useState('');
  const skillInputRef = useRef<HTMLInputElement>(null);
  const otherInputRef = useRef<HTMLInputElement>(null);

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
    onChange(setDescriptions(redFlags, 'skills', skills.filter(s => s !== value)));
  }

  function handleSkillKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addSkill(skillInput);
      setSkillInput('');
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
    onChange(setDescriptions(redFlags, 'other', other.filter(o => o !== value)));
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
          <div className="flex flex-wrap gap-1.5 mb-2">
            {skills.map(skill => (
              <Tag key={skill} label={skill} onRemove={() => removeSkill(skill)} />
            ))}
          </div>
        )}
        <input
          ref={skillInputRef}
          type="text"
          value={skillInput}
          onChange={e => setSkillInput(e.target.value)}
          onKeyDown={handleSkillKeyDown}
          placeholder="Type and press Enter or comma…"
          className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent"
        />
        <div className="flex flex-wrap gap-1.5 mt-2">
          {SKILLS_SUGGESTIONS.filter(s => !skills.includes(s)).map(s => (
            <button
              key={s}
              type="button"
              onClick={() => addSkill(s)}
              className="px-2 py-0.5 rounded text-xs bg-gray-100 border border-gray-200 text-gray-500 hover:bg-gray-200 transition-colors"
            >
              + {s}
            </button>
          ))}
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
        </div>
        {customOther.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {customOther.map(item => (
              <Tag key={item} label={item} onRemove={() => removeOther(item)} />
            ))}
          </div>
        )}
        <input
          ref={otherInputRef}
          type="text"
          value={otherInput}
          onChange={e => setOtherInput(e.target.value)}
          onKeyDown={handleOtherKeyDown}
          placeholder="Add custom red flag and press Enter…"
          className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent"
        />
      </div>

    </div>
  );
}
