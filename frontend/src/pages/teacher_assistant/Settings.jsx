import { useState } from "react";
import { User, Bell, Mail, MessageSquare, BookOpen, ChevronDown } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "../../components/ui/avatar";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Switch } from "../../components/ui/switch";
import { Label } from "../../components/ui/label";
import { Separator } from "../../components/ui/separator"; // We might need to create this or use hr
import TeacherAssistantLayout from "../../components/layout/TeacherAssistantLayout";

export default function Settings() {
    const [emailNotifications, setEmailNotifications] = useState(true);

    // Detailed notification states
    const [commentsOnPosts, setCommentsOnPosts] = useState(true);
    const [commentsMentions, setCommentsMentions] = useState(true);
    const [privateComments, setPrivateComments] = useState(true);

    const [lateSubmissions, setLateSubmissions] = useState(true);
    const [resubmissions, setResubmissions] = useState(true);
    const [coTeachInvites, setCoTeachInvites] = useState(true);
    const [scheduledPosts, setScheduledPosts] = useState(true);

    return (
        <TeacherAssistantLayout>
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
                        <div className="flex items-center gap-6">
                            <Avatar className="h-20 w-20">
                                <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
                                <AvatarFallback>JD</AvatarFallback>
                            </Avatar>
                            <div className="space-y-1">
                                <h3 className="text-xl font-medium">John Doe</h3>
                                <Button variant="link" className="p-0 h-auto text-indigo-600">
                                    Change profile picture
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-4 pt-4">
                            <div className="space-y-1">
                                <h4 className="font-medium text-gray-900">Account settings</h4>
                                <p className="text-sm text-gray-500">Change your password and security options, and access other Google services.</p>
                                <Button variant="link" className="p-0 h-auto text-indigo-600">Manage</Button>
                            </div>

                            <div className="space-y-1">
                                <h4 className="font-medium text-gray-900">Change name</h4>
                                <p className="text-sm text-gray-500">To change your name, go to your account settings.</p>
                            </div>
                        </div>
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
                                    These settings apply to the notifications you get by email. <span className="text-indigo-600 cursor-pointer">Learn more</span>
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

                                {/* Classes you teach */}
                                <div className="space-y-4">
                                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                                        <BookOpen className="w-4 h-4" /> Classes you teach
                                    </h3>
                                    <div className="space-y-4 pl-6">
                                        <div className="flex items-center justify-between">
                                            <Label htmlFor="late-subs" className="font-normal text-gray-700">Late submissions of student work</Label>
                                            <Switch id="late-subs" checked={lateSubmissions} onCheckedChange={setLateSubmissions} />
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <Label htmlFor="resubs" className="font-normal text-gray-700">Resubmissions of student work</Label>
                                            <Switch id="resubs" checked={resubmissions} onCheckedChange={setResubmissions} />
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <Label htmlFor="coteach" className="font-normal text-gray-700">Invitations to co-teach classes</Label>
                                            <Switch id="coteach" checked={coTeachInvites} onCheckedChange={setCoTeachInvites} />
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <Label htmlFor="scheduled-post" className="font-normal text-gray-700">Scheduled post published or failed</Label>
                                            <Switch id="scheduled-post" checked={scheduledPosts} onCheckedChange={setScheduledPosts} />
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
        </TeacherAssistantLayout>
    );
}


