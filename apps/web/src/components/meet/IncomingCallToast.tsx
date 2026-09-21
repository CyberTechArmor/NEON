import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, PhoneOff, Video, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useMeetStore } from '../../stores/meet';

/**
 * The ring. Shown by MeetProvider while `incomingCall` is set — on every
 * page, including the conversation the call is in.
 *
 * Answer takes the user to the conversation and joins the caller's room in
 * one go: the embedded call pane appears in that conversation as soon as the
 * join resolves. Dismiss just stops the ring; the conversation card keeps
 * nothing, and the camera button in that conversation still lands in the
 * same room if they change their mind.
 */
export function IncomingCallToast() {
  const navigate = useNavigate();
  const incomingCall = useMeetStore((state) => state.incomingCall);
  const answerIncomingCall = useMeetStore((state) => state.answerIncomingCall);
  const dismissIncomingCall = useMeetStore((state) => state.dismissIncomingCall);
  const [answering, setAnswering] = useState(false);

  if (!incomingCall) return null;

  const isVideo = incomingCall.kind !== 'voice';
  const Icon = isVideo ? Video : Phone;

  const handleAnswer = async () => {
    setAnswering(true);
    const { conversationId } = incomingCall;
    navigate(`/chat/${conversationId}`);
    try {
      await answerIncomingCall();
    } catch (error: any) {
      toast.error(error?.message || 'Could not join the call');
    } finally {
      setAnswering(false);
    }
  };

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      aria-label={`${incomingCall.callerName} is calling`}
      className="fixed top-4 right-4 left-4 sm:left-auto sm:w-[360px] z-[110] rounded-xl border border-neon-success/50 bg-neon-surface shadow-2xl p-4"
    >
      <div className="flex items-center gap-3">
        {/* Ringing avatar */}
        <div className="relative flex-shrink-0">
          <span className="absolute inset-0 rounded-full bg-neon-success/40 animate-ping" />
          <div className="avatar avatar-md relative ring-2 ring-neon-success">
            {incomingCall.callerAvatarUrl ? (
              <img src={incomingCall.callerAvatarUrl} alt={incomingCall.callerName} className="w-full h-full object-cover" />
            ) : (
              <span>{incomingCall.callerName.charAt(0).toUpperCase()}</span>
            )}
          </div>
        </div>

        <div className="flex-1 min-w-0 flex items-center gap-2">
          <Icon className="w-5 h-5 text-neon-success animate-pulse flex-shrink-0" />
          <p className="font-medium truncate">{incomingCall.callerName} is calling</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          className="btn min-h-[44px] bg-neon-surface-hover hover:bg-neon-border text-white flex items-center justify-center gap-2"
          onClick={dismissIncomingCall}
          disabled={answering}
        >
          <PhoneOff className="w-4 h-4" />
          Dismiss
        </button>
        <button
          type="button"
          className="btn min-h-[44px] bg-neon-success hover:bg-neon-success/80 text-neon-bg font-semibold flex items-center justify-center gap-2"
          onClick={handleAnswer}
          disabled={answering}
        >
          {answering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
          Answer
        </button>
      </div>
    </div>
  );
}

export default IncomingCallToast;
