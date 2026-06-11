import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface Props {
  onLogout: () => void;
}

export default function ClientView({ onLogout }: Props) {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
    });
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 px-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <h2 className="text-xl font-semibold text-gray-900">Welcome!</h2>
        {email && <p className="text-sm text-gray-500">{email}</p>}
        <button
          type="button"
          onClick={onLogout}
          className="text-sm font-medium text-white px-5 py-2 rounded-md transition-colors"
          style={{ backgroundColor: '#dc2626' }}
        >
          Logout
        </button>
      </div>
    </div>
  );
}
