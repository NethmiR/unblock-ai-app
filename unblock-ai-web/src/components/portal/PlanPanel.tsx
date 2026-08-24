/**
 * The right-hand half of the new-request page, before there is a request.
 *
 * Deliberately has no plan to draw and no submit action. Confirming the
 * matched process on this page saves the job and navigates to it, so the plan
 * for a real request is rendered by TaskPlanPanel from the stored task - a
 * customized copy compiled here would be thrown away on the next line.
 *
 * It stays as a panel rather than collapsing the layout so the page does not
 * reflow the chat mid-conversation, and so the person can see up front that
 * every approval step will be mapped out before anything is sent.
 */
export function PlanPanel() {
  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-card border border-line bg-surface shadow-sm">
      <header className="flex flex-none items-center justify-between gap-4 border-b border-line px-7 py-5">
        <div className="text-[15px] font-semibold tracking-tight">Workflow plan</div>
        <div className="text-[13px] text-muted">Waiting for your request</div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-7 pb-10 pt-8">
        <div className="flex h-full flex-col items-center justify-center text-center">
          <div className="mb-[22px] h-12 w-12 rounded-card border border-dashed border-slate-300" />
          <div className="text-base font-semibold">No plan yet</div>
          <p className="mt-2.5 max-w-[38ch] text-[14.5px] leading-relaxed text-muted">
            Once you confirm your request, every approval step will be mapped out for you before
            anything is sent to anyone.
          </p>
        </div>
      </div>
    </section>
  );
}
