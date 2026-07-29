import StudentLayout from "../../components/layout/StudentLayout";
import UserProfile from "../../components/auth/UserProfile";

export default function StudentProfile() {
    return (
        <StudentLayout>
            <div className="max-w-4xl mx-auto space-y-8 pt-4 pb-10">
                <div className="space-y-2">
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900 text-center">My Profile</h1>
                    <p className="text-gray-500 text-center">View your student account information.</p>
                </div>
                
                <UserProfile isReadOnly={true} />
            </div>
        </StudentLayout>
    );
}
