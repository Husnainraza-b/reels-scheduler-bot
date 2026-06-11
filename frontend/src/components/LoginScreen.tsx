import { useState } from 'react';
import { Lock, Loader2, ShieldAlert, ArrowRight } from 'lucide-react';

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
    <div className="bg-surface text-text-primary min-h-screen flex flex-col justify-center items-center px-6 md:px-16 relative overflow-hidden selection:bg-accent selection:text-surface">

      {/* Ambient Glow Backdrop */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150vw] h-[150vw] md:w-[60vw] md:h-[60vw] bg-surface-hover rounded-full opacity-[0.03] blur-[100px] pointer-events-none" />

      {/* Main Content */}
      <main className="w-full max-w-[400px] flex flex-col space-y-16 z-10">

        {/* Brand */}
        <header className="flex flex-col items-center space-y-4">
          <h1 className="text-subheading-caps text-text-primary tracking-[0.3em] text-center">
            REELS AUTOPILOT
          </h1>
          <p className="text-body-md text-text-secondary opacity-70">
            Admin Access
          </p>
        </header>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="flex flex-col space-y-8">

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-3 p-4 bg-danger/10 border border-danger/15 rounded-lg">
              <ShieldAlert className="w-4 h-4 text-danger flex-shrink-0" />
              <span className="text-body-md text-danger">{error}</span>
            </div>
          )}

          {/* Password Input with animated underline */}
          <div className="relative group input-underline">
            <label htmlFor="passcode" className="sr-only">Passcode</label>
            <div className="flex items-center border-b border-border/40 group-focus-within:border-transparent transition-colors duration-300 pb-2">
              <Lock className="w-[18px] h-[18px] text-text-muted group-focus-within:text-accent transition-colors duration-300 mr-3 flex-shrink-0" />
              <input
                id="passcode"
                type="password"
                placeholder="Enter Vault Passcode"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                className="w-full bg-transparent border-none text-text-primary text-body-md focus:outline-none focus:ring-0 placeholder:text-text-muted/40 p-0"
              />
            </div>
          </div>

          {/* Submit Button — filled on mobile, bordered on desktop */}
          {/* Mobile: champagne filled button */}
          <button
            type="submit"
            disabled={isLoading || !password.trim()}
            className="
              w-full py-4 rounded-lg
              flex items-center justify-center gap-2
              text-[14px] font-medium tracking-wider uppercase
              transition-all duration-300 cursor-pointer
              disabled:opacity-30
              bg-accent text-surface hover:bg-accent-hover active:scale-[0.98]
              md:bg-surface-card md:text-text-primary md:border md:border-border md:hover:border-accent md:hover:bg-surface-hover md:active:scale-100
              group/btn
            "
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <span>Authenticate</span>
                <ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover/btn:opacity-100 group-hover/btn:translate-x-0 transition-all duration-300" />
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <footer className="flex justify-center pt-4">
          <span className="text-[12px] text-text-muted/40">
            Request Access
          </span>
        </footer>

      </main>

      {/* Bottom Bar — desktop only */}
      <div className="hidden md:flex fixed bottom-0 left-0 right-0 border-t border-border/30 bg-surface justify-between items-center px-16 py-6">
        <span className="text-subheading-caps text-text-muted/50">
          © 2024 REELS AUTOPILOT. ALL RIGHTS RESERVED.
        </span>
        <div className="flex gap-6">
          <span className="text-[12px] text-text-secondary/50 hover:text-text-primary transition-colors cursor-pointer">Privacy</span>
          <span className="text-[12px] text-text-secondary/50 hover:text-text-primary transition-colors cursor-pointer">Terms</span>
          <span className="text-[12px] text-text-secondary/50 hover:text-text-primary transition-colors cursor-pointer">Support</span>
        </div>
      </div>

    </div>
  );
}
