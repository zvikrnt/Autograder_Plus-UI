import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";

// Deliberately minimal, standalone (no shared header/footer) — reachable
// only by typing /admin/login directly, not linked from anywhere. The API
// itself already enforces role='admin' on every /api/admin/* endpoint
// (backend/core/permissions.py: IsAdmin); the role check below is only to
// give a non-admin a clear message instead of a blank/broken dashboard.
export default function AdminLogin() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        const result = await login({ username, password });
        setLoading(false);

        if (!result.success) {
            setError(result.error || "Invalid credentials.");
            return;
        }
        if (result.user?.role !== "admin") {
            setError("This account does not have admin access.");
            return;
        }
        navigate("/admin", { replace: true });
    };

    return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
            <div className="w-full max-w-sm">
                <div className="flex items-center gap-2 justify-center mb-6">
                    <ShieldCheck className="w-6 h-6 text-gray-100" />
                    <span className="text-lg font-bold text-gray-100">Admin Portal</span>
                </div>

                <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-lg p-6 space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="username" className="text-gray-300">Username or email</Label>
                        <Input
                            id="username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            autoComplete="username"
                            required
                            className="bg-gray-800 border-gray-700 text-gray-100"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="password" className="text-gray-300">Password</Label>
                        <Input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete="current-password"
                            required
                            className="bg-gray-800 border-gray-700 text-gray-100"
                        />
                    </div>

                    {error && (
                        <p className="text-sm text-red-400">{error}</p>
                    )}

                    <Button type="submit" disabled={loading} className="w-full bg-gray-100 text-gray-900 hover:bg-white">
                        {loading ? "Signing in..." : "Sign in"}
                    </Button>
                </form>
            </div>
        </div>
    );
}
