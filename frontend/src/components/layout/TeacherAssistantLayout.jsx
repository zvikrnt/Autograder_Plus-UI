import { notificationService } from "../../services/notificationService";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";

import {
    LayoutDashboard,
    Calendar,
    BookOpen,
    Archive,
    Settings,
    LogOut,
    GraduationCap,
    Bell,
    Search,
    ChevronDown,
    Menu,
    Clock,
    CheckCircle2,
    MessageSquare,
    Brain,
    HelpCircle
} from "lucide-react";
import GuideModal from "../GuideModal";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "../ui/dropdown-menu";
import { useAuth } from "../../contexts/AuthContext";

const SidebarItem = ({ icon: Icon, label, href, active, count }) => (
    <Link
        to={href}
        className={cn(
            "flex items-center justify-between px-3 py-2 text-sm font-medium rounded-md transition-colors",
            active
                ? "bg-indigo-50 text-indigo-700"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
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
        <h4 className="px-3 mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            {title}
        </h4>
        <div className="space-y-1">
            {children}
        </div>
    </div>
);

export default function TeacherAssistantLayout({ children }) {
    const location = useLocation();
    const navigate = useNavigate();
    const { logout, user } = useAuth();

    const [notifications, setNotifications] = useState([]); // Initialize state
    const [loading, setLoading] = useState(true);
    const [showGuide, setShowGuide] = useState(false);

    useEffect(() => {
        const fetchNotifications = async () => {
            try {
                const res = await notificationService.getNotifications();
                setNotifications(res.data.results || res.data || []);
            } catch (err) {
                console.error("Failed to fetch notifications", err);
            } finally {
                setLoading(false);
            }
        };
        fetchNotifications();
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

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex">
            {/* Sidebar */}
            <aside className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 fixed h-full z-30 hidden md:flex flex-col">
                <div className="h-16 flex items-center px-6 border-b border-gray-100 dark:border-gray-800">
                    <GraduationCap className="w-7 h-7 text-indigo-600 mr-2" />
                    <span className="text-xl font-bold text-gray-900 tracking-tight">Autograder +</span>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                    <SidebarSection title="Main">
                        <SidebarItem
                            icon={LayoutDashboard}
                            label="Dashboard"
                            href="/teacher/dashboard"
                            active={location.pathname === "/teacher/dashboard"}
                        />
                        <SidebarItem
                            icon={Calendar}
                            label="Calendar"
                            href="/teacher/calendar"
                            active={location.pathname === "/teacher/calendar"}
                        />
                    </SidebarSection>

                    <SidebarSection title="Teaching">
                        <SidebarItem
                            icon={BookOpen} // Was Assignments or Classes, let's make it distinct if we had a global list
                            label="All Assignments"
                            href="/teacher/assignments" // Placeholder for a global assignment view
                            active={location.pathname === "/teacher/assignments"}
                        />
                        <SidebarItem
                            icon={Brain}
                            label="Practice Questions"
                            href="/teacher/practice"
                            active={location.pathname === "/teacher/practice"}
                        />
                        <SidebarItem
                            icon={Archive}
                            label="Archived Classes"
                            href="/teacher/archived"
                            active={location.pathname === "/teacher/archived"}
                        />
                    </SidebarSection>

                    <SidebarSection title="Preferences">
                        <SidebarItem
                            icon={Settings}
                            label="Settings"
                            href="/teacher/settings"
                            active={location.pathname === "/teacher/settings"}
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
                {/* Topbar */}
                <header className="h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-4 sm:px-8 sticky top-0 z-20">
                    <div className="flex items-center gap-4 flex-1">
                        {/* Mobile Overlay Toggle */}
                        <Button variant="ghost" size="icon" className="md:hidden">
                            <Menu className="w-5 h-5" />
                        </Button>

                        {/* Dynamic Breadcrumbs */}
                        <nav className="hidden sm:flex items-center text-sm font-medium text-gray-500 capitalize">
                            <Link to="/teacher/dashboard" className="hover:text-gray-900 transition-colors">
                                Classroom
                            </Link>
                            {location.pathname.split('/').filter(p => p !== 'teacher').map((segment, index) => (
                                <div key={segment} className="flex items-center">
                                    <span className="mx-2 text-gray-300">/</span>
                                    <span className={cn(
                                        "truncate max-w-[150px]",
                                        index === location.pathname.split('/').filter(p => p !== 'teacher').length - 1
                                            ? "text-gray-900 font-semibold"
                                            : "hover:text-gray-900 cursor-pointer transition-colors"
                                    )}>
                                        {segment.replace(/-/g, ' ')}
                                    </span>
                                </div>
                            ))}
                        </nav>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Search Bar */}
                        <div className="hidden md:block relative w-64 lg:w-80 transition-all focus-within:w-96">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                            <Input
                                placeholder="Search students, classes, or assignments..."
                                className="pl-9 bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 focus:bg-white transition-colors"
                            />
                        </div>
                        <Button variant="ghost" size="icon" className="md:hidden text-gray-500">
                            <Search className="w-5 h-5" />
                        </Button>

                        <div className="relative">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="text-gray-500 hover:text-gray-900 relative">
                                        <Bell className="w-5 h-5" />
                                        <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white dark:border-gray-700" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-80 p-0 bg-white dark:bg-gray-800">
                                    <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                                        <h4 className="font-semibold text-gray-900">Notifications</h4>
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
                                    <div className="p-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 text-center">
                                        <span className="text-xs h-auto p-0 text-gray-500">Total: {notifications.length} notifications</span>
                                    </div>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>

                        <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 mx-1 hidden sm:block" />

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="flex items-center gap-2 pl-2 pr-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 ring-offset-2 focus-visible:ring-2">
                                    <Avatar className="w-8 h-8 border-2 border-indigo-200">
                                        {user?.avatar_url && (
                                            <AvatarImage src={`${user.avatar_url.startsWith('http') ? user.avatar_url : `${window.location.origin}${user.avatar_url.startsWith('/') ? '' : '/'}${user.avatar_url}`}?_t=${Date.now()}`} alt="" />
                                        )}
                                        <AvatarFallback className="text-xs font-bold bg-indigo-100 text-indigo-700">
                                            {user?.first_name?.[0]}{user?.last_name?.[0]}
                                        </AvatarFallback>
                                    </Avatar>
                                    <span className="text-sm font-medium text-gray-700 hidden sm:block">
                                        {user?.first_name} {user?.last_name}
                                    </span>
                                    <ChevronDown className="w-4 h-4 text-gray-400" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem asChild className="cursor-pointer">
                                    <Link to="/teacher/profile">Profile</Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild className="cursor-pointer">
                                    <Link to="/teacher/settings">Settings</Link>
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
