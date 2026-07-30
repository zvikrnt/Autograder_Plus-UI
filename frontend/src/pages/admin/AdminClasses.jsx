import { useEffect, useState } from "react";
import { toast } from "sonner";
import AdminLayout from "../../components/layout/AdminLayout";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../../components/ui/table";
import { adminService } from "../../services/adminService";

export default function AdminClasses() {
    const [classes, setClasses] = useState([]);
    const [count, setCount] = useState(0);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        setLoading(true);
        const res = await adminService.getClasses();
        if (res.success) {
            setClasses(res.data.results || []);
            setCount(res.data.count ?? (res.data.results || []).length);
        } else {
            toast.error(res.message || "Failed to load classes.");
        }
        setLoading(false);
    };

    useEffect(() => { load(); }, []);

    const toggleArchive = async (c) => {
        const res = await adminService.setClassArchived(c.id, !c.is_archived);
        if (res.success) {
            toast.success(`${c.name} ${c.is_archived ? "unarchived" : "archived"}.`);
            load();
        } else {
            toast.error(res.message || "Could not update class.");
        }
    };

    return (
        <AdminLayout>
            <h1 className="text-xl font-bold text-gray-900 mb-4">
                Classes <span className="text-gray-400 font-normal text-base">({count})</span>
            </h1>

            <Card className="p-0 overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Owner</TableHead>
                            <TableHead>Students</TableHead>
                            <TableHead>Assignments</TableHead>
                            <TableHead>Submissions</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={7} className="text-center text-gray-500">Loading...</TableCell></TableRow>
                        ) : classes.length === 0 ? (
                            <TableRow><TableCell colSpan={7} className="text-center text-gray-500">No classes found.</TableCell></TableRow>
                        ) : classes.map((c) => (
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
                                <TableCell>
                                    <Button size="sm" variant="outline" onClick={() => toggleArchive(c)}>
                                        {c.is_archived ? "Unarchive" : "Archive"}
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Card>
        </AdminLayout>
    );
}
