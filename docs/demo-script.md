# Unblock AI — 10-Minute Demo Script

Two surfaces in one run: the **admin portal** (author a workflow in plain English, verify
the compiled graph, publish it) and the **portal** (a requester finds the right process by
chatting, fills in details, and the approval chain runs to a signed PDF).

The arc deliberately links them: the template published live in Act 1 is what makes the
selector agent ask a clarifying question in Act 2.

---

## 0. Pre-flight (do this 15 minutes before — not part of the 10)

### Services

| Check | Command / URL |
|---|---|
| MongoDB running | `mongosh --eval "db.runCommand({ping:1})"` |
| PostgreSQL running | `psql "$POSTGRES_URL" -c "select 1"` |
| Seed users exist | `cd unblock-ai-api && npm run seed:auth` |
| API up (port 3000) | `cd unblock-ai-api && npm run dev` → `curl localhost:3000/api/health` |
| Web up (port 3001) | `cd unblock-ai-web && npm run dev` |

Credentials are in `unblock-ai-api/.env` (`SEED_ADMIN_*`, `SEED_USER1_*`).
Usernames: **`admin`** (admin portal), **`chathura`** / **`dilani`** (portal).

### Browser setup — the one thing that will break the demo

There is a **single `ua_session` cookie**. Logging into the portal *replaces* the admin
session in the same browser profile. Set up **two separate windows**:

- **Window A** (normal profile) → logged in as `admin`, sitting on `/admin`
- **Window B** (incognito / second profile) → logged in as `chathura`, sitting on `/portal`
- **Window B, second tab** → your email inbox, for approval links

Log both in *before* you start talking. Do not log in on camera.

### Data setup

Publish these two ahead of time so the library is not empty:

- **IT Faculty Overseas Leave** — from `unblock-ai-api/src/data/samples/demo-drafts/it_overseas_leave.txt`
- **Departmental Workshop / Event** — from `.../demo-drafts/workshop_event.txt`

**Delete the Engineering Overseas Leave template if a previous run left it** — publishing
it live is Act 1, and it must not already exist.

Have `demo-drafts/eng_overseas_leave.txt` **open in a text editor, ready to copy**. Do not
type it live.

### Email setup

`MAIL_TRANSPORT=smtp` with `APP_PUBLIC_URL=http://localhost:3001`, so approval links are
real and clickable. When you fill in approver details in Act 2, **use your own inbox
address for both approvers** so both emails land in one place.

> **Fallback:** the approval URL is also printed by the API process. Keep the API terminal
> visible in a corner — `POST /tasks/:id/start` logs the `/approvals/<token>` link, and you
> can paste it straight into Window B.

---

## Act 1 — Admin portal (0:00 – 3:30)

### 0:00 – 0:30 · Frame the problem

> "Every institution runs on approval workflows that only exist in people's heads and in
> PDF circulars. Nobody knows who signs first. Unblock AI takes that policy in plain
> English, compiles it into an executable graph, and then runs it. Two sides: the admin
> who writes the rule, and the person who just needs their thing approved."

**Window A**, on `/admin`.

### 0:30 – 1:00 · The template library

Point at the list.

> "These are published workflow templates. Each one was written as prose and compiled.
> They're filterable by institution type, and versioned — nothing is ever edited in place,
> every save is a new version."

Click **Deletion log** in the top bar for about five seconds.

> "And every removal is audited to a named admin. This is a governance surface, not a wiki."

Back to `/admin`.

### 1:00 – 1:30 · Write a workflow in English

Click **＋ Create new template**. Paste `eng_overseas_leave.txt` into the left pane.

Read one line out loud while it lands:

> "'The request goes first to the Academic Advisor. After the Academic Advisor approves, it
> goes to the Head of Department, and after that to the Faculty Coordinator.' That's it.
> That's the whole input. No form builder, no BPMN, no drag-and-drop."

### 1:30 – 2:30 · Generate

Click **Generate**.

**This takes 20–60 seconds. Do not stand in silence — talk through what is happening:**

