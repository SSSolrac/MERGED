import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

export const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, backend, bootstrapping, bootstrapError } = useAuth();
  const navigate = useNavigate();

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await login(email, password);
      toast.success('Login successful');
      navigate('/dashboard');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Login failed');
    }
  };

  return (
    <div className="min-h-screen bg-[#FFF7F9] flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-md rounded-xl bg-white border border-[#F3D6DB] p-6 shadow-[0_2px_10px_rgba(31,41,55,0.05)] space-y-4">
        <h1 className="text-2xl font-semibold">Staffowner Login</h1>
        {!backend.configured ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
            <p className="text-sm font-medium">Supabase is not configured.</p>
            <p className="text-xs mt-1">Missing env vars: {backend.missing.join(', ')}</p>
          </div>
        ) : null}
        {bootstrapError ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-900">
            <p className="text-sm">{bootstrapError}</p>
          </div>
        ) : null}
        <input className="w-full border rounded px-3 py-2" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="w-full border rounded px-3 py-2" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <button
          className="w-full rounded bg-[#FFB6C1] text-[#1F2937] py-2 disabled:opacity-60 disabled:cursor-not-allowed"
          disabled={bootstrapping || !backend.configured}
        >
          {bootstrapping ? 'Checking session...' : 'Sign in'}
        </button>
        <p className="text-xs text-[#6B7280]">Sign in with your owner or staff account email and password.</p>
      </form>
    </div>
  );
};
