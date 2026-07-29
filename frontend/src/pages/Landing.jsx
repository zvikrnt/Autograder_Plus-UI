
import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
    CheckCircle2,
    BarChart3,
    Users,
    Code2,
    Zap,
    Shield
} from 'lucide-react';
import { motion } from 'framer-motion';

const FeatureCard = ({ icon: Icon, title, description }) => (
    <motion.div
        whileHover={{ y: -5 }}
        className="p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 hover:shadow-md transition-all duration-300"
    >
        <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center mb-4">
            <Icon className="w-6 h-6 text-emerald-600" />
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">{title}</h3>
        <p className="text-gray-600 leading-relaxed">{description}</p>
    </motion.div>
);

const Landing = () => {
    const navigate = useNavigate();

    const features = [
        {
            icon: CheckCircle2,
            title: "Automated Grading",
            description: "Instant feedback on code submissions. Run test cases automatically and save hours of manual grading time."
        },
        // ... (other features remain same logic, just Icons change color via parent class or direct prop if needed, but Icon color is set in FeatureCard)
        {
            icon: BarChart3,
            title: "Advanced Analytics",
            description: "Deep insights into student performance. Track progress, identify struggling students, and visualize class trends."
        },
        {
            icon: Users,
            title: "Class Management",
            description: "Seamlessly manage rosters, assignments, and grades in one unified dashboard designed for efficiency."
        },
        {
            icon: Code2,
            title: "Multi-Language Support",
            description: "Support for Python, JavaScript, Java, C++, and more. Flexible environments for any coding curriculum."
        },
        {
            icon: Zap,
            title: "Real-time Execution",
            description: "Secure, sandboxed code execution environment that delivers results in milliseconds, not seconds."
        },
        {
            icon: Shield,
            title: "Plagiarism Detection",
            description: "Built-in similarity checks to ensure academic integrity and promote original student work."
        }
    ];

    return (
        <div className="min-h-screen bg-white dark:bg-gray-800 font-sans text-gray-900">
            {/* Navigation */}
            <nav className="fixed top-0 w-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-md z-50 border-b border-gray-100 dark:border-gray-800">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16 items-center">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
                                <Code2 className="w-5 h-5 text-white" />
                            </div>
                            <span className="text-xl font-bold text-gray-900">AutoGrader+</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => navigate('/login')}
                                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-emerald-600 transition-colors"
                            >
                                Sign In
                            </button>
                            <button
                                onClick={() => navigate('/register')}
                                className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm hover:shadow-md"
                            >
                                Get Started
                            </button>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="pt-32 pb-20 lg:pt-48 lg:pb-32 relative overflow-hidden">
                {/* Background Blobs */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full z-0 pointer-events-none">
                    <div className="absolute top-20 left-10 w-96 h-96 bg-emerald-100 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob"></div>
                    <div className="absolute top-20 right-10 w-96 h-96 bg-teal-100 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob animation-delay-2000"></div>
                    <div className="absolute -bottom-32 left-1/2 w-96 h-96 bg-cyan-100 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob animation-delay-4000"></div>
                </div>

                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                    >
                        <span className="inline-block py-1 px-3 rounded-full bg-emerald-50 text-emerald-600 text-sm font-semibold mb-6">
                            The Modern LMS for Coding
                        </span>
                        <motion.div
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{
                                type: "spring",
                                stiffness: 260,
                                damping: 20,
                                duration: 1.5
                            }}
                        >
                            <h1 className="text-6xl md:text-8xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-500 mb-6 leading-tight select-none">
                                AutoGrader+
                            </h1>
                        </motion.div>
                        <p className="mt-4 max-w-2xl mx-auto text-xl text-gray-600 mb-10 leading-relaxed">
                            A Scalable, Automated Assessment System for Modern Education.
                            <span className="block mt-2 text-emerald-600 font-medium">
                                Research Project & Implementation
                            </span>
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                            <button
                                onClick={() => navigate('/register')}
                                className="px-8 py-4 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 text-lg shadow-md w-full sm:w-auto"
                            >
                                Create Free Account
                            </button>
                            <button
                                onClick={() => navigate('/login')}
                                className="px-8 py-4 bg-white dark:bg-gray-800 text-gray-700 border border-gray-200 dark:border-gray-700 rounded-xl font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200 text-lg shadow-sm w-full sm:w-auto"
                            >
                                Sign In
                            </button>
                        </div>
                        <div className="mt-12 flex justify-center gap-8 opacity-60 grayscale hover:grayscale-0 transition-all duration-500">
                            {/* Placeholders for logos or social proof if needed */}
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Features Section */}
            <section className="py-24 bg-gray-50/50 dark:bg-gray-900/50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
                            Everything you need to run your class
                        </h2>
                        <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                            Powerful tools designed specifically for computer science education.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {features.map((feature, index) => (
                            <FeatureCard key={index} {...feature} />
                        ))}
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-800 pt-16 pb-8">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
                        <div className="col-span-1 md:col-span-2">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
                                    <Code2 className="w-5 h-5 text-white" />
                                </div>
                                <span className="text-xl font-bold text-gray-900">AutoGrader+</span>
                            </div>
                            <p className="text-gray-500 mb-6 max-w-sm">
                                Empowering educators and inspiring students with the next generation of coding education tools.
                            </p>
                        </div>

                        <div>
                            <h4 className="font-semibold text-gray-900 mb-4">Product</h4>
                            <ul className="space-y-3 text-gray-500">
                                <li><a href="#" className="hover:text-emerald-600 transition-colors">Features</a></li>
                                <li><a href="#" className="hover:text-emerald-600 transition-colors">Pricing</a></li>
                                <li><a href="#" className="hover:text-emerald-600 transition-colors">Case Studies</a></li>
                                <li><a href="#" className="hover:text-emerald-600 transition-colors">Updates</a></li>
                            </ul>
                        </div>

                        <div>
                            <h4 className="font-semibold text-gray-900 mb-4">Resources</h4>
                            <ul className="space-y-3 text-gray-500">
                                <li><a href="#" className="hover:text-emerald-600 transition-colors">Documentation</a></li>
                                <li><a href="#" className="hover:text-emerald-600 transition-colors">API Reference</a></li>
                                <li><a href="#" className="hover:text-emerald-600 transition-colors">Community</a></li>
                                <li><a href="#" className="hover:text-emerald-600 transition-colors">AutoGrader+ Paper</a></li>
                            </ul>
                        </div>
                    </div>

                    <div className="pt-8 border-t border-gray-100 dark:border-gray-800 flex flex-col md:flex-row justify-between items-center gap-4">
                        <p className="text-gray-400 text-sm">
                            © 2024 AutoGrader+ Platform. All rights reserved.
                        </p>
                        <div className="flex gap-6 text-gray-400 text-sm">
                            <a href="#" className="hover:text-gray-600 dark:hover:text-gray-400 transition-colors">Privacy</a>
                            <a href="#" className="hover:text-gray-600 dark:hover:text-gray-400 transition-colors">Terms</a>
                            <a href="#" className="hover:text-gray-600 dark:hover:text-gray-400 transition-colors">Cookies</a>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default Landing;
