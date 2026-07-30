import { Link, useLocation, useNavigate } from "react-router-dom";
import {
    LayoutDashboard, Users, School, HeartPulse, Wrench, Archive, LogOut, ShieldCheck,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useAuth } from "../../contexts/AuthContext";

// Deliberately plain: no notifications bell, no breadcrumbs, no avatar
// dropdown — an information-dense utility screen, not the polished
// student/teacher UI. Same SidebarItem/SidebarSection idiom as
// TeacherLayout/StudentLayout for consistency with the rest of the app.
const SidebarItem = ({ icon: Icon, label, href, active }) => (
    <Link
        to={href}
        className={cn(
            "flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors",
            active
                ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
        )}
    >
        <Icon className="w-4 h-4" />
        {label}
    </Link>
);

export default function AdminLayout({ children }) {
    const location = useLocation();
    const navigate = useNavigate();
    const { logout, user } = useAuth();

    const handleLogout = () => {
        logout();
        navigate('/admin/login');
    };

    const items = [
        { icon: LayoutDashboard, label: "Overview", href: "/admin" },
        { icon: Users, label: "Users", href: "/admin/users" },
        { icon: School, label: "Classes", href: "/admin/classes" },
        { icon: HeartPulse, label: "System Health", href: "/admin/system" },
        { icon: Wrench, label: "Maintenance", href: "/admin/maintenance" },
        { icon: Archive, label: "Backups", href: "/admin/backups" },
    ];

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex">
            <aside className="w-56 bg-white dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800 fixed h-full z-30 flex flex-col">
                <div className="h-14 flex items-center gap-2 px-4 border-b border-gray-100 dark:border-gray-800">
                    <ShieldCheck className="w-5 h-5 text-gray-900 dark:text-gray-100" />
                    <span className="text-sm font-bold text-gray-900 dark:text-gray-100 tracking-tight">
                        Admin Portal
                    </span>
                </div>

                <nav className="flex-1 overflow-y-auto p-3 space-y-1">
                    {items.map((it) => (
                        <SidebarItem key={it.href} {...it} active={location.pathname === it.href} />
                    ))}
                </nav>

                <div className="p-3 border-t border-gray-100 dark:border-gray-800">
                    <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 truncate">
                        {user?.username}
                    </div>
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 px-3 py-2 w-full text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950 rounded-md transition-colors"
                    >
                        <LogOut className="w-4 h-4" />
                        Sign Out
                    </button>
                </div>
            </aside>

            <div className="flex-1 ml-56 flex flex-col min-h-screen">
                <main className="p-6 flex-1 max-w-6xl w-full">
                    {children}
                </main>
            </div>
        </div>
    );
}
