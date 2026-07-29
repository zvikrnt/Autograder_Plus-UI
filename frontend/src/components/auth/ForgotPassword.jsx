import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import RiveLoginAnimation from './RiveLoginAnimation';
import { authService } from '../../services/authService';

const ForgotPassword = () => {
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        try {
            // Assuming authService has this method, if not we'll add it
            await authService.requestPasswordReset(email);
            setIsSubmitted(true);
        } catch (err) {
            setError('Failed to send reset email. Please try again.');
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
                    <div className="text-center lg:text-left space-y-2">
                        <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 tracking-tight">
                            Forgot Password?
                        </h2>
                        <p className="text-gray-500 text-lg">
                            Don't worry! It happens. Please enter the email associated with your account.
                        </p>
                    </div>

                    {!isSubmitted ? (
                        <form onSubmit={handleSubmit} className="space-y-6 mt-8">
                            {error && (
                                <div className="p-4 bg-red-50 border-l-4 border-red-500 text-red-700 rounded shadow-sm">
                                    <p className="text-sm font-medium">{error}</p>
                                </div>
                            )}

                            <div className="space-y-5">
                                <div className="space-y-2">
                                    <label htmlFor="email" className="text-sm font-semibold text-gray-700 block">
                                        Email Address
                                    </label>
                                    <input
                                        id="email"
                                        name="email"
                                        type="email"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="block w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 shadow-sm transition-all duration-200 placeholder-gray-400 dark:placeholder-gray-500 outline-none"
                                        placeholder="Enter your email"
                                    />
                                </div>
                            </div>

                            <Button
                                type="submit"
                                disabled={isLoading}
                                className="w-full py-3.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-0.5"
                            >
                                {isLoading ? 'Sending...' : 'Send Reset Link'}
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
                    ) : (
                        <div className="mt-8 space-y-6 text-center lg:text-left">
                            <div className="p-6 bg-green-50 rounded-2xl border border-green-100">
                                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto lg:mx-0 mb-4">
                                    <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                                <h3 className="text-lg font-bold text-gray-900 mb-2">Check your email</h3>
                                <p className="text-gray-600">
                                    We have sent a password reset link to <span className="font-semibold text-gray-900">{email}</span>.
                                </p>
                            </div>

                            <Button
                                onClick={() => setIsSubmitted(false)} // Or redirect to login
                                variant="outline"
                                className="w-full py-3.5"
                            >
                                Try another email
                            </Button>

                            <div className="text-center">
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
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ForgotPassword;
