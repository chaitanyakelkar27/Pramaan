import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
    "inline-flex items-center justify-center rounded-xl text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
    {
        variants: {
            variant: {
                default: "bg-[#1f5b4b] text-white hover:bg-[#18493c]",
                secondary: "bg-white text-[#1f5b4b] border border-[#cddfd8] hover:bg-[#f6fbf9]",
                ghost: "text-[#1f5b4b] hover:bg-[#edf5f2]"
            },
            size: {
                default: "h-10 px-4 py-2",
                lg: "h-11 px-6 py-2"
            }
        },
        defaultVariants: {
            variant: "default",
            size: "default"
        }
    }
);

export function Button({ className, variant, size, ...props }) {
    return <button suppressHydrationWarning className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
