"use client";

import { useEffect, useState } from "react";

import { useMutation } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

import { AUTH_STATUS, useAuth } from "@/context/auth-context";
import { useCountdown } from "@/hooks/use-countdown";
import { apiErrorCode, apiErrorMessage, apiErrorStatus, isNetworkError } from "@/utils/api-error";
import api from "@/utils/axios";
import { OTP_LENGTH, OTP_MAX_ATTEMPTS, OTP_TTL_SECONDS, RESEND_COOLDOWN_SECONDS } from "@/utils/otp";
import { roleHome } from "@/utils/role-home";

import AuthShell from "./auth-shell";
import LoginCodeStep from "./login-code-step";
import LoginEmailStep from "./login-email-step";

/**
 * Passwordless login: email → one-time code → session.
 *
 * WHY THE FAILURE MESSAGES ARE GUESSED, NOT READ
 * ----------------------------------------------
 * `POST /auth/verify-otp` answers EVERY failure with the same 401
 * `INVALID_OR_EXPIRED`. That is deliberate on the backend
 * (auth-controllers.js `rejectVerification`): a distinguishable response would
 * tell an attacker whether an address is registered and whether a code is
 * outstanding. The consequence for this screen is that the server cannot tell
 * us "expired" from "wrong" from "attempt cap reached".
 *
 * So the distinction is inferred from what the CLIENT legitimately knows — how
 * long ago it asked for the code, and how many times it has been rejected since
 * — and used only to pick which message and next action to lead with. Every
 * variant stays true to the ambiguous response ("invalid or expired"), and the
 * resend path is always reachable, so a wrong guess costs the student one extra
 * tap and never blocks them.
 */

const NETWORK_NOTICE = {
  tone: "error",
  message: "Couldn't reach the server. Check your connection and try again.",
};

