import { useEffect, useState } from "react";
import { toast } from "sonner";
import AdminLayout from "../../components/layout/AdminLayout";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../../components/ui/table";
import { adminService } from "../../services/adminService";

const StatTile = ({ label, value }) => (
    <Card className="p-4">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
    </Card>
);

export default function AdminOverview() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            const res = await adminService.getOverview();
            if (res.success) {
                setData(res.data);
            } else {
                toast.error(res.message || "Failed to load overview.");
            }
            setLoading(false);
        })();
    }, []);

    if (loading) {
        return <AdminLayout><p className="text-sm text-gray-500">Loading...</p></AdminLayout>;
    }
    if (!data) {
        return <AdminLayout><p className="text-sm text-red-600">Could not load overview data.</p></AdminLayout>;
    }

    const { totals, classes } = data;

    return (
        <AdminLayout>
            <h1 className="text-xl font-bold text-gray-900 mb-4">Overview</h1>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
                <StatTile label="Users" value={totals.users_total} />
                <StatTile label="Teachers" value={totals.users_by_role.teacher} />
                <StatTile label="TAs" value={totals.users_by_role.ta} />
                <StatTile label="Students" value={totals.users_by_role.student} />
                <StatTile label="Active classes" value={totals.classes_active} />
                <StatTile label="Archived classes" value={totals.classes_archived} />
                <StatTile label="Assignments" value={totals.assignments_total} />
                <StatTile label="Submissions (total)" value={totals.submissions_total} />
                <StatTile label="Submissions (7 days)" value={totals.submissions_last_7_days} />
            </div>

            <Card className="p-0 overflow-hidden">
                <div className="px-4 py-3 border-b bg-gray-50">
                    <h2 className="text-sm font-semibold text-gray-700">All Classes</h2>
                </div>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Owner</TableHead>
                            <TableHead>Students</TableHead>
                            <TableHead>Assignments</TableHead>
                            <TableHead>Submissions</TableHead>
                            <TableHead>Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {classes.map((c) => (
                            <TableRow key={c.id}>
                                <TableCell className="font-medium">{c.name} {c.section && <span className="text-gray-400">({c.section})</span>}</TableCell>
                                <TableCell>{c.owner_username}</TableCell>
                                <TableCell>{c.student_count}</TableCell>
                                <TableCell>{c.assignment_count}</TableCell>
                                <TableCell>{c.submission_count}</TableCell>
                                <TableCell>
                                    <Badge variant={c.is_archived ? "secondary" : "default"}>
                                        {c.is_archived ? "Archived" : "Active"}
                                    </Badge>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Card>
        </AdminLayout>
    );
}
