import { useState, useEffect, useRef } from "react";
import { Terminal, ChevronDown, ChevronRight } from "lucide-react";
import { Card } from "../../ui/card";

// Collapsible terminal-style log viewer (auto-scrolls to bottom when open).
export default function LogViewer({ lines, title = "Pipeline logs", defaultOpen = false }) {
    const [open, setOpen] = useState(defaultOpen);
    const bottomRef = useRef(null);
    useEffect(() => {
        if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [lines, open]);

    const count = lines?.length || 0;
    return (
        <Card>
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="w-full flex items-center justify-between px-4 py-3 text-left"
            >
                <span className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                    {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    <Terminal className="w-4 h-4 text-indigo-500" />
                    {title}
                    {count > 0 && (
                        <span className="ml-1 bg-indigo-100 text-indigo-700 rounded-full px-1.5 py-0.5 text-[10px]">
                            {count}
                        </span>
                    )}
                </span>
            </button>
            {open && (
                <div className="px-4 pb-4">
                    {count === 0 ? (
                        <p className="text-xs text-gray-400 italic">No logs yet.</p>
                    ) : (
                        <div className="bg-gray-950 rounded-lg p-3 max-h-72 overflow-y-auto font-mono text-xs text-green-300 leading-relaxed">
                            {lines.map((line, i) => (
                                <div key={i} className="whitespace-pre-wrap break-all">{line}</div>
                            ))}
                            <div ref={bottomRef} />
                        </div>
                    )}
                </div>
            )}
        </Card>
    );
}
