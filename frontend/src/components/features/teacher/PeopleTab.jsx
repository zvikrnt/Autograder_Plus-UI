import { useState, useEffect } from "react";
import { Plus, UserPlus, MoreVertical, Mail, Trash2, Shield, GraduationCap, User, Search } from "lucide-react";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "../../ui/dropdown-menu";
import { classService } from "../../../services/classService";
import { useAuth } from "../../../contexts/AuthContext";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "../../ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "../../ui/avatar";

export default function PeopleTab({ classId }) {
    const { user } = useAuth();
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteRole, setInviteRole] = useState("student"); // 'student', 'ta', 'teacher'
    const [students, setStudents] = useState([]);
    const [teachers, setTeachers] = useState([]);
    const [tas, setTas] = useState([]);
    const [filterText, setFilterText] = useState("");
    const [loading, setLoading] = useState(true);
    const [inviteLoading, setInviteLoading] = useState(false);
    const [inviteOpen, setInviteOpen] = useState(false);
    const [removeTarget, setRemoveTarget] = useState(null); // member to confirm-remove
    const [removeLoading, setRemoveLoading] = useState(false);

    const loadClassMembers = async () => {
        if (!classId) return;

        try {
            setLoading(true);
            const response = await classService.getClassPeople(classId);

            if (response.success && response.data?.data) {
                const members = response.data.data;
                const studentMembers = members.filter(member => member.role === 'student');
                const teacherMembers = members.filter(member => member.role === 'teacher');
                const taMembers = members.filter(member => member.role === 'ta');

                setStudents(studentMembers);
                setTeachers(teacherMembers);
                setTas(taMembers);
            }
        } catch (error) {
            console.error('Failed to load class members:', error);
            setStudents([]);
            setTeachers([]);
            setTas([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadClassMembers();
    }, [classId]);

    const handleInvite = async () => {
        if (!inviteEmail) return;

        try {
            setInviteLoading(true);
            const response = await classService.addMember(classId, {
                email: inviteEmail,
                role: inviteRole
            });

            if (response.success) {
                // Refresh list
                await loadClassMembers();
                setInviteEmail("");
                setInviteOpen(false);
                alert("Member added successfully!");
            } else {
                alert(response.message || "Failed to add member");
            }
        } catch (error) {
            console.error('Invite failed:', error);
            const errorMessage = error.response?.data?.message || "Failed to invite member. User likely does not exist.";
            alert(errorMessage);
        } finally {
            setInviteLoading(false);
        }
    };

    const openInviteDialog = (role) => {
        setInviteRole(role);
        setInviteEmail("");
        setInviteOpen(true);
    };

    const handleRemove = async () => {
        if (!removeTarget) return;
        try {
            setRemoveLoading(true);
            const response = await classService.removeMember(classId, removeTarget.id);
            if (response.success) {
                setRemoveTarget(null);
                await loadClassMembers();
            } else {
                alert(response.message || "Failed to remove member");
            }
        } catch (error) {
            console.error('Remove failed:', error);
            alert("Failed to remove member.");
        } finally {
            setRemoveLoading(false);
        }
    };

    const renderMemberRow = (member) => {
        const isCurrentUser = user && member.id === user.id;

        // Handle name splitting for initials
        const nameParts = member.name ? member.name.split(' ') : ['?', '?'];
        const initials = nameParts.length > 1
            ? `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`
            : nameParts[0][0] || '?';

        return (
            <div key={member.id} className={`flex items-center justify-between py-4 px-4 hover:bg-gray-50 rounded-xl transition-all border-b border-gray-100 last:border-0 group ${isCurrentUser ? 'bg-indigo-50/50 hover:bg-indigo-50' : ''}`}>
                <div className="flex items-center gap-4">
                    <Avatar className="h-10 w-10 border-2 border-white shadow-sm">
                        <AvatarImage src={member.avatar_url} />
                        <AvatarFallback className={`${isCurrentUser ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}>
                            {initials}
                        </AvatarFallback>
                    </Avatar>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className={`font-semibold text-sm ${isCurrentUser ? 'text-indigo-900' : 'text-gray-900'}`}>
                                {member.name}
                            </span>
                            {isCurrentUser && (
                                <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded">
                                    You
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-gray-500">{member.email}</p>
                    </div>
                </div>

<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto">                    {!isCurrentUser && (
                        <>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50">
                                <Mail className="w-4 h-4" />
                            </Button>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-gray-900">
                                        <MoreVertical className="w-4 h-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                        className="text-red-600 focus:text-red-600 focus:bg-red-50 gap-2"
                                        onSelect={(e) => { e.preventDefault(); setTimeout(() => setRemoveTarget(member), 0); }}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                        Remove from class
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="max-w-5xl mx-auto space-y-10 pb-20">
            <div className="flex justify-end">
                <div className="relative w-full max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                        placeholder="Search members..."
                        className="pl-9"
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                    />
                </div>
            </div>

            {/* Invite Dialog */}
            <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Invite {inviteRole === 'ta' ? 'Teaching Assistant' : inviteRole === 'teacher' ? 'Teacher' : 'Student'}</DialogTitle>
                        <DialogDescription>
                            Enter the email address of the {inviteRole} you want to add.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Input
                                id="email"
                                placeholder="email@school.edu"
                                value={inviteEmail}
                                onChange={(e) => setInviteEmail(e.target.value)}
                            />
                            <Button onClick={handleInvite} disabled={inviteLoading}>
                                {inviteLoading ? "Sending Invite..." : "Send Invitation"}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Remove Confirmation Dialog */}
            <Dialog open={!!removeTarget} onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Remove from class?</DialogTitle>
                        <DialogDescription>
                            <strong>{removeTarget?.name}</strong> will lose access to this class immediately. This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-end gap-3 pt-2">
                        <Button variant="outline" onClick={() => setRemoveTarget(null)} disabled={removeLoading}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={handleRemove} disabled={removeLoading}>
                            {removeLoading ? "Removing..." : "Remove"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Teachers Section */}
            <div className="space-y-4">
                <div className="flex items-center justify-between border-b pb-2 mb-2">
                    <h2 className="text-2xl font-bold text-indigo-700 flex items-center gap-2">
                        Teachers
                    </h2>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    {teachers.filter(m => 
                        m.name.toLowerCase().includes(filterText.toLowerCase()) ||
                        m.email.toLowerCase().includes(filterText.toLowerCase())
                    ).map(renderMemberRow)}
                </div>
            </div>

            {/* TAs Section */}
            <div className="space-y-4">
                <div className="flex items-center justify-between border-b pb-2 mb-2">
                    <div className="flex items-center gap-3">
                        <h2 className="text-2xl font-bold text-indigo-700">Teaching Assistants</h2>
                        <span className="bg-indigo-50 text-indigo-700 text-xs font-bold px-2.5 py-1 rounded-full border border-indigo-100">
                            {tas.length}
                        </span>
                    </div>
                    <Button variant="outline" size="sm" className="gap-2 text-indigo-600 border-indigo-200 hover:bg-indigo-50" onClick={() => openInviteDialog('ta')}>
                        <UserPlus className="w-4 h-4" />
                        Invite TA
                    </Button>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    {tas.filter(m => m.name.toLowerCase().includes(filterText.toLowerCase()) || m.email.toLowerCase().includes(filterText.toLowerCase())).length === 0 ? (
                        <div className="p-8 text-center text-gray-500 bg-gray-50/50">
                            No Teaching Assistants match your search.
                        </div>
                    ) : (
                        tas.filter(m => m.name.toLowerCase().includes(filterText.toLowerCase()) || m.email.toLowerCase().includes(filterText.toLowerCase())).map(renderMemberRow)
                    )}
                </div>
            </div>

            {/* Students Section */}
            <div className="space-y-4">
                <div className="flex items-center justify-between border-b pb-2 mb-2">
                    <div className="flex items-center gap-3">
                        <h2 className="text-2xl font-bold text-indigo-700">Students</h2>
                        <span className="bg-indigo-50 text-indigo-700 text-xs font-bold px-2.5 py-1 rounded-full border border-indigo-100">
                            {students.length}
                        </span>
                    </div>
                    <Button variant="outline" size="sm" className="gap-2 text-indigo-600 border-indigo-200 hover:bg-indigo-50" onClick={() => openInviteDialog('student')}>
                        <UserPlus className="w-4 h-4" />
                        Invite Student
                    </Button>
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    {loading ? (
                        <div className="text-center py-12">
                            <p className="text-gray-500">Loading class roster...</p>
                        </div>
                    ) : students.filter(m => m.name.toLowerCase().includes(filterText.toLowerCase()) || m.email.toLowerCase().includes(filterText.toLowerCase())).length === 0 ? (
                        <div className="text-center py-12 bg-gray-50/50">
                            <div className="mb-3 flex justify-center">
                                <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-400">
                                    <GraduationCap className="w-6 h-6" />
                                </div>
                            </div>
                            <h3 className="text-gray-900 font-medium">No students enrolled yet</h3>
                            <p className="text-gray-500 text-sm mt-1">Invite students to get started</p>
                        </div>
                    ) : (
                        students.map(renderMemberRow)
                    )}
                </div>
            </div>
        </div>
    );
}
