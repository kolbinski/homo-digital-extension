import { CircleNotch } from '@phosphor-icons/react';

export default function Spinner({ size = 16, className = '' }: { size?: number; className?: string }) {
  return <CircleNotch size={size} className={`animate-spin shrink-0${className ? ` ${className}` : ''}`} />;
}
