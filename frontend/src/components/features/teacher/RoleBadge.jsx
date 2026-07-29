// Role → badge styling for colored teacher/TA/student labels across class views.
const ROLE_BADGE = {
    teacher: { label: "Teacher", cls: "bg-indigo-100 text-indigo-700 border-indigo-200" },
    ta: { label: "TA", cls: "bg-green-100 text-green-700 border-green-200" },
    student: { label: "Student", cls: "bg-gray-100 text-gray-600 border-gray-200" },
};

export function RoleBadge({ role }) {
    const meta = ROLE_BADGE[role];
    if (!meta) return null;
    return (
        <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border ${meta.cls}`}>
            {meta.label}
        </span>
    );
}
