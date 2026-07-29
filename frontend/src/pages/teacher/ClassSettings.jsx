import { useCallback, useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
    Save,
    RefreshCw,
    Lock,
    Unlock,
    Trash2,
    Archive,
    AlertTriangle,
    CheckCircle2,
    Settings,
    MoveLeft
} from "lucide-react";

import TeacherLayout from "../../components/layout/TeacherLayout";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { Switch } from "../../components/ui/switch";
import { Separator } from "../../components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";

import { classService } from "../../services/classService";

export default function ClassSettings() {
    const { classId } = useParams();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [classData, setClassData] = useState(null);
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState("");

    // Form State
    const [name, setName] = useState("");
    const [section, setSection] = useState("");
    const [settings, setSettings] = useState({
        enrollment_locked: false,
        allow_student_posts: true,
        show_leaderboard: true,
        late_submissions: false,
        theme: 'default'
    });

    const loadClassData = useCallback(async () => {
        try {
            setLoading(true);
            const res = await classService.getClass(classId);
            if (!res.success || !res.data) {
                throw new Error(res.message || "Failed to load class settings.");
            }

            const data = res.data;
            setClassData(data);
            setName(data.name || "");
            setSection(data.section || "");

            // Merge existing settings with defaults
            const savedSettings = data.settings || {};
            setSettings(prev => ({ ...prev, ...savedSettings }));
        } catch (err) {
            console.error("Failed to load class:", err);
            setError("Failed to load class settings.");
        } finally {
            setLoading(false);
        }
    }, [classId]);

    useEffect(() => {
        loadClassData();
    }, [loadClassData]);

    const handleSaveGeneral = async () => {
        setSaving(true);
        setSuccessMessage("");
        setError(null);
        try {
            const res = await classService.updateClass(classId, {
                name,
                section,
                settings // Save current settings along with name/section
            });
            if (!res.success) {
                throw new Error(res.message || "Failed to save changes.");
            }

            if (res.data) {
                setClassData(res.data);
                setName(res.data.name || "");
                setSection(res.data.section || "");
                setSettings(prev => ({ ...prev, ...(res.data.settings || {}) }));
            }
            setSuccessMessage("General settings saved successfully.");
            setTimeout(() => setSuccessMessage(""), 3000);
        } catch (err) {
            console.error("Save failed:", err);
            setError("Failed to save changes.");
        } finally {
            setSaving(false);
        }
    };

    // Toggle specific setting and save immediately
    const toggleSetting = async (key) => {
        const newSettings = { ...settings, [key]: !settings[key] };
        setSettings(newSettings);

        // Auto-save for toggles
        try {
            // We need to send name/section too because updateClass expects/allows them
            // or we might lose them if backend does full replace (usually PATCH is partial, PUT is full)
            // Assuming PUT based on service: `api.put`
            const res = await classService.updateClass(classId, {
                name,
                section,
                settings: newSettings
            });
            if (!res.success) {
                throw new Error(res.message || `Failed to update ${key}.`);
            }
        } catch (err) {
            console.error("Toggle save failed:", err);
            // Revert on failure
            setSettings(settings);
            setError(`Failed to update ${key}.`);
        }
    };

    const handleRegenerateCode = async () => {
        if (!confirm("Are you sure? Previous code will stop working immediately.")) return;

        try {
            const res = await classService.regenerateJoinCode(classId);
            if (!res.success || !res.data?.join_code) {
                throw new Error(res.message || "Failed to regenerate code.");
            }
            setClassData(prev => ({ ...prev, join_code: res.data.join_code }));
            setSuccessMessage("Join code regenerated.");
            setTimeout(() => setSuccessMessage(""), 3000);
        } catch (err) {
            console.error("Regeneration failed:", err);
            setError("Failed to regenerate code.");
        }
    };

    const handleArchive = async () => {
        if (!confirm("Are you sure you want to archive this class? It will be moved to the Archived tab.")) return;

        try {
            const res = await classService.archiveClass(classId);
            if (!res.success) {
                throw new Error(res.message || "Failed to archive class.");
            }
            navigate("/teacher/dashboard");
        } catch {
            setError("Failed to archive class.");
        }
    };

    const handleDelete = async () => {
        const confirmText = prompt(`Type "${classData?.name}" to confirm deletion. This cannot be undone.`);
        if (confirmText !== classData?.name) {
            if (confirmText) alert("Name did not match. Deletion cancelled.");
            return;
        }

        try {
            const res = await classService.deleteClass(classId);
            if (!res.success) {
                throw new Error(res.message || "Failed to delete class.");
            }
            navigate("/teacher/dashboard");
        } catch {
            setError("Failed to delete class.");
        }
    };

    if (loading) return <TeacherLayout><div>Loading...</div></TeacherLayout>;

    return (
        <TeacherLayout>
            <div className="max-w-4xl mx-auto p-8 space-y-8 pb-20">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            <Settings className="w-6 h-6 text-gray-500" />
                            Class Settings
                        </h1>
                        <p className="text-gray-500">Manage {classData?.name} ({classData?.section})</p>
                    </div>
                    <Button variant="outline" onClick={() => navigate(`/teacher/class/${classId}`)} className="gap-2">
                        <MoveLeft className="w-4 h-4" />
                        Back to Classroom
                    </Button>
                </div>

                {error && (
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Error</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                {successMessage && (
                    <Alert className="bg-green-50 text-green-700 border-green-200">
                        <CheckCircle2 className="h-4 w-4" />
                        <AlertTitle>Success</AlertTitle>
                        <AlertDescription>{successMessage}</AlertDescription>
                    </Alert>
                )}

                {/* 1. General Settings */}
                <Card>
                    <CardHeader>
                        <CardTitle>General Information</CardTitle>
                        <CardDescription>Update basic class details.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Class Name</Label>
                                <Input
                                    id="name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="section">Section</Label>
                                <Input
                                    id="section"
                                    value={section}
                                    onChange={(e) => setSection(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="flex justify-end pt-2">
                            <Button onClick={handleSaveGeneral} disabled={saving} className="gap-2">
                                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Save Changes
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* 2. Access & Enrollment */}
                <Card>
                    <CardHeader>
                        <CardTitle>Access & Enrollment</CardTitle>
                        <CardDescription>Control how students join your class.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border">
                            <div>
                                <h3 className="font-medium">Join Code</h3>
                                <p className="text-sm text-gray-500">Share this code with students to let them enroll.</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <Badge variant="outline" className="text-xl px-4 py-2 font-mono tracking-wider bg-white dark:bg-gray-800">
                                    {classData?.join_code}
                                </Badge>
                                <Button size="sm" variant="ghost" title="Regenerate Code" onClick={handleRegenerateCode}>
                                    <RefreshCw className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>

                        <Separator />

                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label className="text-base">Lock Enrollment</Label>
                                <p className="text-sm text-gray-500">
                                    Prevent new students from joining, even with a valid code.
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                {settings.enrollment_locked ? <Lock className="w-4 h-4 text-orange-500" /> : <Unlock className="w-4 h-4 text-green-500" />}
                                <Switch
                                    checked={settings.enrollment_locked}
                                    onCheckedChange={() => toggleSetting('enrollment_locked')}
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* 3. Features & Toggles */}
                <Card>
                    <CardHeader>
                        <CardTitle>Class Features</CardTitle>
                        <CardDescription>Customize the student experience.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label className="text-base">Student Stream Posts</Label>
                                <p className="text-sm text-gray-500">
                                    Allow students to create posts on the class stream.
                                </p>
                            </div>
                            <Switch
                                checked={settings.allow_student_posts}
                                onCheckedChange={() => toggleSetting('allow_student_posts')}
                            />
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label className="text-base">Show Leaderboard</Label>
                                <p className="text-sm text-gray-500">
                                    Visible to all students.
                                </p>
                            </div>
                            <Switch
                                checked={settings.show_leaderboard}
                                onCheckedChange={() => toggleSetting('show_leaderboard')}
                            />
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label className="text-base">Accept Late Submissions</Label>
                                <p className="text-sm text-gray-500">
                                    Default policy for new assignments.
                                </p>
                            </div>
                            <Switch
                                checked={settings.late_submissions}
                                onCheckedChange={() => toggleSetting('late_submissions')}
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* 4. Danger Zone */}
                <Card className="border-red-200">
                    <CardHeader>
                        <CardTitle className="text-red-600">Danger Zone</CardTitle>
                        <CardDescription>Irreversible and sensitive actions.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg border border-red-100">
                            <div>
                                <h4 className="font-medium text-red-900">Archive Class</h4>
                                <p className="text-sm text-red-700">Hides the class from your dashboard. Can be unarchived later.</p>
                            </div>
                            <Button variant="outline" className="border-red-200 text-red-700 hover:bg-red-100" onClick={handleArchive}>
                                <Archive className="w-4 h-4 mr-2" />
                                Archive
                            </Button>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg border border-red-100">
                            <div>
                                <h4 className="font-medium text-red-900">Delete Class</h4>
                                <p className="text-sm text-red-700">Permanently deletes the class and all associated data.</p>
                            </div>
                            <Button variant="destructive" onClick={handleDelete}>
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </TeacherLayout>
    );
}
