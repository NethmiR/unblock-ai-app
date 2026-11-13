# Unblock AI — 10-Minute Demo Script

Two surfaces in one run: the **workflow templates dashboard** (author a workflow in plain
English, verify the generated graph, publish it) and the **task request assistant** (a
requester describes a need, the assistant picks the right process from their profile, a form
arrives half filled in, and the approval chain runs to a transcript PDF).

The arc deliberately links them: the Engineering template published live in Act 1 is the one
the assistant **leaves out** for an IT student in Act 2, because the directory already knows
which faculty they belong to.

---

## 0. Pre-flight (do this 15 minutes before — not part of the 10)

### Services

| Check | Command / URL |
|---|---|
| MongoDB running | `mongosh --eval "db.runCommand({ping:1})"` |
| PostgreSQL running | `psql "$POSTGRES_URL" -c "select 1"` |
| Migrations applied | `cd unblock-ai-api && npm run migrate:up` |
| Admin, organisation and sample users | `SEED_SAMPLE_USERS=true` in `unblock-ai-api/.env`, then `npm run seed:pg:run` (safe to re-run) |
| API up (port 3000) | `cd unblock-ai-api && npm run dev` → `curl localhost:3000/api/health` |
| Web up (port 3001) | `cd unblock-ai-web && npm run dev` |

### Accounts

Everyone signs in at **`/login`** with **email + password**. Every seeded account's password
is `USER_DEFAULT_PASSWORD` (`12345` by default).

| Who | Email | Why |
|---|---|---|
| Administrator | `SEED_ADMINISTRATOR_EMAIL` | Authors and publishes templates |
| Kavindu Jayawardena | `u17@u.c` | Student, Department of Information Technology — the requester |
| Dinesh Wijesinghe | `u19@u.c` | Head of Department, IT — found in the directory |
| Sunethra Ratnayake | `u18@u.c` | Dean, Faculty of IT — found in the directory |

Approvers never sign in. They act from the emailed link.

### Browser setup — the one thing that will break the demo

There is a **single `ua_session` cookie**. Signing in as Kavindu *replaces* the
administrator's session in the same browser profile. Set up **two separate windows**:

- **Window A** (normal profile) → sign in as the administrator and open **Workflow
  Templates** (`/dashboard/workflows`).
- **Window B** (incognito / second profile) → sign in as `u17@u.c`. Open **New task
  request** (`/dashboard/tasks/new`).
- **Window B, second tab** → kept free for approval links.

Sign both in *before* you start talking. Do not sign in on camera.

### Data setup

Create, generate and publish ahead of time (paste each file into a **New workflow template**):

- **IT Faculty Overseas Leave** — `unblock-ai-api/src/data/samples/demo-drafts/it_overseas_leave.txt`
- **Departmental Workshop / Event** — `.../demo-drafts/workshop_event.txt`

Open the IT template once and check the flowchart header says **Applies to: Faculty of
Information Technology**, the advisor step says **Requester provides**, and HoD and Dean say
**Directory**. If not, regenerate it.

**Archive the Engineering Overseas Leave template if a previous run left it** — publishing it
live is Act 1. Have `demo-drafts/eng_overseas_leave.txt` **open in a text editor, ready to
copy**. Do not type it live.

### Email setup

Use `MAIL_TRANSPORT=console` and keep the **API terminal visible** in a corner: every approval
email, including its `http://localhost:3001/approvals/<token>` link, is printed there. (With a
real transport, the approver addresses are the directory's sample addresses, which do not
receive mail.)

---

## Act 1 — Workflow templates (0:00 – 3:15)

### 0:00 – 0:30 · Frame the problem

> "Every institution runs on approval workflows that only exist in people's heads and in
> PDF circulars. Nobody knows who signs first. Unblock AI takes that policy in plain
> English, compiles it into an executable graph, and then runs it. Two sides: the admin
> who writes the rule, and the person who just needs their thing approved."

**Window A**, on `/dashboard/workflows`.

### 0:30 – 1:00 · Write a workflow in English

Click **New workflow template**. Type the title `Engineering Overseas Leave` and paste
`eng_overseas_leave.txt` into the prompt.

> "'The request goes first to the Academic Advisor, then the Head of Department, then the
> Faculty Coordinator.' That's the whole input. No form builder, no BPMN."

### 1:00 – 2:00 · Generate

Click **Generate**. **This takes 20–60 seconds. Talk through it:**

> "A structured-output call against a strict JSON schema, then two layers of validation —
> schema, plus graph checks a schema can't express: no cycles, no orphan steps, every
> dependency resolves. The model also gets the live list of faculties and designations, so
> it writes *who this is for* and *which post approves* as codes the directory understands.
> If anything is wrong, the errors go back to the model and it repairs its own output."

### 2:00 – 2:45 · The generated flowchart

Trace it with the cursor, then point at the header and the badges.

> "Three approvals in sequence. Up here: **Applies to: Faculty of Engineering** — it
> understood the audience. And on each step: **Directory** means we'll look the approver up
> ourselves; **Requester provides** means the directory doesn't model that post, so the
> requester will name them. The admin sees all of that before publishing."

### 2:45 – 3:15 · Publish

Click **Publish**.

> "Only published templates are findable, and only by the people they apply to. Requests in
> flight keep the version they started on."

---

## Act 2 — The assistant (3:15 – 6:30)

**Switch to Window B**, on `/dashboard/tasks/new`.

### 3:15 – 3:45 · The requester's world

> "Different user, different surface. Kavindu is an IT student. He doesn't know what a
> workflow template is."

Point at the greeting with his first name, then click **See what Unblock can do**.

