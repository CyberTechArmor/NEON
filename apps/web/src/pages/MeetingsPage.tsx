import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { formatDistanceToNow, format } from 'date-fns';
import {
  Calendar,
  Plus,
  Video,
  Clock,
  Users,
  MoreVertical,
  Play,
  Trash2,
  Pencil,
  X,
  Loader2,
} from 'lucide-react';
import { meetingsApi, usersApi, getErrorMessage } from '../lib/api';
import { useAuthStore } from '../stores/auth';

interface Meeting {
  id: string;
  title: string;
  description?: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'ENDED' | 'CANCELLED';
  participants: Array<{
    userId: string;
    user: { id: string; displayName: string; avatarUrl?: string };
    isHost: boolean;
  }>;
  createdBy: { id: string; displayName: string };
}

interface User {
  id: string;
  displayName: string;
  email: string;
  avatarUrl?: string;
}

// Meeting card component
function MeetingCard({
  meeting,
  onJoin,
  onEdit,
  onDelete,
}: {
  meeting: Meeting;
  onJoin: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const { user } = useAuthStore();
  const isHost = meeting.participants.some(
    (p) => p.userId === user?.id && p.isHost
  );
  const isUpcoming = new Date(meeting.scheduledStart) > new Date();
  const isInProgress = meeting.status === 'IN_PROGRESS';

  return (
    <div className="card p-4 hover:bg-neon-surface-hover/50 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium truncate">{meeting.title}</h3>
            {isInProgress && (
              <span className="px-2 py-0.5 text-xs bg-neon-success/20 text-neon-success rounded-full">
                In Progress
              </span>
            )}
          </div>
          {meeting.description && (
            <p className="text-sm text-neon-text-muted mb-2 line-clamp-2">
              {meeting.description}
            </p>
          )}
          <div className="flex items-center gap-4 text-sm text-neon-text-muted">
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {format(new Date(meeting.scheduledStart), 'MMM d, h:mm a')}
            </span>
            <span className="flex items-center gap-1">
              <Users className="w-4 h-4" />
              {meeting.participants.length} participants
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {(isUpcoming || isInProgress) && (
            <button className="btn btn-primary btn-sm" onClick={onJoin}>
              <Play className="w-4 h-4" />
              <span>{isInProgress ? 'Join' : 'Start'}</span>
            </button>
          )}

          {isHost && (
            <div className="relative">
              <button
                className="btn btn-icon btn-ghost btn-sm"
                onClick={() => setShowMenu(!showMenu)}
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              {showMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowMenu(false)}
                  />
                  <div className="absolute right-0 top-full mt-1 z-20 dropdown-menu min-w-[150px]">
                    <button
                      className="dropdown-item w-full"
                      onClick={() => {
                        setShowMenu(false);
                        onEdit();
                      }}
                    >
                      <Pencil className="w-4 h-4" />
                      <span>Edit</span>
                    </button>
                    <button
                      className="dropdown-item dropdown-item-danger w-full"
                      onClick={() => {
                        setShowMenu(false);
                        onDelete();
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Cancel</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Create/Edit meeting modal
function MeetingModal({
  isOpen,
  onClose,
  meeting,
  onSubmit,
  isLoading,
}: {
  isOpen: boolean;
  onClose: () => void;
  meeting?: Meeting | null;
  onSubmit: (data: {
    title: string;
    description?: string;
    scheduledStart: string;
    scheduledEnd?: string;
    participantIds?: string[];
  }) => void;
  isLoading: boolean;
}) {
  const [title, setTitle] = useState(meeting?.title || '');
  const [description, setDescription] = useState(meeting?.description || '');
  const [startDate, setStartDate] = useState(
    meeting?.scheduledStart
      ? format(new Date(meeting.scheduledStart), "yyyy-MM-dd'T'HH:mm")
      : format(new Date(Date.now() + 3600000), "yyyy-MM-dd'T'HH:mm")
  );
  const [duration, setDuration] = useState(60);
  const [selectedUsers, setSelectedUsers] = useState<string[]>(
    meeting?.participants.map((p) => p.userId) || []
  );
  const [userSearch, setUserSearch] = useState('');

  // Fetch users for participant selection
  const { data: usersData } = useQuery({
    queryKey: ['users', userSearch],
    queryFn: async () => {
      const response = await usersApi.list({ search: userSearch, limit: 20 });
      return response.data.data as User[];
    },
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const startDateTime = new Date(startDate);
    const endDateTime = new Date(startDateTime.getTime() + duration * 60000);

    onSubmit({
      title,
      description: description || undefined,
      scheduledStart: startDateTime.toISOString(),
      scheduledEnd: endDateTime.toISOString(),
      participantIds: selectedUsers,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-neon-surface border border-neon-border rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-neon-border">
          <h2 className="text-lg font-semibold">
            {meeting ? 'Edit Meeting' : 'Schedule Meeting'}
          </h2>
          <button
            className="btn btn-icon btn-ghost btn-sm"
            onClick={onClose}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Title</label>
            <input
              type="text"
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Meeting title"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Description (optional)
            </label>
            <textarea
              className="input min-h-[80px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Meeting description"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Start Time
              </label>
              <input
                type="datetime-local"
                className="input"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Duration (minutes)
              </label>
              <select
                className="input"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              >
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={45}>45 minutes</option>
                <option value={60}>1 hour</option>
                <option value={90}>1.5 hours</option>
                <option value={120}>2 hours</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Participants
            </label>
            <input
              type="text"
              className="input mb-2"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Search users..."
            />
            <div className="max-h-[150px] overflow-y-auto space-y-1">
              {usersData?.map((u) => (
                <label
                  key={u.id}
                  className="flex items-center gap-2 p-2 rounded hover:bg-neon-surface-hover cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedUsers.includes(u.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedUsers([...selectedUsers, u.id]);
                      } else {
                        setSelectedUsers(selectedUsers.filter((id) => id !== u.id));
                      }
                    }}
                    className="w-4 h-4"
                  />
                  <div className="avatar avatar-sm">
                    {u.avatarUrl ? (
                      <img src={u.avatarUrl} alt={u.displayName} />
                    ) : (
                      <span>{u.displayName?.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <span className="text-sm">{u.displayName}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-neon-border">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!title.trim() || isLoading}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <span>{meeting ? 'Update' : 'Schedule'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function MeetingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [filter, setFilter] = useState<'upcoming' | 'past' | 'all'>('upcoming');

  // Fetch meetings
  const { data: meetings, isLoading } = useQuery({
    queryKey: ['meetings', filter],
    queryFn: async () => {
      const response = await meetingsApi.list({
        status: filter === 'upcoming' ? 'SCHEDULED' : filter === 'past' ? 'ENDED' : undefined,
      });
      return response.data.data as Meeting[];
    },
  });

  // Create meeting mutation
  const createMutation = useMutation({
    mutationFn: async (data: {
      title: string;
      description?: string;
      scheduledStart: string;
      scheduledEnd?: string;
      participantIds?: string[];
    }) => {
      const response = await meetingsApi.create(data);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      toast.success('Meeting scheduled');
      setShowModal(false);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  // Update meeting mutation
  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: { title?: string; description?: string; scheduledStart?: string; scheduledEnd?: string };
    }) => {
      const response = await meetingsApi.update(id, data);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      toast.success('Meeting updated');
      setEditingMeeting(null);
      setShowModal(false);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  // Delete meeting mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await meetingsApi.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      toast.success('Meeting cancelled');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  // Join meeting
  const handleJoin = async (meetingId: string) => {
    try {
      const response = await meetingsApi.join(meetingId);
      const { token, url } = response.data.data;
      // Navigate to meeting page with token
      navigate(`/meeting/${meetingId}`, { state: { token, url } });
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleSubmit = (data: {
    title: string;
    description?: string;
    scheduledStart: string;
    scheduledEnd?: string;
    participantIds?: string[];
  }) => {
    if (editingMeeting) {
      updateMutation.mutate({ id: editingMeeting.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-neon-border bg-neon-surface/50">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Calendar className="w-6 h-6" />
            Meetings
          </h1>
          <div className="flex gap-1 bg-neon-surface rounded-lg p-1">
            {(['upcoming', 'past', 'all'] as const).map((f) => (
              <button
                key={f}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  filter === f
                    ? 'bg-neon-surface-hover text-white'
                    : 'text-neon-text-muted hover:text-white'
                }`}
                onClick={() => setFilter(f)}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            setEditingMeeting(null);
            setShowModal(true);
          }}
        >
          <Plus className="w-4 h-4" />
          <span>Schedule Meeting</span>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-neon-text-muted" />
          </div>
        ) : !meetings?.length ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 mb-4 rounded-full bg-neon-surface flex items-center justify-center">
              <Video className="w-8 h-8 text-neon-text-muted" />
            </div>
            <h3 className="text-lg font-medium mb-1">No meetings</h3>
            <p className="text-neon-text-muted mb-4">
              {filter === 'upcoming'
                ? "You don't have any upcoming meetings"
                : filter === 'past'
                ? "You don't have any past meetings"
                : "You haven't scheduled any meetings yet"}
            </p>
            <button
              className="btn btn-primary"
              onClick={() => {
                setEditingMeeting(null);
                setShowModal(true);
              }}
            >
              <Plus className="w-4 h-4" />
              <span>Schedule your first meeting</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3 max-w-3xl mx-auto">
            {meetings.map((meeting) => (
              <MeetingCard
                key={meeting.id}
                meeting={meeting}
                onJoin={() => handleJoin(meeting.id)}
                onEdit={() => {
                  setEditingMeeting(meeting);
                  setShowModal(true);
                }}
                onDelete={() => {
                  if (confirm('Are you sure you want to cancel this meeting?')) {
                    deleteMutation.mutate(meeting.id);
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Meeting modal */}
      <MeetingModal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setEditingMeeting(null);
        }}
        meeting={editingMeeting}
        onSubmit={handleSubmit}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}
