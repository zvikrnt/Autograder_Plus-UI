import { useState, useEffect } from "react";
import StudentLayout from "../../components/layout/StudentLayout";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { ChevronLeft, ChevronRight, Clock, BookOpen, AlertCircle, CheckCircle2 } from "lucide-react";
import { assignmentService } from "../../services/assignmentService";
import { submissionService } from "../../services/submissionService";

export default function StudentCalendar() {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadEvents = async () => {
            try {
                setLoading(true);
                const [assignRes, subRes] = await Promise.all([
                    assignmentService.getAssignments(),
                    submissionService.getSubmissions(),
                ]);

                const calendarEvents = [];

                // Assignment due dates
                if (assignRes.success && assignRes.data) {
                    const assignments = Array.isArray(assignRes.data) ? assignRes.data : (assignRes.data.results || []);
                    assignments.forEach(a => {
                        const calendarDate = a.due_date || a.start_time;
                        if (!calendarDate) return;
                        const displayType = a.type === 'quiz' ? 'Quiz' : a.mode === 'exam' ? 'Exam' : 'Assignment';
                        calendarEvents.push({
                            id: `due-${a.id}`,
                            title: a.title,
                            date: new Date(calendarDate),
                            type: displayType,
                            className: a.class_name || 'Unknown Class',
                            isSubmitted: !!a.is_submitted,
                            kind: 'due',
                        });
                    });
                }

                // Submission dates (completed assignments/exams)
                if (subRes.success && subRes.data) {
                    const submissions = Array.isArray(subRes.data) ? subRes.data : (subRes.data.results || []);
                    submissions.forEach(s => {
                        const subDate = s.submitted_at || s.created_at;
                        if (!subDate) return;
                        calendarEvents.push({
                            id: `sub-${s.id}`,
                            title: s.assignment_title || 'Submitted',
                            date: new Date(subDate),
                            type: s.assignment_type || 'Submission',
                            className: s.class_name || '',
                            isSubmitted: true,
                            kind: 'submission',
                        });
                    });
                }

                setEvents(calendarEvents);
            } catch (error) {
                console.error('Failed to load calendar events:', error);
                setEvents([]);
            } finally {
                setLoading(false);
            }
        };

        loadEvents();
    }, []);

    const getDaysInMonth = (date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const days = new Date(year, month + 1, 0).getDate();
        const firstDay = new Date(year, month, 1).getDay();
        return { days, firstDay };
    };

    const { days, firstDay } = getDaysInMonth(currentDate);

    const prevMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    };

    const nextMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    };

    const isToday = (day) => {
        const today = new Date();
        return day === today.getDate() &&
            currentDate.getMonth() === today.getMonth() &&
            currentDate.getFullYear() === today.getFullYear();
    };

    const getEventsForDay = (day) => {
        return events.filter(event => {
            const eventDate = new Date(event.date);
            return eventDate.getDate() === day &&
                eventDate.getMonth() === currentDate.getMonth() &&
                eventDate.getFullYear() === currentDate.getFullYear();
        });
    };

    const getUpcomingAssignments = () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return events
            .filter(e => e.kind === 'due' && !e.isSubmitted && new Date(e.date) >= today)
            .sort((a, b) => new Date(a.date) - new Date(b.date))
            .slice(0, 5);
    };

    const getDueSoon = () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const threeDaysFromNow = new Date(today.getTime() + (3 * 24 * 60 * 60 * 1000));
        return events
            .filter(e => e.kind === 'due' && !e.isSubmitted && new Date(e.date) >= today && new Date(e.date) <= threeDaysFromNow)
            .sort((a, b) => new Date(a.date) - new Date(b.date));
    };

    const pillStyle = (event) => {
        if (event.kind === 'submission') {
            return 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200';
        }
        if (event.isSubmitted) {
            return 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200 line-through';
        }
        switch (event.type) {
            case 'Exam': return 'bg-red-100 text-red-700 border-red-200 hover:bg-red-200';
            case 'Quiz': return 'bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200';
            default: return 'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200';
        }
    };

    return (
        <StudentLayout>
            <div className="max-w-6xl mx-auto space-y-6 pb-10">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-gray-900">My Calendar</h1>
                        <p className="text-gray-500">Track your assignments, deadlines, and submissions.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    {/* Calendar Grid */}
                    <Card className="lg:col-span-3 flex flex-col">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b">
                            <CardTitle className="text-xl font-semibold capitalize">
                                {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                            </CardTitle>
                            <div className="flex items-center gap-1">
                                <Button variant="outline" size="icon" onClick={prevMonth}>
                                    <ChevronLeft className="w-4 h-4" />
                                </Button>
                                <Button variant="outline" onClick={() => setCurrentDate(new Date())}>
                                    Today
                                </Button>
                                <Button variant="outline" size="icon" onClick={nextMonth}>
                                    <ChevronRight className="w-4 h-4" />
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="flex-1 p-0 flex flex-col">
                            <div className="grid grid-cols-7 border-b bg-gray-50 dark:bg-gray-900">
                                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                                    <div key={day} className="py-2 text-center text-sm font-semibold text-gray-500">
                                        {day}
                                    </div>
                                ))}
                            </div>

                            <div className="grid grid-cols-7 auto-rows-fr">
                                {[...Array(firstDay)].map((_, i) => (
                                    <div key={`empty-${i}`} className="border-b border-r bg-gray-50/30 dark:bg-gray-900/30 p-2 min-h-[100px]" />
                                ))}
                                {Array.from({ length: days }, (_, i) => i + 1).map(day => {
                                    const dayEvents = getEventsForDay(day);
                                    const hasSubmission = dayEvents.some(e => e.kind === 'submission');
                                    return (
                                        <div
                                            key={day}
                                            className={`border-b border-r p-2 min-h-[100px] relative transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 group flex flex-col gap-1 ${
                                                isToday(day) ? 'bg-blue-50/30' : ''
                                            }`}
                                        >
                                            <span
                                                className={`relative text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full mb-1 ${
                                                    isToday(day)
                                                        ? 'bg-blue-600 text-white'
                                                        : 'text-gray-700'
                                                }`}
                                            >
                                                {day}
                                                {hasSubmission && (
                                                    <CheckCircle2 className="absolute -top-0.5 -right-0.5 w-3 h-3 text-green-500" />
                                                )}
                                            </span>

                                            <div className="flex flex-col gap-1 overflow-y-auto max-h-[96px]">
                                                {dayEvents.map(event => (
                                                    <div
                                                        key={event.id}
                                                        className={`text-sm px-2 py-1 rounded truncate border shadow-sm cursor-pointer ${pillStyle(event)}`}
                                                        title={`${event.title}${event.className ? ` - ${event.className}` : ''}${event.kind === 'submission' ? ' (Submitted)' : ''}`}
                                                    >
                                                        {event.kind === 'submission' ? (
                                                            <span className="flex items-center gap-1">
                                                                <CheckCircle2 className="w-3 h-3 shrink-0" />
                                                                <span className="truncate">{event.title}</span>
                                                            </span>
                                                        ) : (
                                                            <span className="truncate">{event.title}</span>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Sidebar */}
                    <div className="space-y-6 flex flex-col">
                        <Card className="flex-shrink-0">
                            <CardHeader className="border-b bg-red-50/50 pb-3">
                                <CardTitle className="text-sm font-medium text-red-600 uppercase tracking-wider flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4" />
                                    Due Soon
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 space-y-3">
                                {getDueSoon().length > 0 ? (
                                    getDueSoon().map(event => (
                                        <div key={event.id} className="flex gap-3 p-2 bg-red-50 rounded-lg border border-red-100">
                                            <div className="flex flex-col items-center min-w-[2.5rem] text-red-600">
                                                <span className="text-sm font-bold uppercase">
                                                    {event.date.toLocaleString('default', { month: 'short' })}
                                                </span>
                                                <span className="text-lg font-bold leading-none">
                                                    {event.date.getDate()}
                                                </span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4 className="text-sm font-semibold text-gray-900 truncate">
                                                    {event.title}
                                                </h4>
                                                <p className="text-sm text-gray-500 truncate">{event.className}</p>
                                                <div className="flex items-center gap-1 mt-1">
                                                    <Clock className="w-3 h-3 text-gray-400" />
                                                    <span className="text-sm text-gray-400">11:59 PM</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-sm text-gray-500 text-center py-4">
                                        No assignments due soon!
                                    </p>
                                )}
                            </CardContent>
                        </Card>

                        <Card className="flex-1 flex flex-col overflow-hidden">
                            <CardHeader className="border-b bg-gray-50/50 dark:bg-gray-900/50 pb-3">
                                <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                    <BookOpen className="w-4 h-4" />
                                    Upcoming
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
                                {getUpcomingAssignments().map(event => (
                                    <div key={event.id} className="flex gap-3 group">
                                        <div className="flex flex-col items-center min-w-[3rem] p-2 bg-blue-50 rounded text-blue-600">
                                            <span className="text-sm font-bold uppercase">
                                                {event.date.toLocaleString('default', { month: 'short' })}
                                            </span>
                                            <span className="text-xl font-bold leading-none">
                                                {event.date.getDate()}
                                            </span>
                                        </div>
                                        <div className="flex-1">
                                            <h4 className="text-sm font-semibold text-gray-900 line-clamp-1 group-hover:text-blue-600 transition-colors">
                                                {event.title}
                                            </h4>
                                            <p className="text-sm text-gray-500 mt-0.5">{event.className}</p>
                                            <div className="flex items-center gap-1.5 mt-1.5">
                                                <Clock className="w-3 h-3 text-gray-400" />
                                                <span className="text-sm text-gray-400">11:59 PM</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </StudentLayout>
    );
}
