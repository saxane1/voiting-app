import { ShieldCheck } from "lucide-react";

/**
 * The ballot-secrecy reassurance from the prototype's student dashboard.
 *
 * This is not decoration: the split VoteReceipt/Vote design (Project-Context §8)
 * only deters coercion if voters KNOW their choice is unrecoverable. It also
 * sets the expectation that there is no "view my vote" anywhere in the app,
 * because there cannot be one.
 */

export default function SecrecyNote() {
  return (
    <div className="mt-[22px] flex items-start gap-2.5 rounded-lg border border-indigo-100 bg-indigo-50 p-3.5">
      <ShieldCheck size={18} className="mt-px shrink-0 text-indigo-600" aria-hidden="true" />
      <p className="m-0 text-[12.5px] leading-[1.5] text-indigo-900">
        <strong className="font-bold">Your ballot is secret.</strong> No one — not even the election
        commission — can link your vote back to you. Votes are recorded anonymously.
      </p>
    </div>
  );
}