> "This list costs nothing — no AI. It's every process he's eligible for. The IT overseas
> leave is here. The Engineering one I just published is not: the directory says he's in IT."

Close the drawer.

### 3:45 – 4:45 · One sentence

Type:

```
I want to take 1 month overseas leave for a research visit. Guide me through the process.
```

It matches **IT Faculty Overseas Leave** with **no clarifying question**. Open **Show thinking**.

> "Read the trace: it read his profile, found the candidates, **left out the Engineering
> template because it's for another faculty**, and consulted the model once. The old version
> of this asked 'which faculty?' — we already know. And here are the profile details it used."

Click **Tell me more**.

> "Deterministic overview: his details, the academic advisor — 'You'll name this person' —
> the Head of Department, and the Dean, 'Only when needed'."

### 4:45 – 6:30 · The form

Type `Start the task` (or click **Start this task**). The workspace opens with the template
title in the topbar.

> "Step 1 of 4: waiting for his input. Name and email are grey with a lock — they came from
> his account, not from him typing them. HoD and Dean aren't even asked: the directory found
> them."

Fill in destination, dates (**a 40-day trip**), reason, and the advisor's name and an email.
Click **Save draft**, refresh the page, and show the values are still there.

> "Drafts save any time — even for a later step's form."

Click **Submit and continue**. The rail moves to the advisor step: **Awaiting decision**.

---

## Act 3 — The approval chain (6:30 – 9:15)

### 6:30 – 7:30 · The advisor asks for more

Copy the advisor's approval URL from the API terminal into Window B's second tab.

> "Outside the dashboard. The approver has no account. The token in the link *is* the
> credential — signed, expiring, and only its hash is stored."

Show the page: the request, Kavindu's details and answers, the plan on the right. Choose
**Request more information** and click confirm with no comment — it is blocked. Type `Please
attach the invitation letter details` and confirm.

> "Rejecting or asking for more needs a reason. And asking doesn't send the request
> backwards — watch the requester's side."

### 7:30 – 8:15 · Kavindu answers

Back on the workspace (it refreshes on its own within a few seconds).

> "A new step appeared: **More information requested**, followed by a repeat of the advisor's
> review. Everything after it now waits on the repeat."

Type an answer and click **Send answer**. A new advisor link prints. Open it, show the
**Repeat review** notice and the answer under Information exchanges, and **Approve**.

### 8:15 – 8:45 · Directory approvers

Open the HoD link (Dinesh) and **Approve**, then the Dean link (Sunethra) and **Approve**.

> "Nobody typed these two people's names. And the Dean only came into it because the trip is
> over 30 days — a ten-day trip would show that step as 'Not required'."

### 8:45 – 9:15 · Completion and the transcript

Back on the workspace: **Request completed**. Click **Download transcript**.

> "The conversation he started with, his answers, the question and his reply, and the whole
> approval trail with comments. Rendered on demand, never stored, and it was attached to his
> completion email."

---

## Close (9:15 – 10:00)

> "An administrator wrote a paragraph of policy and got back a verified graph that already
> knows who it's for and who approves. A student described his problem in one sentence and
> got a form that was half filled in. Approvers acted from a link without an account.
>
> The boundary is the point. The model does two jobs — turning prose into a graph once per
> version, and picking a template once per message. Everything after Start — the approvers,
> the form, the conditions, the engine, the PDF — is deterministic, testable, and costs
> nothing per request."

**Stop.** Take questions.

---

## Timing summary

| # | Segment | Runs | Ends |
|---|---|---|---|
| 1 | Framing | 0:30 | 0:30 |
| 2 | Title + paste prompt | 0:30 | 1:00 |
| 3 | **Generate (LLM — variable)** | 1:00 | 2:00 |
| 4 | Flowchart, audience and approver badges | 0:45 | 2:45 |
| 5 | Publish | 0:30 | 3:15 |
| 6 | Greeting + capabilities drawer | 0:30 | 3:45 |
| 7 | One sentence → match, thinking, overview | 1:00 | 4:45 |
| 8 | **Form: locked fields, draft, submit** | 1:45 | 6:30 |
| 9 | Advisor requests more information | 1:00 | 7:30 |
| 10 | Requester answers, advisor approves | 0:45 | 8:15 |
| 11 | HoD and Dean approve | 0:30 | 8:45 |
| 12 | Completion + transcript | 0:30 | 9:15 |
| 13 | Close | 0:45 | 10:00 |

### If you are running long

Cut in this order — each is self-contained:

1. **Save draft and refresh** in segment 8 — mention it verbally.
2. **Tell me more** in segment 7.
3. **The information request** (segments 9–10) — approve the advisor directly and say
   "they could also ask for more information, and the request would come back to them".

### If you are running short

- Start a second request with a **10-day trip**: the Dean step shows **Not required** and the
  progress counts three steps.
- Sign in as Hasitha (`u12@u.c`, an Engineering student) in a third profile: the same
  sentence matches the **Engineering** template you published in Act 1. Reject it at the
  first approval with a comment and show the requester's rejection banner.

---

## Known risks

| Risk | Mitigation |
|---|---|
| **Generate takes >60s** | Keep a pre-published Engineering template in a second tab; say "here's one I compiled earlier" and keep talking through validation. |
| **Engineering template shows "Everyone" instead of Faculty of Engineering** | The model missed the audience. Regenerate before the demo, or skip the "left out" beat. |
| **Approval link not found** | It is printed by the API process with `MAIL_TRANSPORT=console`. Keep that terminal visible. |
| **Session cookie collision** | Two browser windows, both signed in before you start. This is the number one failure mode. |
| **The assistant asks a question** | Answer it with "IT faculty" and move on; the trace still shows the profile was used. |