> "This isn't a summariser. It's a structured-output call against a strict JSON schema, and
> then two layers of validation on top: schema validation, plus eight graph checks a JSON
> schema can't express — no cycles, no orphan steps, every dependency resolves, every
> approval has both an approved and a rejected outcome. If the model gets any of that
> wrong, the errors are handed back to it and it repairs its own output. Up to three
> attempts. What comes out is guaranteed executable, or you get an error — never a
> plausible-looking broken graph."

### 2:30 – 3:15 · The compiled flowchart

When the graph renders, trace it with the cursor.

> "Three approval steps in sequence, because the prose said 'after'. The inputs it decided
> to collect — name, registration number, destination, dates, purpose. And the approvers
> are **roles**, not people: 'Academic Advisor', 'Head of Department'. They get resolved to
> a real person at request time.
>
> This is the verification step. The admin reads the flowchart, not the JSON, and confirms
> the machine understood the policy."

### 3:15 – 3:30 · Publish

Click **Publish**.

> "Until now it's invisible. Publishing is the gate — only confirmed, latest-version
> templates are findable. It's now live, and indexed for retrieval."

---

## Act 2 — Portal (3:30 – 7:15)

**Switch to Window B**, on `/portal`.

### 3:30 – 3:50 · The requester's world

> "Completely different surface, different user. This person doesn't know what a workflow
> template is and never will. They just have a problem."

Click **New Request**.

### 3:50 – 5:00 · Chat to the right process

Type:

```
I want to apply for overseas leave
```

It should come back **ambiguous**, asking which faculty.

> "Now — watch this. It didn't guess. There are two overseas-leave templates that match,
> and one of them is the Engineering one **I published ninety seconds ago**. It's already
> in the retrieval index, and the selector agent would rather ask one question than pick
> the wrong process. Guessing wrong here means someone's request sits in the wrong
> approver's inbox for a week."

Answer:

```
I'm in the IT faculty
```

It matches **IT Faculty Overseas Leave**. A confirmation dialog appears — click
**Yes, continue**.

> "One confirmation before anything is committed. Nothing has been sent to any approver yet."

### 5:00 – 6:30 · Fill in the details

You land on the request page with the plan rendered. Click **Continue**.

It asks **one requirement at a time**. Move briskly — this is the slowest part of the
demo — and narrate over it.

| Field | Suggested value |
|---|---|
| Full name | `Chathura Perera` |
| Index number | `IT21001234` |
| Destination country | `Singapore` |
| Destination city | `Singapore` |
| Departure date | a date about three weeks out |
| Return date | a date after departure |
| Reason for travel | `Presenting a paper at a research conference` |
| Your email | **your own inbox** |
| Academic Advisor | name + **your own inbox** |
| Head of Department | name + **your own inbox** |

While typing:

> "One question at a time, and each answer is type-checked as it goes — dates are real
> dates, and it knows the return date can't be before the departure date. The last two are
> the approvers. The requester names them, because there's no directory integration yet —
> that's an honest gap, and it's on the roadmap."

**Optional five-second flex:** deliberately enter a return date *before* the departure
date, let it reject the value, then fix it.

Click **Send for approval**.

> "That single action finalises the plan and starts the chain. The entry step just
> dispatched, and a signed, expiring approval link is on its way to the Academic Advisor."

### 6:30 – 7:15 · The requester's status view

Stay on the page.

> "Their view is deliberately boring: what it's waiting on, and who has it. And if it ever
> gets rejected, this page tells them who rejected it, at which step, and why — which is
> the single thing that's always missing today."

---

## Act 3 — The approval chain (7:15 – 9:15)

### 7:15 – 8:00 · Approve as the Academic Advisor

Open your inbox tab, open the approval email, click the link.

> "Note the URL — this is outside both portals. The approver has no account and never
> creates one. The token in the link *is* the authentication. It's HMAC-signed, it expires,
> and it's single-use."

Show the page: request details, the approval trail so far, three buttons.