export default function LoginPage() {
  const router = useRouter();
  const { status, user, login } = useAuth();

  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [sentToEmail, setSentToEmail] = useState("");
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState(null);
  const [cooldownEndsAt, setCooldownEndsAt] = useState(null);
  const [codeSentAt, setCodeSentAt] = useState(null);
  const [wrongAttempts, setWrongAttempts] = useState(0);

  const cooldownSeconds = useCountdown(cooldownEndsAt);

  /**
   * The ONLY redirect in this screen, covering both ways a session appears:
   * arriving already signed in, and verify-otp succeeding a moment ago.
   *
   * Deliberately not duplicated in the verify mutation's onSuccess. Firing
   * router.replace() there as well raced this effect — two replaces to the same
   * route, one of them landing mid-transition — and the router wedged on /login
   * showing the spinner while the RSC payload for the target had already been
   * served.
   */
  useEffect(() => {
    if (status === AUTH_STATUS.AUTHENTICATED) {
      router.replace(roleHome(user?.role));
    }
  }, [status, user, router]);

  function startCooldown() {
    setCooldownEndsAt(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
  }

  const requestOtpMutation = useMutation({
    mutationFn: async ({ email: targetEmail }) => {
      const { data } = await api.post("/auth/request-otp", { email: targetEmail });

      return data;
    },
    onSuccess: (data, variables) => {
      // The backend returns one generic body whether or not the address is
      // registered. Echoing its wording keeps the UI from being more revealing
      // than the API.
      openCodeStep(variables.email);
      toast.success(data?.message || "If that email is registered, a code has been sent.");
    },
    onError: (error, variables) => {
      if (isNetworkError(error)) {
        setNotice(NETWORK_NOTICE);
        return;
      }

      const errorCode = apiErrorCode(error);

      // A code was issued moments ago and is sitting in their inbox — move them
      // on to enter it rather than stranding them on a screen that just failed.
      if (errorCode === "COOLDOWN") {
        openCodeStep(variables.email);
        setNotice({
          tone: "info",
          message: apiErrorMessage(
            error,
            `A code was just sent. Please wait ${RESEND_COOLDOWN_SECONDS} seconds before requesting another.`
          ),
        });
        return;
      }

      // Five requests in fifteen minutes for this address. Waiting is the only
      // next action, so keep them where they are.
      if (errorCode === "OTP_RATE_LIMITED") {
        startCooldown();
        setNotice({
          tone: "info",
          message: apiErrorMessage(
            error,
            "Too many codes requested for this email. Please wait a few minutes and try again."
          ),
        });
        return;
      }

      if (apiErrorStatus(error) === 400) {
        setNotice({ tone: "error", message: "Enter a valid university email address." });
        return;
      }

      setNotice({
        tone: "error",
        message: apiErrorMessage(error, "Something went wrong sending your code. Please try again."),
      });
    },
  });

  const verifyOtpMutation = useMutation({
    mutationFn: async ({ email: targetEmail, code: submittedCode }) => {
      const { data } = await api.post("/auth/verify-otp", {
        email: targetEmail,
        code: submittedCode,
      });

      return data;
    },
    onSuccess: (data) => {
      // Stores the access token in memory only and flips the session to
      // authenticated (F0's auth-context).
      login({ user: data.user, accessToken: data.accessToken });

      // No redirect here — flipping the session to authenticated is what
      // triggers it, in the effect above.
      toast.success(`Welcome, ${data.user?.name || "voter"}.`);
    },
    onError: (error) => {
      setCode("");

      if (isNetworkError(error)) {
        setNotice(NETWORK_NOTICE);
        return;
      }

      if (apiErrorStatus(error) === 400) {
        setNotice({ tone: "error", message: `Enter the complete ${OTP_LENGTH}-digit code.` });
        return;
      }

      const attempts = wrongAttempts + 1;

      setWrongAttempts(attempts);
      setNotice(describeVerifyFailure({ attempts, codeSentAt }));
    },
  });

  function openCodeStep(targetEmail) {
    setSentToEmail(targetEmail);
    setStep("code");
    setCode("");
    setNotice(null);
    setWrongAttempts(0);
    setCodeSentAt(Date.now());
    startCooldown();
  }

  function handleRequestCode() {
    const trimmed = email.trim();

    if (!trimmed) return;

    setNotice(null);
    requestOtpMutation.mutate({ email: trimmed });
  }

  function handleResend() {
    if (cooldownSeconds > 0 || requestOtpMutation.isPending) return;

    setNotice(null);
    requestOtpMutation.mutate({ email: sentToEmail });
  }

  function handleVerify() {
    if (code.length !== OTP_LENGTH) return;

    setNotice(null);
    verifyOtpMutation.mutate({ email: sentToEmail, code });
  }

  function handleCodeChange(nextCode) {
    setCode(nextCode);

    // Clear a "wrong code" banner as soon as they start correcting it, but keep
    // an expired/burned warning up — that one needs a resend, not a retype.
    setNotice((current) => (current?.tone === "error" ? null : current));
  }

  function handleChangeEmail() {
    setStep("email");
    setCode("");
    setNotice(null);
  }

  // 'loading' means the F0 bootstrap refresh is still in flight; 'authenticated'
  // means the effect above is mid-redirect. Neither should flash the form.
  if (status !== AUTH_STATUS.UNAUTHENTICATED) {
    return (
      <AuthShell>
        <div className="flex min-h-[200px] items-center justify-center" role="status">
          <span className="sr-only">Checking your session</span>
          <LoaderCircle size={32} className="animate-spin text-indigo-600" aria-hidden="true" />
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      {step === "email" ? (
        <LoginEmailStep
          email={email}
          onEmailChange={setEmail}
          onSubmit={handleRequestCode}
          isSubmitting={requestOtpMutation.isPending}
          notice={notice}
        />
      ) : (
        <LoginCodeStep
          email={sentToEmail}
          code={code}
          onCodeChange={handleCodeChange}
          onSubmit={handleVerify}
          onResend={handleResend}
          onChangeEmail={handleChangeEmail}
          isSubmitting={verifyOtpMutation.isPending}
          isResending={requestOtpMutation.isPending}
          cooldownSeconds={cooldownSeconds}
          notice={notice}
        />
      )}
    </AuthShell>
  );
}

/**
 * Turn the server's one ambiguous 401 into the most likely story. See the note
 * at the top of this file for why this has to be inferred.
 */
function describeVerifyFailure({ attempts, codeSentAt }) {
  const isProbablyExpired = codeSentAt !== null && Date.now() - codeSentAt > OTP_TTL_SECONDS * 1000;

  if (isProbablyExpired) {
    return {
      tone: "warning",
      message: "This code has expired. Request a new one to continue.",
    };
  }

  // The backend burns the code at OTP_MAX_ATTEMPTS, after which even the right
  // code fails — so past that point retyping is pointless and resending is the
  // only way forward.
  if (attempts >= OTP_MAX_ATTEMPTS) {
    return {
      tone: "warning",
      message: "Too many incorrect attempts. Request a new code to continue.",
    };
  }

  return {
    tone: "error",
    message: "That code isn't right or has expired. Check your email and try again.",
  };
}
