import { cn } from "../../lib/utils";

export function Input({ className, type = "text", ...props }) {
    return (
        <input
            type={type}
            className={cn(
                "flex h-11 w-full rounded-xl border border-[#cfe2db] bg-white px-3 py-2 text-sm text-[#1f2937] outline-none transition placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-[#7fc2ac]",
                className
            )}
            {...props}
        />
    );
}
