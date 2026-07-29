import { useState } from "react";
import { Bell, MessageSquare, BookOpen, ChevronDown, Calendar, GraduationCap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Switch } from "../../components/ui/switch";
import { Label } from "../../components/ui/label";
import { Separator } from "../../components/ui/separator";
import StudentLayout from "../../components/layout/StudentLayout";
import UserProfile from "../../components/auth/UserProfile";

export default function StudentSettings() {
    const [emailNotifications, setEmailNotifications] = useState(true);

    // Detailed notification states
    const [commentsOnPosts, setCommentsOnPosts] = useState(true);
    const [commentsMentions, setCommentsMentions] = useState(true);
    const [privateComments, setPrivateComments] = useState(true);

    const [workFromTeachers, setWorkFromTeachers] = useState(true);
    const [returnedWork, setReturnedWork] = useState(true);
    const [classInvites, setClassInvites] = useState(true);
    const [dueDateReminders, setDueDateReminders] = useState(true);

    return (
        <StudentLayout>
            <div className="max-w-3xl mx-auto space-y-8 pb-10">
                <div className="space-y-2">
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900">Settings</h1>
                    <p className="text-gray-500">Manage your profile and notification preferences.</p>
                </div>

                {/* Profile Section */}
                <Card>
                    <CardHeader>
                        <CardTitle>Profile</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <UserProfile isReadOnly={false} />
                    </CardContent>
                </Card>

                {/* Notifications Section */}
                <Card>
                    <CardHeader>
                        <CardTitle>Notifications</CardTitle>
                        <CardDescription>Choose how you want to be notified.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-8">

                        {/* Email Global Toggle */}
                        <div className="flex items-start justify-between space-x-4">
                            <div className="space-y-1">
                                <Label htmlFor="email-notifs" className="text-base font-medium">Email</Label>
                                <p className="text-sm text-gray-500">
                                    These settings apply to the notifications you get by email.
                                </p>
                            </div>
                            <Switch
                                id="email-notifs"
                                checked={emailNotifications}
                                onCheckedChange={setEmailNotifications}
                            />
                        </div>

                        <Separator className="border-t border-gray-100 dark:border-gray-800" />

                        {/* Comments */}
                        {emailNotifications && (
                            <div className="space-y-6 animate-in slide-in-from-top-2 duration-200">
                                <div className="space-y-4">
                                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                                        <MessageSquare className="w-4 h-4" /> Comments
                                    </h3>
                                    <div className="space-y-4 pl-6">
                                        <div className="flex items-center justify-between">
                                            <Label htmlFor="comments-posts" className="font-normal text-gray-700">Comments on your posts</Label>
                                            <Switch id="comments-posts" checked={commentsOnPosts} onCheckedChange={setCommentsOnPosts} />
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <Label htmlFor="comments-mentions" className="font-normal text-gray-700">Comments that mention you</Label>
                                            <Switch id="comments-mentions" checked={commentsMentions} onCheckedChange={setCommentsMentions} />
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <Label htmlFor="private-comments" className="font-normal text-gray-700">Private comments on work</Label>
                                            <Switch id="private-comments" checked={privateComments} onCheckedChange={setPrivateComments} />
                                        </div>
                                    </div>
                                </div>

                                <Separator className="border-t border-gray-100 dark:border-gray-800" />

                                {/* Classes you are in */}
                                <div className="space-y-4">
                                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                                        <GraduationCap className="w-4 h-4" /> Classes you are in
                                    </h3>
                                    <div className="space-y-4 pl-6">
                                        <div className="flex items-center justify-between">
                                            <Label htmlFor="work-teachers" className="font-normal text-gray-700">Work and other posts from teachers</Label>
                                            <Switch id="work-teachers" checked={workFromTeachers} onCheckedChange={setWorkFromTeachers} />
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <Label htmlFor="returned-work" className="font-normal text-gray-700">Returned work and grades from your teachers</Label>
                                            <Switch id="returned-work" checked={returnedWork} onCheckedChange={setReturnedWork} />
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <Label htmlFor="invites" className="font-normal text-gray-700">Invitations to join classes as a student</Label>
                                            <Switch id="invites" checked={classInvites} onCheckedChange={setClassInvites} />
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <Label htmlFor="due-reminders" className="font-normal text-gray-700">Due-date reminders for your work</Label>
                                            <Switch id="due-reminders" checked={dueDateReminders} onCheckedChange={setDueDateReminders} />
                                        </div>
                                    </div>
                                </div>

                                <Separator className="border-t border-gray-100 dark:border-gray-800" />

                                {/* Class Notifications Dropdown */}
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between cursor-pointer group">
                                        <div className="space-y-1">
                                            <h3 className="font-semibold text-gray-900">Class notifications</h3>
                                            <p className="text-sm text-gray-500 group-hover:text-indigo-600 transition-colors">
                                                Turn email and mobile notifications on or off for a class
                                            </p>
                                        </div>
                                        <ChevronDown className="w-5 h-5 text-gray-400" />
                                    </div>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </StudentLayout>
    );
}