> "Approve, reject, or request more information. Rejecting demands a reason. And 'request
> more information' isn't a backward arrow in the graph — it's an outcome that reopens the
> step and pushes one extra question back to the requester, capped so it can't ping-pong
> forever."

Click **Approve**.

### 8:00 – 8:45 · Approve as the Head of Department

Refresh the inbox. The second email has arrived.

> "The engine advanced on its own. The advisor's approval satisfied the dependency, so the
> HoD step went from blocked to ready to dispatched. No scheduler, no cron — the decision
> itself drives the graph forward."

Open it, click **Approve**. The page confirms the request is now complete.

### 8:45 – 9:15 · Completion and the record

Switch back to the requester's tab in Window B and refresh.

> "Approved. And the last required step completing triggers one more thing —"

Click **Download record (PDF)**. Open it.

> "Every value they supplied, in the template's declared order, and a full approval trail:
> step, designation, approver name and email, decision. This is the signed travel
> authorisation the policy promised at the end. It was also attached to their completion
> email automatically."

---

## Close (9:15 – 10:00)

> "So: an administrator wrote a paragraph of policy and got back a verified, executable
> graph. A student who didn't know the process existed found it by describing their
> problem. Two approvers acted from their inbox without ever logging in. And the whole
> thing produced an auditable document at the end.
>
> The part I'd point at is the boundary in the middle. The LLM does two jobs — turning
> prose into a graph, and mapping a plain-language request onto the right template. It does
> not execute anything. The approval engine that moves this chain is deterministic and has
> no model in it. That's the design choice the rest follows from."

**Stop.** Don't open the JSON. Don't offer to show the schema. Take questions.

---

## Timing summary

| # | Segment | Runs | Ends |
|---|---|---|---|
| 1 | Framing | 0:30 | 0:30 |
| 2 | Template library + deletion log | 0:30 | 1:00 |
| 3 | Paste prose | 0:30 | 1:30 |
| 4 | **Generate (LLM — variable)** | 1:00 | 2:30 |
| 5 | Flowchart walkthrough | 0:45 | 3:15 |
| 6 | Publish | 0:15 | 3:30 |
| 7 | Portal intro + new request | 0:20 | 3:50 |
| 8 | Selector chat (ambiguous → matched) | 1:10 | 5:00 |
| 9 | **Requirement collection** | 1:30 | 6:30 |
| 10 | Requester status view | 0:45 | 7:15 |
| 11 | Approval #1 | 0:45 | 8:00 |
| 12 | Approval #2 | 0:45 | 8:45 |
| 13 | Completion + PDF | 0:30 | 9:15 |
| 14 | Close | 0:45 | 10:00 |

### If you are running long

Cut in this order — each is self-contained:

1. **Deletion log** (0:05) — mention it verbally instead
2. **Requester status view** (segment 10) — go straight to the inbox
3. **The date-validation flex** in segment 9
4. **Second approval** — approve once and say "the second approver does the same thing, and
   the chain completes." Only if you must; you lose the auto-advance beat.

### If you are running short

- Open the workshop/event template in the admin editor. It has **parallel branches** — hall
  booking and security run concurrently, refreshments waits on the hall — and the flowchart
  makes the "graph, not checklist" point visually in 30 seconds.
- Show a **reject** or **request more information** on the second approval instead of
  approving, then show the requester's rejection view naming who and why.

---

## Known risks

| Risk | Mitigation |
|---|---|
| **Generate takes >60s** | Keep a pre-published Engineering template in a second admin tab; switch to it and say "here's one I compiled earlier". Keep talking through the validation story — it fills the time honestly. |
| **Email delayed / SMTP blocked** | The API terminal logs the full `/approvals/<token>` URL. Keep it visible and paste the link directly. |
| **Session cookie collision** | Two browser windows, both logged in before you start. This is the number one failure mode. |
| **Selector matches instead of asking** | It only asks if two overseas-leave templates are live. Verify the Engineering publish succeeded before moving to Act 2 — if it failed, open with a direct query and drop the ambiguity beat. |
| **Malformed-id 500s** | Don't hand-edit URLs. Navigate by clicking only. |
