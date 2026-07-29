import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { assignmentService } from '../../services/assignmentService';
import { Button } from '../../components/ui/button';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { toast } from 'sonner';

// Status colour map
const STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-800',
  running: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-100 text-gray-600',
  failed: 'bg-red-100 text-red-800',
};

function ProgressBar({ completed, total }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
      <div
        className="bg-indigo-500 h-1.5 rounded-full transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function LogPanel({ lines }) {
  const bottomRef = useRef(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  if (!lines || lines.length === 0) {
    return (
      <p className="text-xs text-gray-400 italic mt-2">No logs yet — pipeline has not started.</p>
    );
  }

  return (
    <div className="mt-2 bg-gray-950 rounded-lg p-3 max-h-56 overflow-y-auto font-mono text-xs text-green-300 leading-relaxed">
      {lines.map((line, i) => (
        <div key={i} className="whitespace-pre-wrap break-all">
          {line}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

export default function AIAnalysisTasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedLogs, setExpandedLogs] = useState({});  // task_id -> bool

  const toggleLogs = (taskId) =>
    setExpandedLogs((prev) => ({ ...prev, [taskId]: !prev[taskId] }));

  const fetchTasks = async () => {
    try {
      // Load AI analysis + cluster grading tasks in parallel and merge them.
      const [aiRes, clusterRes] = await Promise.allSettled([
        assignmentService.getAIAnalysisTasks(),
        assignmentService.getClusterGradingTasks(),
      ]);
      const ai = (aiRes.status === 'fulfilled' ? aiRes.value.data : []) || [];
      const cluster = (clusterRes.status === 'fulfilled' ? clusterRes.value.data : []) || [];
      // Ensure a kind marker even if an older backend omits it.
      const merged = [
        ...ai.map((t) => ({ ...t, kind: t.kind || 'ai' })),
        ...cluster.map((t) => ({ ...t, kind: t.kind || 'cluster' })),
      ];
      setTasks(merged);
    } catch (e) {
      if (e.response?.status === 403) toast.error('Admin only');
      else toast.error('Failed to load tasks');
      setTasks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
    const id = setInterval(fetchTasks, 5000); // poll every 5s for live updates
    return () => clearInterval(id);
  }, []);

  const handleCancel = async (assignmentId, kind) => {
    try {
      if (kind === 'cluster') {
        await assignmentService.cancelClusterGrade(assignmentId);
      } else {
        await assignmentService.cancelAIAnalysis(assignmentId);
      }
      toast.success('Cancelled');
      fetchTasks();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Cancel failed');
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-gray-500">
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        Loading…
      </div>
    );
  }

  return (
    <TeacherLayout>
      <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-4">
          <Link to="/teacher/dashboard" className="text-indigo-600 hover:underline text-sm">
            ← Back
          </Link>
          <h1 className="text-xl font-semibold">Background Tasks</h1>
        </div>
        <Button variant="outline" size="sm" onClick={fetchTasks}>
          Refresh
        </Button>
      </div>

      {tasks.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">✅</p>
          <p>No active background tasks.</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {tasks.map((t) => {
            const total = t.total_batches || 0;
            const done = t.completed_batches || 0;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            const isActive = t.status === 'pending' || t.status === 'running';
            const logsOpen = !!expandedLogs[t.task_id];

            const kindLabel = t.kind === 'cluster' ? 'Cluster Grading' : 'AI Analysis';
            const kindClass = t.kind === 'cluster'
              ? 'bg-purple-100 text-purple-700'
              : 'bg-indigo-100 text-indigo-700';

            return (
              <li
                key={`${t.kind}:${t.task_id}`}
                className="border rounded-lg p-4 bg-white shadow-sm"
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${kindClass}`}>
                        {kindLabel}
                      </span>
                      <p className="font-medium truncate">{t.assignment_title}</p>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[t.status] || 'bg-gray-100 text-gray-700'}`}
                      >
                        {t.status}
                      </span>
                    </div>

                    {/* Progress */}
                    <p className="text-sm text-gray-500 mt-0.5">
                      {total > 0
                        ? `Question ${done}/${total} · ${t.analyzed ?? 0} submissions analysed · ${pct}%`
                        : 'Queuing…'}
                    </p>
                    {total > 0 && <ProgressBar completed={done} total={total} />}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 shrink-0 mt-0.5">
                    <Link to={`/teacher/assignment/${t.assignment_id}`}>
                      <Button variant="outline" size="sm">Open</Button>
                    </Link>
                    {isActive && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleCancel(t.assignment_id, t.kind)}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>

                {/* Log toggle */}
                <button
                  onClick={() => toggleLogs(t.task_id)}
                  className="mt-3 text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                >
                  {logsOpen ? '▾ Hide logs' : '▸ Show pipeline logs'}
                  {t.log_output?.length > 0 && (
                    <span className="ml-1 bg-indigo-100 text-indigo-700 rounded-full px-1.5 py-0.5 text-[10px]">
                      {t.log_output.length}
                    </span>
                  )}
                </button>
                {logsOpen && <LogPanel lines={t.log_output} />}
              </li>
            );
          })}
        </ul>
      )}
      </div>
    </TeacherLayout>
  );
}
