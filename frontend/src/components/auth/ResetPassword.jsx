import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../ui/button';
import RiveLoginAnimation from './RiveLoginAnimation';
import { authService } from '../../services/authService';

const ResetPassword = () => {
    const { uid, token } = useParams();
    const navigate = useNavigate();

    // Form state
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    // UI state
    const [isLoading, setIsLoading] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        if (newPassword !== confirmPassword) {
            setError("Passwords don't match.");
            setIsLoading(false);
            return;
        }

        if (newPassword.length < 8) {
            setError("Password must be at least 8 characters long.");
            setIsLoading(false);
            return;
        }

        try {
            await authService.resetPasswordConfirm(uid, token, newPassword);
            setIsSuccess(true);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to reset password. The link may be invalid or expired.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen w-full bg-white dark:bg-gray-800">
            {/* Left Side - Animation & Branding */}
            <div className="hidden lg:flex lg:w-1/2 relative bg-[#f9fafb] items-center justify-center overflow-hidden">
                <div className="absolute top-8 left-8">
                    <h1 className="text-2xl font-bold text-indigo-900 tracking-tight">Autograder +</h1>
                </div>

                <div className="w-[80%] max-w-[600px] h-[600px]">
                    <RiveLoginAnimation />
                </div>

                <div className="absolute bottom-8 text-center text-indigo-900/60 text-sm">
                    <p>© 2026 Autograder Platform. All rights reserved.</p>
                </div>
            </div>

            {/* Right Side - Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-8 md:p-12 lg:p-24 bg-white dark:bg-gray-800">
                <div className="w-full max-w-md space-y-8">
                    {!isSuccess ? (
                        <>
                            <div className="text-center lg:text-left space-y-2">
                                <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 tracking-tight">
                                    Set new password
                                </h2>
                                <p className="text-gray-500 text-lg">
                                    Your new password must be different from previously used passwords.
                                </p>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-6 mt-8">
                                {error && (
                                    <div className="p-4 bg-red-50 border-l-4 border-red-500 text-red-700 rounded shadow-sm">
                                        <p className="text-sm font-medium">{error}</p>
                                    </div>
                                )}

                                <div className="space-y-5">
                                    <div className="space-y-2">
                                        <label htmlFor="newPassword" className="text-sm font-semibold text-gray-700 block">
                                            New Password
                                        </label>
                                        <div className="relative">
                                            <input
                                                id="newPassword"
                                                name="newPassword"
                                                type={showPassword ? 'text' : 'password'}
                                                required
                                                value={newPassword}
                                                onChange={(e) => setNewPassword(e.target.value)}
                                                className="block w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 shadow-sm transition-all duration-200 placeholder-gray-400 dark:placeholder-gray-500 outline-none pr-10"
                                                placeholder="Enter new password"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-400 transition-colors"
                                            >
                                                {showPassword ? (
                                                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                                    </svg>
                                                ) : (
                                                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                    </svg>
                                                )}
                                            </button>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1">Must be at least 8 characters.</p>
                                    </div>

                                    <div className="space-y-2">
                                        <label htmlFor="confirmPassword" className="text-sm font-semibold text-gray-700 block">
                                            Confirm Password
                                        </label>
                                        <input
                                            id="confirmPassword"
                                            name="confirmPassword"
                                            type="password"
                                            required
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            className="block w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 shadow-sm transition-all duration-200 placeholder-gray-400 dark:placeholder-gray-500 outline-none"
                                            placeholder="Confirm new password"
                                        />
                                    </div>
                                </div>

                                <Button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full py-3.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-0.5"
                                >
                                    {isLoading ? 'Resetting password...' : 'Reset password'}
                                </Button>

                                <div className="text-center mt-6">
                                    <Link
                                        to="/login"
                                        className="inline-flex items-center text-sm font-bold text-gray-600 hover:text-indigo-600 transition-colors"
                                    >
                                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                        </svg>
                                        Back to Log in
                                    </Link>
                                </div>
                            </form>
                        </>
                    ) : (
                        <div className="mt-8 space-y-6 text-center lg:text-left">
                            <div className="p-6 bg-green-50 rounded-2xl border border-green-100">
                                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto lg:mx-0 mb-4">
                                    <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                                <h3 className="text-lg font-bold text-gray-900 mb-2">Password reset</h3>
                                <p className="text-gray-600">
                                    Your password has been successfully reset. Click below to log in properly.
                                </p>
                            </div>

                            <Button
                                onClick={() => navigate('/login')}
                                className="w-full py-3.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-0.5"
                            >
                                Continue to Log in
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ResetPassword;
