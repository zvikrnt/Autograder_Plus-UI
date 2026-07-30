import { useEffect, useState } from "react";
import { toast } from "sonner";
import AdminLayout from "../../components/layout/AdminLayout";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Badge } from "../../components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../../components/ui/table";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter, DialogClose } from "../../components/ui/dialog";
import { adminService } from "../../services/adminService";
import { useAuth } from "../../contexts/AuthContext";

const ROLES = ["student", "teacher", "ta", "admin"];

function AddUserDialog({ onCreated }) {
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState({ username: "", email: "", first_name: "", last_name: "", role: "teacher", password: "" });
    const [saving, setSaving] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setSaving(true);
        const res = await adminService.createUser(form);
        setSaving(false);
        if (res.success) {
            toast.success(`Created ${form.role} "${form.username}".`);
            setOpen(false);
            setForm({ username: "", email: "", first_name: "", last_name: "", role: "teacher", password: "" });
            onCreated();
        } else {
            toast.error(res.message || JSON.stringify(res.errors || {}) || "Failed to create user.");
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm">Add user</Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Add user</DialogTitle>
                    <DialogDescription>Creates an account directly — mainly for adding teachers.</DialogDescription>
                </DialogHeader>
                <form onSubmit={submit} className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label>First name</Label>
                            <Input required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                            <Label>Last name</Label>
                            <Input required value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <Label>Username</Label>
                        <Input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                        <Label>Email</Label>
                        <Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                        <Label>Role</Label>
                        <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1">
                        <Label>Temporary password</Label>
                        <Input type="password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                    </div>
                    <DialogFooter>
                        <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                        <Button type="submit" disabled={saving}>{saving ? "Creating..." : "Create"}</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function SetPasswordDialog({ targetUser, onDone }) {
    const [open, setOpen] = useState(false);
    const [password, setPassword] = useState("");
    const [saving, setSaving] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setSaving(true);
        const res = await adminService.setUserPassword(targetUser.id, password);
        setSaving(false);
        if (res.success) {
            toast.success(res.data.message || "Password reset.");
            setOpen(false);
            setPassword("");
            onDone();
        } else {
            toast.error(res.message || "Failed to reset password.");
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm" variant="outline">Set password</Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Reset password for {targetUser.username}</DialogTitle>
                    <DialogDescription>
                        Passwords are hashed and cannot be viewed — this sets a new one and signs the
                        user out of any existing sessions.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={submit} className="space-y-3">
                    <div className="space-y-1">
                        <Label>New password</Label>
                        <Input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
                    </div>
                    <DialogFooter>
                        <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                        <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Reset password"}</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export default function AdminUsers() {
    const { user: me } = useAuth();
    const [users, setUsers] = useState([]);
    const [count, setCount] = useState(0);
    const [search, setSearch] = useState("");
    const [roleFilter, setRoleFilter] = useState("all");
    const [loading, setLoading] = useState(true);

    const load = async () => {
        setLoading(true);
        const res = await adminService.getUsers({ search, role: roleFilter === "all" ? "" : roleFilter });
        if (res.success) {
            setUsers(res.data.results || []);
            setCount(res.data.count ?? (res.data.results || []).length);
        } else {
            toast.error(res.message || "Failed to load users.");
        }
        setLoading(false);
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { load(); }, [search, roleFilter]);

    const handleRoleChange = async (u, role) => {
        const res = await adminService.updateUser(u.id, { role });
        if (res.success) {
            toast.success(`${u.username} is now ${role}.`);
            load();
        } else {
            toast.error(res.message || "Could not change role.");
        }
    };

    const handleToggleActive = async (u) => {
        const res = await adminService.updateUser(u.id, { is_active: !u.is_active });
        if (res.success) {
            toast.success(`${u.username} ${u.is_active ? "deactivated" : "activated"}.`);
            load();
        } else {
            toast.error(res.message || "Could not update user.");
        }
    };

    const handleDelete = async (u) => {
        if (!window.confirm(`Delete ${u.username}? This cannot be undone.`)) return;
        const res = await adminService.deleteUser(u.id);
        if (res.success) {
            toast.success(`Deleted ${u.username}.`);
            load();
        } else {
            toast.error(res.message || "Could not delete user.");
        }
    };

    return (
        <AdminLayout>
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-xl font-bold text-gray-900">Users <span className="text-gray-400 font-normal text-base">({count})</span></h1>
                <AddUserDialog onCreated={load} />
            </div>

            <div className="flex gap-3 mb-4">
                <Input
                    placeholder="Search name, username, email..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="max-w-sm"
                />
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All roles</SelectItem>
                        {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>

            <Card className="p-0 overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Username</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={6} className="text-center text-gray-500">Loading...</TableCell></TableRow>
                        ) : users.length === 0 ? (
                            <TableRow><TableCell colSpan={6} className="text-center text-gray-500">No users found.</TableCell></TableRow>
                        ) : users.map((u) => (
                            <TableRow key={u.id}>
                                <TableCell>{u.first_name} {u.last_name}</TableCell>
                                <TableCell className="font-mono text-xs">{u.username}</TableCell>
                                <TableCell className="text-gray-500">{u.email}</TableCell>
                                <TableCell>
                                    <Select
                                        value={u.role}
                                        onValueChange={(v) => handleRoleChange(u, v)}
                                        disabled={u.id === me?.id}
                                    >
                                        <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </TableCell>
                                <TableCell>
                                    <Badge
                                        variant={u.is_active ? "default" : "secondary"}
                                        className="cursor-pointer"
                                        onClick={() => handleToggleActive(u)}
                                    >
                                        {u.is_active ? "Active" : "Inactive"}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    <div className="flex gap-2">
                                        <SetPasswordDialog targetUser={u} onDone={load} />
                                        <Button
                                            size="sm"
                                            variant="destructive"
                                            disabled={u.id === me?.id}
                                            onClick={() => handleDelete(u)}
                                        >
                                            Delete
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Card>
        </AdminLayout>
    );
}
