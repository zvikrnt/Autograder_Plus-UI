import { useState, useCallback } from "react";
import MonacoEditor from "@monaco-editor/react";
import {
    Play, Loader2, Terminal, Trash2, PencilRuler, CheckCircle2, XCircle, Clock,
} from "lucide-react";
import { toast } from "sonner";
import StudentLayout from "../../components/layout/StudentLayout";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { blackboardService } from "../../services/blackboardService";

// language → Monaco id + a friendly starter snippet.
const LANGS = {
    python: {
        label: "Python 3", monaco: "python",
        snippet: 'print("Hello, World!")\n',
    },
    javascript: {
        label: "JavaScript", monaco: "javascript",
        snippet: 'console.log("Hello, World!");\n',
    },
    c: {
        label: "C", monaco: "c",
        snippet: '#include <stdio.h>\n\nint main() {\n    printf("Hello, World!\\n");\n    return 0;\n}\n',
    },
    cpp: {
        label: "C++", monaco: "cpp",
        snippet: '#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello, World!" << endl;\n    return 0;\n}\n',
    },
    java: {
        label: "Java", monaco: "java",
        snippet: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}\n',
    },
};

export default function Blackboard() {
    const [language, setLanguage] = useState("python");
    const [code, setCode] = useState(LANGS.python.snippet);
    const [stdin, setStdin] = useState("");
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState(null); // { success, output, error, execution_time }

    const switchLanguage = useCallback((lang) => {
        setLanguage(lang);
        // Only replace the code if the editor still holds a pristine snippet.
        setCode((cur) => {
            const isPristine = Object.values(LANGS).some((l) => l.snippet.trim() === (cur || "").trim());
            return isPristine || !cur.trim() ? LANGS[lang].snippet : cur;
        });
        setResult(null);
    }, []);

    const handleRun = async () => {
        if (!code.trim()) { toast.error("Write some code to run."); return; }
        setRunning(true);
        setResult(null);
        try {
            const res = await blackboardService.run({ language, code, stdin });
            setResult(res.data);
        } catch (e) {
            setResult({
                success: false,
                error: e.response?.data?.error || "Execution failed.",
                output: "", execution_time: 0,
            });
        } finally {
            setRunning(false);
        }
    };

    const clearOutput = () => setResult(null);

    return (
        <StudentLayout>
            <div className="flex flex-col h-[calc(100vh-8rem)]">
                {/* Header */}
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center">
                            <PencilRuler className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-gray-900">Blackboard</h1>
                            <p className="text-xs text-gray-400 -mt-0.5">Free practice — code runs, nothing is saved.</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Language selector */}
                        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                            {Object.entries(LANGS).map(([key, l]) => (
                                <button
                                    key={key}
                                    onClick={() => switchLanguage(key)}
                                    className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors
                                        ${language === key ? "bg-white shadow text-indigo-700" : "text-gray-500 hover:text-gray-800"}`}
                                >
                                    {l.label}
                                </button>
                            ))}
                        </div>
                        <Button onClick={handleRun} disabled={running}
                            className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white">
                            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                            Run
                        </Button>
                    </div>
                </div>

                {/* Editor + I/O split */}
                <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-3 min-h-0">
                    {/* Editor (2/3) */}
                    <div className="lg:col-span-2 border rounded-lg overflow-hidden min-h-[300px]">
                        <MonacoEditor
                            height="100%"
                            language={LANGS[language].monaco}
                            value={code}
                            theme="vs-dark"
                            onChange={(v) => setCode(v || "")}
                            options={{
                                fontSize: 14, minimap: { enabled: false },
                                scrollBeyondLastLine: false, wordWrap: "on",
                                automaticLayout: true,
                            }}
                        />
                    </div>

                    {/* Right column: stdin + output */}
                    <div className="flex flex-col gap-3 min-h-0">
                        {/* stdin */}
                        <Card className="p-0 overflow-hidden shrink-0">
                            <div className="px-3 py-2 border-b bg-gray-50 flex items-center gap-1.5">
                                <Terminal className="w-3.5 h-3.5 text-gray-400" />
                                <span className="text-xs font-semibold text-gray-600">Input (stdin)</span>
                            </div>
                            <textarea
                                value={stdin}
                                onChange={(e) => setStdin(e.target.value)}
                                placeholder="Type input your program reads from stdin…"
                                className="w-full h-24 p-3 text-xs font-mono resize-none focus:outline-none bg-white"
                            />
                        </Card>

                        {/* output */}
                        <Card className="p-0 overflow-hidden flex-1 flex flex-col min-h-0">
                            <div className="px-3 py-2 border-b bg-gray-50 flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                    <Terminal className="w-3.5 h-3.5 text-gray-400" />
                                    <span className="text-xs font-semibold text-gray-600">Output</span>
                                    {result && (
                                        <span className={`flex items-center gap-1 text-[10px] font-medium ml-1
                                            ${result.success ? "text-green-600" : "text-red-500"}`}>
                                            {result.success ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                                            {result.success ? "ok" : "error"}
                                            <Clock className="w-3 h-3 ml-1" /> {result.execution_time}ms
                                        </span>
                                    )}
                                </div>
                                {result && (
                                    <button onClick={clearOutput} className="text-gray-400 hover:text-red-500" title="Clear">
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                            <div className="flex-1 overflow-auto bg-gray-950 p-3 font-mono text-xs">
                                {running ? (
                                    <div className="flex items-center gap-2 text-gray-400">
                                        <Loader2 className="w-4 h-4 animate-spin" /> Running…
                                    </div>
                                ) : result ? (
                                    <>
                                        {result.output && (
                                            <pre className="text-green-300 whitespace-pre-wrap break-all">{result.output}</pre>
                                        )}
                                        {result.error && (
                                            <pre className="text-red-400 whitespace-pre-wrap break-all">{result.error}</pre>
                                        )}
                                        {!result.output && !result.error && (
                                            <span className="text-gray-500">(no output)</span>
                                        )}
                                    </>
                                ) : (
                                    <span className="text-gray-500">Run your code to see output here.</span>
                                )}
                            </div>
                        </Card>
                    </div>
                </div>
            </div>
        </StudentLayout>
    );
}
