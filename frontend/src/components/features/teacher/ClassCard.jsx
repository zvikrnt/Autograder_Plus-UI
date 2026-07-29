import { Link } from "react-router-dom";
import { motion as Motion } from "framer-motion";
import { MoreVertical, Users, Loader2, Pencil, Trash2, Archive } from "lucide-react";

import { Card, CardContent } from "../../ui/card";
import { Button } from "../../ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "../../ui/dropdown-menu";

const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
};

const ClassCard = ({ cl, onEdit, onDelete, onArchive, showArchiveOption = true }) => {
    // Unique color accent based on class ID
    const colors = [
        "bg-indigo-600",
        "bg-emerald-600",
        "bg-rose-600",
        "bg-amber-600",
        "bg-cyan-600",
        "bg-violet-600"
    ];
    const accentColor = colors[(cl.id || 0) % colors.length];
    const stopCardNavigation = (event) => event.stopPropagation();

    return (
        <Motion.div variants={itemVariants} className="h-full">
            <Card className="h-full flex flex-col overflow-hidden border border-gray-200 transition-all duration-300 hover:shadow-xl hover:border-gray-300 hover:-translate-y-1 relative group">
                {/* Navigation Link Overlay */}
                <Link to={`/teacher/class/${cl.id}`} className="absolute inset-0 z-0" aria-label={`Go to ${cl.name}`} />

                <div className="flex h-full relative z-10 pointer-events-none">
                    {/* pointer-events-none allows clicks to pass through to the Link below, 
                        but we need pointer-events-auto for interactive children like the Menu 
                    */}

                    {/* Colored Side Accent */}
                    <div className={`w-1.5 ${accentColor} group-hover:w-3 transition-all duration-300 shrink-0`} />

                    <div className="flex-1 flex flex-col min-w-0">
                        <CardContent className="p-6 flex-1">
                            <div className="flex justify-between items-start mb-4">
                                <div className="pr-8">
                                    {/* Added padding-right to avoid overlap with absolute menu */}
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">{cl.section || "TERM 1"}</p>
                                    <h3 className="text-xl font-bold text-gray-900 leading-tight group-hover:text-indigo-600 transition-colors truncate">
                                        {cl.name}
                                    </h3>
                                </div>

                                {/* Dropdown Menu - Absolutely Positioned & Interactive */}
                                <div className="absolute top-4 right-4 z-20 pointer-events-auto">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-gray-400 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 transition-opacity bg-white/80 hover:bg-white backdrop-blur-sm"
                                                onClick={(event) => event.stopPropagation()}
                                                onPointerDown={(event) => event.stopPropagation()}
                                            >
                                                <MoreVertical className="w-4 h-4" />
                                                <span className="sr-only">Open menu</span>
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            {onEdit && (
                                                <DropdownMenuItem onSelect={stopCardNavigation} onClick={() => onEdit(cl)}>
                                                    <Pencil className="w-4 h-4 mr-2" />
                                                    Edit
                                                </DropdownMenuItem>
                                            )}
                                            {showArchiveOption && onArchive && (
                                                <DropdownMenuItem onSelect={stopCardNavigation} onClick={() => onArchive(cl)}>
                                                    <Archive className="w-4 h-4 mr-2" />
                                                    {cl.is_archived ? "Unarchive" : "Archive"}
                                                </DropdownMenuItem>
                                            )}
                                            {onDelete && (
                                                <DropdownMenuItem onSelect={stopCardNavigation} onClick={() => onDelete(cl)} className="text-red-600 focus:text-red-600">
                                                    <Trash2 className="w-4 h-4 mr-2" />
                                                    Delete
                                                </DropdownMenuItem>
                                            )}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>

                            <div className="space-y-3 mt-6">
                                <div className="flex items-center text-sm text-gray-600">
                                    <div className="bg-gray-100 p-1.5 rounded-md mr-3">
                                        <Users className="w-4 h-4 text-gray-500" />
                                    </div>
                                    <span className="font-medium">{cl.student_count || 0}</span>
                                    <span className="text-gray-400 ml-1">Students enrolled</span>
                                </div>

                                <div className="flex items-center text-sm text-gray-600">
                                    <div className="bg-gray-100 p-1.5 rounded-md mr-3">
                                        <Loader2 className="w-4 h-4 text-gray-500" />
                                    </div>
                                    <span className="font-medium">{cl.assignment_count || 0}</span>
                                    <span className="text-gray-400 ml-1">Active assignments</span>
                                </div>
                            </div>
                        </CardContent>

                        {/* Footer Area */}
                        <div className="p-4 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between">
                            {cl.has_pending_grading ? (
                                <div className="flex items-center gap-2 text-xs font-bold text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-100">
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                                    </span>
                                    Grading Pending
                                </div>
                            ) : (
                                <div className="text-xs text-gray-400 font-medium px-2">
                                    All caught up
                                </div>
                            )}

                            <span className="text-xs font-bold text-indigo-600 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0 flex items-center">
                                OPEN CLASS →
                            </span>
                        </div>
                    </div>
                </div>
            </Card>
        </Motion.div>
    );
};

export default ClassCard;
