import { LoaderCircle } from "lucide-react";

/**
 * The prototype's primary action: full-width, gradient fill, indigo glow.
 * `bg-primary-gradient` is the design token's own gradient (see globals.css).
 */

export default function AuthSubmitButton({ children, icon: Icon, isLoading = false, disabled = false }) {
  return (
    <button
      type="submit"
      disabled={disabled || isLoading}
      className="bg-primary-gradient flex w-full cursor-pointer items-center justify-center gap-2 rounded-md py-3.5 text-[15px] font-semibold text-white shadow-glow transition hover:brightness-105 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:brightness-100"
    >
      {isLoading ? (
        <>
          <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
          Please wait…
        </>
      ) : (
        <>
          {children}
          {Icon && <Icon size={18} aria-hidden="true" />}
        </>
      )}
    </button>
  );
}
