"use client";

import { useState } from "react";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  MailWarning,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import toast from "react-hot-toast";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/query-states";
import { useAuth } from "@/context/auth-context";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { apiErrorMessage } from "@/utils/api-error";
import { queryKeys } from "@/utils/query-keys";
import { ELEVATED_ROLES, ROLE_LABELS, fetchUsers, setUserActive } from "@/utils/users-api";

import ConfirmDialog from "./confirm-dialog";
import PageHeader from "./page-header";
import UsersEditForm from "./users-edit-form";
import UsersForm from "./users-form";

/**
 * Access management: the ADMIN and AUDITOR accounts (B3b §8).
 *
 * WHAT THIS SCREEN IS CAREFUL ABOUT
 *
 * Two rows can never be deactivated, and the table says so before anyone
 * clicks:
 *
 *   - THE ROOT ACCOUNT. The seeded admin is the permanent root of trust; it is
 *     what guarantees the system can never be left with nobody able to
 *     administer it. Its control is disabled and it wears a badge.
 *   - YOUR OWN ROW. Locking yourself out mid-election is never the intent.
 *
 * Both are mirrors of server guards, not the guards themselves — the API
 * answers 409 ROOT_ACCOUNT_IMMUTABLE / CANNOT_DEACTIVATE_SELF regardless of
 * what this component renders, and a third guard (last active administrator)
 * has no UI at all because it is unreachable over HTTP. Disabling the buttons
 * is here so an admin is not invited to attempt something that will be refused.
 *
 * Students never appear here: GET /users returns elevated accounts only.
 */

const PAGE_SIZE = 25;

