import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Loader2, ArrowLeft } from 'lucide-react';
import { useAuthStore } from '../../stores/auth';
import { getErrorMessage } from '../../lib/api';

export default function MFAPage() {
  const navigate = useNavigate();
  const { verifyMfa, mfaPending, logout } = useAuthStore();
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Redirect if no MFA pending
  useEffect(() => {
    if (!mfaPending) {
      navigate('/login');
    }
  }, [mfaPending, navigate]);

  // Focus first input on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleChange = (index: number, value: string) => {
    // Only allow digits
    if (value && !/^\d$/.test(value)) return;

    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when complete
    if (value && index === 5 && newCode.every((c) => c)) {
      handleSubmit(newCode.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    // Move to previous input on backspace
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);

    if (pastedData.length === 6) {
      const newCode = pastedData.split('');
      setCode(newCode);
      inputRefs.current[5]?.focus();
      handleSubmit(pastedData);
    }
  };

  const handleSubmit = async (fullCode: string) => {
    setIsLoading(true);
    try {
      await verifyMfa(fullCode);
      navigate('/');
    } catch (error) {
      toast.error(getErrorMessage(error));
      setCode(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="animate-fade-in">
      <button
        onClick={handleBack}
        className="flex items-center gap-2 text-neon-text-secondary hover:text-white mb-8"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to login</span>
      </button>

      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">Two-factor authentication</h1>
        <p className="text-neon-text-secondary">
          Enter the 6-digit code from your authenticator app
        </p>
      </div>

      <div className="space-y-6">
        {/* Code inputs */}
        <div className="flex justify-center gap-3">
          {code.map((digit, index) => (
            <input
              key={index}
              ref={(el) => (inputRefs.current[index] = el)}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              onPaste={handlePaste}
              disabled={isLoading}
              className="w-12 h-14 text-center text-2xl font-mono bg-neon-surface border border-neon-border rounded-lg
                focus:border-neon-border-focus focus:ring-1 focus:ring-neon-border-focus
                transition-colors duration-200 disabled:opacity-50"
            />
          ))}
        </div>

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex items-center justify-center gap-2 text-neon-text-secondary">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Verifying...</span>
          </div>
        )}

        {/* Help text */}
        <div className="text-center space-y-2">
          <p className="text-sm text-neon-text-muted">
            Open your authenticator app (Google Authenticator, Authy, etc.) and enter the code shown.
          </p>
          <button
            type="button"
            className="text-sm text-neon-text-secondary hover:text-white"
          >
            I can't access my authenticator
          </button>
        </div>
      </div>
    </div>
  );
}
