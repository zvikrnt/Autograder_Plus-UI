
import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import RiveLoginAnimation from './RiveLoginAnimation';

const RegisterForm = () => {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    password2: '',
    first_name: '',
    last_name: '',
    role: 'student', // Default to student
  });
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  const { register, isLoading, error, clearError } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));

    // Clear errors when user starts typing
    if (error) {
      clearError();
    }
    if (fieldErrors[name]) {
      setFieldErrors(prev => ({
        ...prev,
        [name]: null,
      }));
    }
  };

  const validateForm = () => {
    const errors = {};

    if (!formData.username.trim()) {
      errors.username = 'Username is required';
    }

    if (!formData.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      errors.email = 'Email is invalid';
    }

    if (!formData.password) {
      errors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    }

    if (formData.password !== formData.password2) {
      errors.password2 = 'Passwords do not match';
    }

    if (!formData.first_name.trim()) {
      errors.first_name = 'First name is required';
    }

    if (!formData.last_name.trim()) {
      errors.last_name = 'Last name is required';
    }

    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Client-side validation
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    const result = await register(formData);

    if (result.success) {
      // Redirect based on user role
      const redirectPath = result.user.role === 'student'
        ? '/student/dashboard'
        : '/teacher/dashboard';
      navigate(redirectPath, { replace: true });
    } else {
      // Handle server-side validation errors
      if (result.errors) {
        setFieldErrors(result.errors);
      }
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
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white dark:bg-gray-800 overflow-y-auto">
        <div className="w-full max-w-lg space-y-6">
          <div className="text-center lg:text-left space-y-2">
            <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">
              Create an account
            </h2>
            <p className="text-gray-500">
              Join Autograder to start learning and teaching.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 mt-8">
            {error && (
              <div className="p-4 bg-red-50 border-l-4 border-red-500 text-red-700 rounded shadow-sm">
                <p className="text-sm font-medium">{error}</p>
              </div>
            )}

            {/* Role Selection */}
            <div className="space-y-1">
              <label htmlFor="role" className="text-sm font-semibold text-gray-700 block">
                I am a
              </label>
              <div className="relative">
                <select
                  id="role"
                  name="role"
                  value={formData.role}
                  onChange={handleChange}
                   className="block w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 shadow-sm transition-all duration-200 outline-none appearance-none bg-white dark:bg-gray-800"
                >
                  <option value="student">Student</option>
                  <option value="teacher">Teacher</option>
                  <option value="ta">Teaching Assistant</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-500">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                </div>
              </div>
            </div>

            {/* Name Fields */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label htmlFor="first_name" className="text-sm font-semibold text-gray-700 block">
                  First Name
                </label>
                <input
                  id="first_name"
                  name="first_name"
                  type="text"
                  required
                  value={formData.first_name}
                  onChange={handleChange}
                  className={`block w-full px-4 py-3 rounded-xl border ${fieldErrors.first_name ? 'border-red-300 ring-4 ring-red-100' : 'border-gray-200 dark:border-gray-700 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50'} shadow-sm transition-all duration-200 placeholder-gray-400 dark:placeholder-gray-500 outline-none`}
                  placeholder="John"
                />
                {fieldErrors.first_name && (
                  <p className="text-sm text-red-600 mt-1">{fieldErrors.first_name}</p>
                )}
              </div>

              <div className="space-y-1">
                <label htmlFor="last_name" className="text-sm font-semibold text-gray-700 block">
                  Last Name
                </label>
                <input
                  id="last_name"
                  name="last_name"
                  type="text"
                  required
                  value={formData.last_name}
                  onChange={handleChange}
                  className={`block w-full px-4 py-3 rounded-xl border ${fieldErrors.last_name ? 'border-red-300 ring-4 ring-red-100' : 'border-gray-200 dark:border-gray-700 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50'} shadow-sm transition-all duration-200 placeholder-gray-400 dark:placeholder-gray-500 outline-none`}
                  placeholder="Doe"
                />
                {fieldErrors.last_name && (
                  <p className="text-sm text-red-600 mt-1">{fieldErrors.last_name}</p>
                )}
              </div>
            </div>

            {/* Username */}
            <div className="space-y-1">
              <label htmlFor="username" className="text-sm font-semibold text-gray-700 block">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                value={formData.username}
                onChange={handleChange}
                 className={`block w-full px-4 py-3 rounded-xl border ${fieldErrors.username ? 'border-red-300 ring-4 ring-red-100' : 'border-gray-200 dark:border-gray-700 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50'} shadow-sm transition-all duration-200 placeholder-gray-400 dark:placeholder-gray-500 outline-none`}
                placeholder="Choose a username"
              />
              {fieldErrors.username && (
                <p className="text-sm text-red-600 mt-1">{fieldErrors.username}</p>
              )}
            </div>

            {/* Email */}
            <div className="space-y-1">
              <label htmlFor="email" className="text-sm font-semibold text-gray-700 block">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={formData.email}
                onChange={handleChange}
                 className={`block w-full px-4 py-3 rounded-xl border ${fieldErrors.email ? 'border-red-300 ring-4 ring-red-100' : 'border-gray-200 dark:border-gray-700 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50'} shadow-sm transition-all duration-200 placeholder-gray-400 dark:placeholder-gray-500 outline-none`}
                placeholder="john@example.com"
              />
              {fieldErrors.email && (
                <p className="text-sm text-red-600 mt-1">{fieldErrors.email}</p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-1">
              <label htmlFor="password" className="text-sm font-semibold text-gray-700 block">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={formData.password}
                  onChange={handleChange}
                  className={`block w-full px-4 py-3 rounded-xl border ${fieldErrors.password ? 'border-red-300 ring-4 ring-red-100' : 'border-gray-200 dark:border-gray-700 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50'} shadow-sm transition-all duration-200 placeholder-gray-400 dark:placeholder-gray-500 outline-none pr-10`}
                  placeholder="Create a password"
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
              {fieldErrors.password && (
                <p className="text-sm text-red-600 mt-1">{fieldErrors.password}</p>
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-1">
              <label htmlFor="password2" className="text-sm font-semibold text-gray-700 block">
                Confirm Password
              </label>
              <input
                id="password2"
                name="password2"
                type={showPassword ? 'text' : 'password'}
                required
                value={formData.password2}
                onChange={handleChange}
                 className={`block w-full px-4 py-3 rounded-xl border ${fieldErrors.password2 ? 'border-red-300 ring-4 ring-red-100' : 'border-gray-200 dark:border-gray-700 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50'} shadow-sm transition-all duration-200 placeholder-gray-400 dark:placeholder-gray-500 outline-none`}
                placeholder="Confirm your password"
              />
              {fieldErrors.password2 && (
                <p className="text-sm text-red-600 mt-1">{fieldErrors.password2}</p>
              )}
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-0.5 mt-2"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Creating Account...
                </span>
              ) : 'Create Account'}
            </Button>
          </form>

          <p className="text-center text-sm text-gray-600">
            Already have an account?{' '}
            <button
              onClick={() => navigate('/login')}
              className="font-bold text-indigo-600 hover:text-indigo-500 transition-colors"
            >
              Sign in
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegisterForm;