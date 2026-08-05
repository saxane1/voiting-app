"use client";

import { useState } from "react";

import { initialsOf } from "@/utils/initials";

/**
 * Candidate portrait, falling back to initials.
 *
 * A plain <img> rather than next/image on purpose: photoUrl is free-text
 * entered by an admin (B5), so it can point at any host. next/image would need
 * a wildcard in images.remotePatterns to render it — turning the app's image
 * optimiser into an open proxy for arbitrary URLs. An unoptimised tag with a
 * fallback is the smaller risk, and these render at 52px.
 */

// Re-exported so the voter screens can keep importing it from here; the
// implementation moved to utils so the admin roll shares one definition.
export { initialsOf };

export default function CandidateAvatar({ name, photoUrl, size = 52, className = "" }) {
  const [failed, setFailed] = useState(false);
  const showPhoto = Boolean(photoUrl) && !failed;

  return (
    <span
      className={`bg-brand-gradient font-display grid shrink-0 place-items-center overflow-hidden rounded-[14px] font-bold text-white shadow-sm ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size / 3) }}
      aria-hidden="true"
    >
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element -- see note above
        <img
          src={photoUrl}
          alt=""
          width={size}
          height={size}
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        initialsOf(name)
      )}
    </span>
  );
}