export default function UsersPage() {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();

  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  // The account being edited, or null. Create and edit share the one panel slot
  // above the table, so only one of them is ever open.
  const [editingUser, setEditingUser] = useState(null);
  const [pendingTarget, setPendingTarget] = useState(null);
  const [mailNotice, setMailNotice] = useState(null);

  const debouncedSearch = useDebouncedValue(search);

  // Any filter change puts us back on page 1: page 2 of the old result set is
  // usually past the end of the new one, which would show an empty table for a
  // search that actually matched.
  function changeFilter(setter) {
    return (value) => {
      setter(value);
      setPage(1);
    };
  }

  const params = { page, limit: PAGE_SIZE, search: debouncedSearch, role };

  const usersQuery = useQuery({
    queryKey: queryKeys.userList(params),
    queryFn: () => fetchUsers(params),
    placeholderData: keepPreviousData,
  });

  const activationMutation = useMutation({
    mutationFn: ({ id, nextActive }) => setUserActive(id, nextActive),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users });
      setPendingTarget(null);

      const name = result.user?.name ?? "Account";

      // `changed: false` means someone else got there first. Saying "already"
      // is more honest than claiming to have done something.
      if (result.user?.isActive) {
        toast.success(result.changed ? `${name} reactivated` : `${name} was already active`);
      } else {
        toast.success(result.changed ? `${name} deactivated` : `${name} was already inactive`);
      }
    },
    onError: (error) => {
      setPendingTarget(null);

      // The server's own message is preferred: it names which guard refused —
      // root, self, or last active administrator — and the client cannot know
      // that for the third one at all.
      toast.error(apiErrorMessage(error, "That didn't work. Please try again."));
    },
  });

  const users = usersQuery.data?.users ?? [];
  const total = usersQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Boolean(debouncedSearch || role);
  const isStale = usersQuery.isPlaceholderData && usersQuery.isFetching;

  function handleCreated(result) {
    setFormOpen(false);

    // The §6 path: the account is real and usable, only the courtesy email
    // failed. Shown as a standing notice rather than an error toast, because it
    // is a TASK for the admin (go tell them) and it must not read as a failure.
    if (result.notification?.sent === false) {
      setMailNotice({
        title: "Account created — but the notification email did not go out",
        email: result.user.email,
        message: result.notification.warning,
      });
    }
  }

  function handleSaved(result) {
    setEditingUser(null);

    // Identical handling for the edit path. `notification` is only present when
    // the EMAIL changed, so a name-only edit never lands here.
    if (result.notification?.sent === false) {
      setMailNotice({
        title: "Account updated — but the new address could not be notified",
        email: result.user.email,
        message: result.notification.warning,
      });
    }
  }

  function startEdit(user) {
    setFormOpen(false);
    setMailNotice(null);
    setEditingUser(user);
  }

  return (
    <>
      <PageHeader
        title="Access management"
        subtitle={
          usersQuery.isSuccess
            ? hasFilters
              ? `${total} matching ${total === 1 ? "account" : "accounts"}`
              : `${total} elevated ${total === 1 ? "account" : "accounts"} · administrators and auditors`
            : "Administrator and auditor accounts"
        }
      >
        <button
          type="button"
          onClick={() => {
            setEditingUser(null);
            setFormOpen((open) => !open);
          }}
          aria-expanded={formOpen}
          className="bg-primary-gradient shadow-glow inline-flex cursor-pointer items-center gap-2 rounded-[10px] px-4 py-2.5 text-[13.5px] font-semibold text-white transition hover:brightness-105"
        >
          <Plus size={17} aria-hidden="true" />
          Add account
        </button>
      </PageHeader>

      <div className="px-4 py-5 min-[920px]:px-7">
        {formOpen && <UsersForm onCancel={() => setFormOpen(false)} onCreated={handleCreated} />}

        {editingUser && (
          // Keyed on the row's identity so switching straight from editing one
          // account to another reseeds the inputs instead of keeping the first
          // account's half-typed values.
          <UsersEditForm
            key={`${editingUser.id}:${editingUser.updatedAt}`}
            user={editingUser}
            onCancel={() => setEditingUser(null)}
            onSaved={handleSaved}
          />
        )}

        {mailNotice && (
          <MailFailureNotice notice={mailNotice} onDismiss={() => setMailNotice(null)} />
        )}

        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[220px] flex-1">
            <Search
              size={16}
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400"
            />
            <input
              type="search"
              value={search}
              onChange={(event) => changeFilter(setSearch)(event.target.value)}
              placeholder="Search by name or email"
              aria-label="Search accounts"
              className="text-ink w-full rounded-[10px] border-[1.5px] border-slate-200 bg-slate-50 py-2.5 pr-3.5 pl-9 text-[13.5px] outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-[3px] focus:ring-indigo-100"
            />
          </div>

          <select
            value={role}
            onChange={(event) => changeFilter(setRole)(event.target.value)}
            aria-label="Filter by role"
            className="text-ink cursor-pointer rounded-[10px] border-[1.5px] border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[13.5px] outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-[3px] focus:ring-indigo-100"
          >
            <option value="">All roles</option>
            {ELEVATED_ROLES.map((value) => (
              <option key={value} value={value}>
                {ROLE_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        {usersQuery.isPending ? (
          <LoadingState label="Loading accounts" />
        ) : usersQuery.isError ? (
          <ErrorState
            error={usersQuery.error}
            onRetry={() => usersQuery.refetch()}
            isRetrying={usersQuery.isFetching}
          />
        ) : users.length === 0 ? (
          <div className="border-line bg-surface rounded-lg border shadow-sm">
            <EmptyState title={hasFilters ? "No accounts match those filters." : "No accounts yet."}>
              {hasFilters
                ? "Try a different search term or role."
                : "Add an administrator or an auditor to get started."}
            </EmptyState>
          </div>
        ) : (
          <div
            className={`border-line bg-surface overflow-hidden rounded-lg border shadow-sm transition-opacity ${
              isStale ? "opacity-60" : "opacity-100"
            }`}
            aria-busy={isStale}
          >
            <div className="overflow-x-auto">
              <UsersTable
                users={users}
                currentUserId={currentUser?.id}
                editingId={editingUser?.id}
                onEdit={startEdit}
                onToggle={setPendingTarget}
                isPending={activationMutation.isPending}
              />
            </div>

            <div className="border-line flex items-center justify-between gap-3 border-t bg-slate-50 px-4 py-3">
              <span className="text-muted flex items-center gap-2 text-[12.5px]">
                {isStale && (
                  <LoaderCircle
                    size={14}
                    className="animate-spin text-indigo-500"
                    aria-hidden="true"
                  />
                )}
                {total} {total === 1 ? "account" : "accounts"} · page {page} of {pageCount}
              </span>

              <div className="flex gap-1.5">
                <PageButton
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1}
                  label="Previous page"
                >
                  <ChevronLeft size={15} aria-hidden="true" />
                  Prev
                </PageButton>

                <PageButton
                  onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                  disabled={page >= pageCount}
                  label="Next page"
                >
                  Next
                  <ChevronRight size={15} aria-hidden="true" />
                </PageButton>
              </div>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(pendingTarget)}
        tone={pendingTarget?.isActive ? "danger" : "primary"}
        icon={pendingTarget?.isActive ? Ban : RotateCcw}
        title={
          pendingTarget?.isActive
            ? `Deactivate ${pendingTarget?.name}?`
            : `Reactivate ${pendingTarget?.name}?`
        }
        description={
          pendingTarget?.isActive
            ? `They lose access immediately — the next request they make is refused, and any signed-in session ends. Their ${ROLE_LABELS[pendingTarget?.role]?.toLowerCase() ?? "account"} record and everything they did stay in the audit log. You can reactivate them here at any time.`
            : "They will be able to sign in again with a one-time code and use the system as before."
        }
        confirmLabel={pendingTarget?.isActive ? "Deactivate account" : "Reactivate account"}
        isPending={activationMutation.isPending}
        onConfirm={() =>
          activationMutation.mutate({
            id: pendingTarget.id,
            nextActive: !pendingTarget.isActive,
          })
        }
        onCancel={() => setPendingTarget(null)}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */

const HEAD_CELL =
  "px-4 py-3 text-left text-[11.5px] font-bold tracking-[.04em] text-slate-500 uppercase";

function UsersTable({ users, currentUserId, editingId, onEdit, onToggle, isPending }) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="bg-slate-50">
          <th className={`${HEAD_CELL} pl-5`}>Account</th>
          <th className={HEAD_CELL}>Role</th>
          <th className={HEAD_CELL}>Status</th>
          <th className={`${HEAD_CELL} pr-5 text-right`}>
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>

      <tbody>
        {users.map((user) => {
          const isSelf = user.id === currentUserId;

          // Mirrors the server's guard order: root first, then self. The reason
          // is carried through so the row can explain itself rather than just
          // presenting a dead button.
          const lockedReason = user.isRoot
            ? "The root administrator is permanent and cannot be deactivated."
            : isSelf
              ? "You cannot deactivate your own account."
              : null;

          return (
            <tr key={user.id} className="border-line border-t transition hover:bg-indigo-50/50">
              <td className="py-3 pr-4 pl-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-ink truncate text-[13.5px] font-semibold">
                      {user.name}
                    </span>

                    {user.isRoot && <RootBadge />}
                    {isSelf && <YouBadge />}
                  </div>

                  <span className="text-muted block truncate text-xs">{user.email}</span>
                </div>
              </td>

              <td className="px-4 py-3">
                <RoleBadge role={user.role} />
              </td>

              <td className="px-4 py-3">
                <StatusBadge isActive={user.isActive} />
              </td>

              <td className="py-3 pr-5 pl-4">
                <div className="flex justify-end gap-2">
                  {/*
                   * Editing name/email is offered on EVERY row, including root
                   * and your own. Neither is a deactivation: root means the
                   * account cannot be disabled, not that its address is frozen,
                   * and correcting a typo in your own email is routine.
                   */}
                  <button
                    type="button"
                    onClick={() => onEdit(user)}
                    aria-label={`Edit ${user.name}`}
                    aria-pressed={editingId === user.id}
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-[9px] border px-3 py-2 text-[12.5px] font-semibold transition ${
                      editingId === user.id
                        ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                        : "border-line bg-white text-slate-600 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                    }`}
                  >
                    <Pencil size={14} aria-hidden="true" />
                    Edit
                  </button>

                  <button
                    type="button"
                    onClick={() => onToggle(user)}
                    disabled={Boolean(lockedReason) || isPending}
                    title={lockedReason ?? undefined}
                    aria-label={`${user.isActive ? "Deactivate" : "Reactivate"} ${user.name}`}
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-[9px] border bg-white px-3 py-2 text-[12.5px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${
                      user.isActive
                        ? "border-error-500/30 text-error-700 hover:bg-error-50 disabled:hover:bg-white"
                        : "border-success-500/40 text-success-700 hover:bg-success-50 disabled:hover:bg-white"
                    }`}
                  >
                    {user.isActive ? (
                      <Ban size={14} aria-hidden="true" />
                    ) : (
                      <RotateCcw size={14} aria-hidden="true" />
                    )}
                    {user.isActive ? "Deactivate" : "Reactivate"}
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function RootBadge() {
  return (
    <span
      title="The permanent root of trust. This account can never be deactivated."
      className="rounded-pill inline-flex items-center gap-1 bg-indigo-50 px-2 py-[3px] text-[10.5px] font-bold tracking-[.03em] text-indigo-700 uppercase"
    >
      <ShieldCheck size={12} aria-hidden="true" />
      Root
    </span>
  );
}

function YouBadge() {
  return (
    <span className="rounded-pill bg-slate-100 px-2 py-[3px] text-[10.5px] font-bold tracking-[.03em] text-slate-500 uppercase">
      You
    </span>
  );
}

function RoleBadge({ role }) {
  const isAdmin = role === "ADMIN";

  return (
    <span
      className={`rounded-pill px-2.5 py-1 text-[11.5px] font-bold whitespace-nowrap ${
        isAdmin ? "bg-indigo-50 text-indigo-700" : "bg-slate-100 text-slate-600"
      }`}
    >
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

function StatusBadge({ isActive }) {
  return (
    <span
      className={`rounded-pill inline-flex items-center gap-1.5 px-2.5 py-1 text-[11.5px] font-bold ${
        isActive ? "bg-success-50 text-success-700" : "bg-slate-100 text-slate-500"
      }`}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {isActive ? "Active" : "Inactive"}
    </span>
  );
}

/**
 * The account was created; the email was not delivered. Amber, not red, and
 * dismissible: nothing is broken and nothing needs retrying — the holder can
 * still sign in — but someone has to tell them, so it stays on screen until it
 * is acknowledged rather than disappearing with a toast.
 */
function MailFailureNotice({ notice, onDismiss }) {
  return (
    <div
      role="status"
      className="border-warning-500/30 bg-warning-50 mb-5 flex items-start gap-3 rounded-lg border p-4"
    >
      <span className="text-warning-700 mt-px flex-none">
        <MailWarning size={19} aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-warning-700 m-0 text-[13.5px] font-bold">
          {notice.title ?? "Account created — but the notification email did not go out"}
        </p>
        <p className="text-warning-700/85 m-0 mt-1 text-[12.5px] leading-[1.55]">
          {notice.message ??
            "The account is active and can be used right away."}{" "}
          Tell <span className="font-semibold">{notice.email}</span> they can sign in from the login
          page with that address and a one-time code.
        </p>
      </div>

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notice"
        className="text-warning-700/70 hover:text-warning-700 flex-none cursor-pointer rounded-md p-1 transition"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

function PageButton({ onClick, disabled, label, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-white"
    >
      {children}
    </button>
  );
}
