import { useState, useEffect } from "react";
import { notificationService } from "../../services/notificationService";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
    LayoutDashboard,
    BookOpen,
    BarChart3,
    Settings,
    LogOut,
    Code2,
    Bell,
    Search,
    ChevronDown,
    Menu,
    Clock,
    CheckCircle2,
    MessageSquare,
    GraduationCap,
    Calendar,
    HelpCircle,
    Zap,
    Trophy,
    PencilRuler
} from "lucide-react";
import GuideModal from "../GuideModal";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "../ui/dropdown-menu";
import { classService } from "../../services/classService";
import { useAuth } from "../../contexts/AuthContext";

const SidebarItem = ({ icon: Icon, label, href, active, count }) => (
    <Link
        to={href}
        className={cn(
            "flex items-center justify-between px-3 py-2 text-sm font-medium rounded-md transition-colors",
            active
                ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
        )}
    >
        <div className="flex items-center gap-3">
            <Icon className="w-5 h-5" />
            {label}
        </div>
        {count && (
            <span className="bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-full">
                {count}
            </span>
        )}
    </Link>
);



const SidebarSection = ({ title, children }) => (
    <div className="mb-6">
        <h4 className="px-3 mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            {title}
        </h4>
        <div className="space-y-1">
            {children}
        </div>
    </div>
);

