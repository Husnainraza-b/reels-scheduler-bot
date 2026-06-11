import { useState } from 'react';
import { KeyRound, Loader2, ShieldAlert, Zap } from 'lucide-react';

interface LoginScreenProps {
  onLogin: (password: string) => Promise<boolean>;
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;

    setIsLoading(true);
    setError('');

    const success = await onLogin(password);

    if (!success) {
      setError('Invalid admin password. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent to-purple-600 flex items-center justify-center shadow-xl shadow-accent/20 mb-4">
            <Zap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">
            Reels Autopilot
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Admin Dashboard Login
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-surface-card rounded-2xl border border-border p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Error Message */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-danger/10 border border-danger/20 rounded-xl">
                <ShieldAlert className="w-4 h-4 text-danger flex-shrink-0" />
                <span className="text-sm text-danger">{error}</span>
              </div>
            )}

            {/* Password Input */}
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                type="password"
                placeholder="Admin Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                className="w-full pl-10 pr-4 py-3 bg-surface-hover border border-border rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-focus transition-colors"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading || !password.trim()}
              className="w-full py-3 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors duration-200 flex items-center justify-center gap-2 cursor-pointer"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <KeyRound className="w-4 h-4" />
              )}
              {isLoading ? 'Authenticating...' : 'Unlock Dashboard'}
            </button>
          </form>

          <p className="text-xs text-text-muted text-center mt-4">
            Protected by admin authentication
          </p>
        </div>
      </div>
    </div>
  );
}