export default function StudentLayout({ children, refreshTrigger = 0 }) {
    const location = useLocation();
    const navigate = useNavigate();
    const { logout, user } = useAuth();
    const [classes, setClasses] = useState([]);
    const [notifications, setNotifications] = useState([]);
    const [showGuide, setShowGuide] = useState(false);

    useEffect(() => {
        const fetchNotifications = async () => {
            try {
                const res = await notificationService.getNotifications();
                // setNotifications(res.data.results || res.data || []);
                if (res.success && res.data) {
                    setNotifications(Array.isArray(res.data) ? res.data : (res.data.results || []));
                } else {
                    setNotifications([]);
                }
            } catch (err) {
                console.error("Failed to fetch notifications", err);
            }
        };
        fetchNotifications();
        // Poll every minute
        const interval = setInterval(fetchNotifications, 60000);
        return () => clearInterval(interval);
    }, []);

    const handleMarkAsRead = async (id) => {
        try {
            await notificationService.markAsRead(id);
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
        } catch (err) {
            console.error("Failed to mark notification as read", err);
        }
    };

    const handleMarkAllAsRead = async () => {
        try {
            await notificationService.markAllAsRead();
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        } catch (err) {
            console.error("Failed to mark all notifications as read", err);
        }
    };

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    useEffect(() => {
        const fetchClasses = async () => {
            try {
                const response = await classService.getClasses();
                const data = Array.isArray(response.data) ? response.data : (response.data.results || []);
                setClasses(data);
            } catch (error) {
                console.error("Failed to fetch classes for sidebar", error);
            }
        };
        fetchClasses();
    }, [refreshTrigger]);

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex">
            {/* Sidebar */}
            <aside className="w-64 bg-white dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800 fixed h-full z-30 hidden md:flex flex-col">
                <div className="h-16 flex items-center px-6 border-b border-gray-100 dark:border-gray-800">
                    <Code2 className="w-7 h-7 text-indigo-600 mr-2" />
                    <span className="text-xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Autograder</span>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                    <SidebarSection title="Workspace">
                        <SidebarItem
                            icon={LayoutDashboard}
                            label="Dashboard"
                            href="/student/dashboard"
                            active={location.pathname === "/student/dashboard"}
                        />
                        <SidebarItem
                            icon={BookOpen}
                            label="Assignments"
                            href="/student/assignments"
                            active={location.pathname === "/student/assignments"}
                        />
                        <SidebarItem
                            icon={Code2}
                            label="Practice"
                            href="/student/practice"
                            active={location.pathname === "/student/practice"}
                        />
                        <SidebarItem
                            icon={Zap}
                            label="Adaptive Practice"
                            href="/student/adaptive"
                            active={location.pathname === "/student/adaptive"}
                        />
                        <SidebarItem
                            icon={PencilRuler}
                            label="Blackboard"
                            href="/student/blackboard"
                            active={location.pathname === "/student/blackboard"}
                        />
                        <SidebarItem
                            icon={Trophy}
                            label="Leaderboard"
                            href="/student/leaderboard"
                            active={location.pathname === "/student/leaderboard"}
                        />
                        <SidebarItem
                            icon={Calendar}
                            label="Calendar"
                            href="/student/calendar"
                            active={location.pathname === "/student/calendar"}
                        />
                    </SidebarSection>

                    <SidebarSection title="My Classes">
                        {classes.length > 0 ? (
                            classes.map(cls => (
                                <SidebarItem
                                    key={cls.id}
                                    icon={GraduationCap}
                                    label={cls.name}
                                    href={`/student/class/${cls.id}`} // We can define this route later
                                    active={location.pathname === `/student/class/${cls.id}`}
                                />
                            ))
                        ) : (
                            <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500 italic">No classes joined</div>
                        )}
                    </SidebarSection>

                    <SidebarSection title="Insights">
                        <SidebarItem
                            icon={BarChart3}
                            label="My Performance"
                            href="/student/performance"
                            active={location.pathname === "/student/performance"}
                        />
                    </SidebarSection>

                    <SidebarSection title="Account">
                        <SidebarItem
                            icon={Settings}
                            label="Settings"
                            href="/student/settings"
                            active={location.pathname === "/student/settings"}
                        />
                    </SidebarSection>
                </div>

                <div className="p-4 border-t border-gray-100 dark:border-gray-800 space-y-2">
                    <button
                        onClick={() => setShowGuide(true)}
                        className="flex items-center gap-3 px-3 py-2 w-full text-sm font-medium text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950 rounded-md transition-colors"
                    >
                        <HelpCircle className="w-5 h-5" />
                        GUIDE
                    </button>
                    {showGuide && <GuideModal onClose={() => setShowGuide(false)} />}

                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 px-3 py-2 w-full text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950 rounded-md transition-colors"
                    >
                        <LogOut className="w-5 h-5" />
                        Sign Out
                    </button>
                </div>
            </aside>

            {/* Main Content Wrapper */}
            <div className="flex-1 md:ml-64 flex flex-col min-h-screen">
                {/* Topbar */}
                <header className="h-16 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-4 sm:px-8 sticky top-0 z-20">
                    <div className="flex items-center gap-4 flex-1">
                        {/* Mobile Overlay Toggle */}
                        <Button variant="ghost" size="icon" className="md:hidden">
                            <Menu className="w-5 h-5" />
                        </Button>

                        {/* Breadcrumbs Placeholder */}
                        <nav className="hidden sm:flex items-center text-sm font-medium text-gray-500 dark:text-gray-400">
                            <span className="text-gray-900 dark:text-gray-100 font-semibold">Student Workspace</span>
                        </nav>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Search Bar */}
                        <div className="hidden md:block relative w-64 transition-all focus-within:w-80">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                            <Input
                                placeholder="Search assignments or concepts..."
                                className="pl-9 bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 focus:bg-white dark:focus:bg-gray-800 transition-colors"
                            />
                        </div>

                        <div className="relative">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="text-gray-500 hover:text-gray-900 relative">
                                        <Bell className="w-5 h-5" />
                                        {/* <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white" /> */}
                                        {notifications.filter(n => !n.is_read).length > 0 && (
                                            <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
                                        )}
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-80 p-0 bg-white">
                                    <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                                        <h4 className="font-semibold text-gray-900">
                                            Notifications
                                            {notifications.filter(n => !n.is_read).length > 0 && (
                                                <span className="ml-2 text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                                                    {notifications.filter(n => !n.is_read).length}
                                                </span>
                                            )}
                                        </h4>
                                        <span
                                            className="text-xs text-indigo-600 hover:text-indigo-700 cursor-pointer"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleMarkAllAsRead();
                                            }}
                                        >
                                            Mark all read
                                        </span>
                                    </div>
                                    <div className="max-h-[350px] overflow-y-auto">
                                        {notifications.length === 0 ? (
                                            <div className="p-4 text-center text-sm text-gray-500">No notifications</div>
                                        ) : (
                                            notifications.map((notif) => (
                                                <DropdownMenuItem
                                                    key={notif.id}
                                                    className="p-4 cursor-pointer focus:bg-gray-50 border-b border-gray-50 last:border-0 items-start gap-3"
                                                    onClick={(e) => {
                                                        if (!notif.is_read) {
                                                            handleMarkAsRead(notif.id);
                                                        }
                                                        if (notif.reference_link) {
                                                            navigate(notif.reference_link);
                                                        }
                                                    }}
                                                >
                                                    <div className={`mt-1 p-1.5 rounded-full shrink-0 ${notif.type === 'submission' ? 'bg-green-100 text-green-600' :
                                                        notif.type === 'comment' ? 'bg-blue-100 text-blue-600' :
                                                            notif.type === 'invite' ? 'bg-purple-100 text-purple-600' :
                                                                'bg-orange-100 text-orange-600'
                                                        }`}>
                                                        {notif.type === 'submission' ? <CheckCircle2 className="w-3.5 h-3.5" /> :
                                                            notif.type === 'comment' ? <MessageSquare className="w-3.5 h-3.5" /> :
                                                                notif.type === 'invite' ? <GraduationCap className="w-3.5 h-3.5" /> :
                                                                    <Clock className="w-3.5 h-3.5" />
                                                        }
                                                    </div>
                                                    <div className="space-y-1">
                                                        <div className="flex justify-between items-start gap-2">
                                                            <p className={`text-sm ${!notif.is_read ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                                                                {notif.title}
                                                            </p>
                                                            {!notif.is_read && <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full mt-1.5" />}
                                                        </div>
                                                        <p className="text-xs text-gray-500 line-clamp-2">{notif.message}</p>
                                                        <p className="text-xs text-gray-400 pt-1">{new Date(notif.created_at).toLocaleString()}</p>
                                                    </div>
                                                </DropdownMenuItem>
                                            ))
                                        )}
                                    </div>
                                    <div className="p-3 border-t border-gray-100 bg-gray-50 text-center">
                                        <span className="text-xs h-auto p-0 text-gray-500">Total: {notifications.length} notifications</span>
                                    </div>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>

                        <div className="h-6 w-px bg-gray-200 mx-1 hidden sm:block" />

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="flex items-center gap-2 pl-2 pr-1 rounded-full hover:bg-gray-100 ring-offset-2 focus-visible:ring-2">
                                    <Avatar className="w-8 h-8 border-2 border-indigo-200">
                                        {user?.avatar_url && (
                                            <AvatarImage src={`${user.avatar_url.startsWith('http') ? user.avatar_url : `${window.location.origin}${user.avatar_url.startsWith('/') ? '' : '/'}${user.avatar_url}`}?_t=${Date.now()}`} alt="" />
                                        )}
                                        <AvatarFallback className="text-xs font-bold bg-indigo-100 text-indigo-700">
                                            {user?.first_name?.[0]}{user?.last_name?.[0]}
                                        </AvatarFallback>
                                    </Avatar>
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 hidden sm:block">
                                        {user?.first_name} {user?.last_name?.[0]}.
                                    </span>
                                    <ChevronDown className="w-4 h-4 text-gray-400" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem asChild className="cursor-pointer">
                                    <Link to="/student/profile">Profile</Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild className="cursor-pointer">
                                    <Link to="/student/settings">Settings</Link>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    onClick={handleLogout}
                                    className="text-red-600 focus:text-red-700 focus:bg-red-50 cursor-pointer"
                                >
                                    Logout
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </header>

                {/* Page Content */}
                <main className="p-4 sm:p-8 flex-1">
                    {children}
                </main>
            </div>
        </div>
    );
}
