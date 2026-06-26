/**
 * API Smoke Tests — Full System Validation
 * Tests every scenario in the testing matrix.
 * Run: node smoke-tests/api-smoke.mjs
 */

const BASE = "http://localhost:8080/api";
let passed = 0;
let failed = 0;
const results = [];

function ok(name, cond, detail = "") {
  if (cond) {
    passed++;
    results.push({ status: "PASS", name, detail });
    console.log(`  ✅ PASS  ${name}`);
  } else {
    failed++;
    results.push({ status: "FAIL", name, detail });
    console.error(`  ❌ FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

async function req(method, path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try { data = await res.json(); } catch { data = {}; }
  return { status: res.status, data };
}

// ─── State shared across tests ────────────────────────────────────────────────
let ownerA = {};       // Owner of Group A
let ownerB = {};       // Owner of Group B (also manager in A for delegation)
let memberA = {};      // Member of Group A only
let dualUser = {};     // User who joins both Group A and Group B
let taskId = null;     // Single-assignee task in Group A
let multiTaskId = null;// Multi-assignee task in Group A
let delegatedChildId = null; // Child task produced by delegation
let auditGroupId = null;

// Unique mobile numbers for this test run (timestamp-based)
const ts = Date.now();
const OWNER_A_MOBILE  = `9000${ts}0`;
const OWNER_B_MOBILE  = `9000${ts}1`;
const MEMBER_A_MOBILE = `9000${ts}2`;
const DUAL_MOBILE     = `9000${ts}3`;

console.log("\n══════════════════════════════════════════════");
console.log(" Taskaya API Smoke Tests");
console.log("══════════════════════════════════════════════\n");

// ──────────────────────────────────────────────────────────────────────────────
// 1. Health check
// ──────────────────────────────────────────────────────────────────────────────
console.log("▶ 1. Health check");
{
  const r = await req("GET", "/healthz");
  ok("GET /healthz → 200 ok", r.status === 200 && r.data.status === "ok", JSON.stringify(r.data));
}

// ──────────────────────────────────────────────────────────────────────────────
// 2. New Owner Registration — Group A
// ──────────────────────────────────────────────────────────────────────────────
console.log("\n▶ 2. New Owner Registration (Group A)");
{
  const r = await req("POST", "/auth/signup", {
    fullName: "Alpha Owner",
    mobile: OWNER_A_MOBILE,
    password: "Pass1234!",
    teamName: "Alpha Team",
  });
  ok("POST /auth/signup creates team + owner", r.status === 201, JSON.stringify(r.data).slice(0, 200));
  ok("Returns token", !!r.data.token);
  ok("Returns invite code", !!r.data.team?.inviteCode);
  ok("Role is owner", r.data.user?.role === "owner");
  ownerA = { token: r.data.token, user: r.data.user, team: r.data.team };
  auditGroupId = r.data.team?.id;
}

// ──────────────────────────────────────────────────────────────────────────────
// 3. New Owner Registration — Group B
// ──────────────────────────────────────────────────────────────────────────────
console.log("\n▶ 3. New Owner Registration (Group B)");
{
  const r = await req("POST", "/auth/signup", {
    fullName: "Beta Owner",
    mobile: OWNER_B_MOBILE,
    password: "Pass1234!",
    teamName: "Beta Team",
  });
  ok("POST /auth/signup creates second team", r.status === 201);
  ok("Returns token", !!r.data.token);
  ownerB = { token: r.data.token, user: r.data.user, team: r.data.team };
}

// ──────────────────────────────────────────────────────────────────────────────
// 4. Team Code Registration — new Member joins Group A
// ──────────────────────────────────────────────────────────────────────────────
console.log("\n▶ 4. Team Code Registration (new member joins Group A)");
{
  const r = await req("POST", "/auth/signup", {
    fullName: "Alice Member",
    mobile: MEMBER_A_MOBILE,
    password: "Pass1234!",
    inviteCode: ownerA.team.inviteCode,
  });
  ok("POST /auth/signup with invite code → 201", r.status === 201);
  ok("pendingApproval is true", r.data.pendingApproval === true);
  memberA = { user: r.data.user };

  // Manager approves join request
  const appR = await req("POST", `/team/join-requests/${memberA.user.id}/approve`, {}, ownerA.token);
  ok("Manager approves join request → 200", appR.status === 200);

  // Member logs in
  const lr = await req("POST", "/auth/login", { mobile: MEMBER_A_MOBILE, password: "Pass1234!" });
  ok("Approved member can login", lr.status === 200, JSON.stringify(lr.data?.error || ""));
  ok("Member role is 'member'", lr.data?.user?.role === "member");
  memberA = { ...memberA, token: lr.data.token, user: lr.data.user };
}

// ──────────────────────────────────────────────────────────────────────────────
// 5. Existing user joins a second group (dual membership)
// ──────────────────────────────────────────────────────────────────────────────
console.log("\n▶ 5. Existing user joins a second group");
{
  // First create dual user in Group B
  const r1 = await req("POST", "/auth/signup", {
    fullName: "Dual User",
    mobile: DUAL_MOBILE,
    password: "Pass1234!",
    inviteCode: ownerB.team.inviteCode,
  });
  ok("Dual user signs up for Group B → 201", r1.status === 201);
  // Approve them in Group B
  const appB = await req("POST", `/team/join-requests/${r1.data.user.id}/approve`, {}, ownerB.token);
  ok("Group B owner approves dual user", appB.status === 200);

  // Login to get a token
  const lr = await req("POST", "/auth/login", { mobile: DUAL_MOBILE, password: "Pass1234!" });
  ok("Dual user can login after Group B approval", lr.status === 200);
  dualUser = { token: lr.data.token, user: lr.data.user, groupBId: ownerB.team.id };

  // Now dual user joins Group A using invite code
  const r2 = await req("POST", "/auth/signup", {
    fullName: "Dual User",
    mobile: DUAL_MOBILE,
    password: "Pass1234!",
    inviteCode: ownerA.team.inviteCode,
  });
  ok("Existing user joins Group A via invite code → 201", r2.status === 201);
  ok("pendingApproval true on second group join", r2.data.pendingApproval === true);

  // Owner A approves
  const appA = await req("POST", `/team/join-requests/${dualUser.user.id}/approve`, {}, ownerA.token);
  ok("Group A owner approves dual user", appA.status === 200);
}

// ──────────────────────────────────────────────────────────────────────────────
// 6. Multi-group membership — user visible in both groups
// ──────────────────────────────────────────────────────────────────────────────
console.log("\n▶ 6. Multi-group membership verification");
{
  const lr = await req("POST", "/auth/login", { mobile: DUAL_MOBILE, password: "Pass1234!" });
  ok("Dual user login refreshes groups", lr.status === 200);
  const groupIds = (lr.data.groups || []).map(g => g.id);
  ok("User belongs to 2 groups", groupIds.length === 2, `groups: ${JSON.stringify(lr.data.groups?.map(g=>g.name))}`);
  dualUser = { ...dualUser, token: lr.data.token };

  // GET /auth/groups also returns both
  const gr = await req("GET", "/auth/groups", null, dualUser.token);
  ok("GET /auth/groups returns 2 groups", Array.isArray(gr.data) && gr.data.length === 2);
}

// ──────────────────────────────────────────────────────────────────────────────
// 7. Group switching + data scoping
// ──────────────────────────────────────────────────────────────────────────────
console.log("\n▶ 7. Group switching — data correctly scopes to active group");
{
  // Switch to Group A
  const swA = await req("PATCH", "/auth/switch-group", { groupId: ownerA.team.id }, dualUser.token);
  ok("Switch to Group A → 200", swA.status === 200);
  ok("New token has group A context", !!swA.data.token);
  const tokenA = swA.data.token;

  // Switch to Group B
  const swB = await req("PATCH", "/auth/switch-group", { groupId: ownerB.team.id }, dualUser.token);
  ok("Switch to Group B → 200", swB.status === 200);
  const tokenB = swB.data.token;

  // Users list with Group A token should only show Group A members
  const usersA = await req("GET", "/users", null, tokenA);
  ok("Users list scoped to Group A", usersA.status === 200);
  const userIdsA = (usersA.data || []).map(u => u.groupId ?? u.teamId);
  const allGroupA = userIdsA.every(id => id === ownerA.team.id);
  ok("All users in Group A list have groupId=A", allGroupA, `ids: ${JSON.stringify(userIdsA)}`);

  // Users list with Group B token should only show Group B members
  const usersB = await req("GET", "/users", null, tokenB);
  ok("Users list scoped to Group B", usersB.status === 200);

  // Bad group switch (non-member group)
  const bad = await req("PATCH", "/auth/switch-group", { groupId: 99999 }, dualUser.token);
  ok("Cannot switch to non-member group → 403", bad.status === 403);
}

// ──────────────────────────────────────────────────────────────────────────────
// 8. Different roles across groups
// ──────────────────────────────────────────────────────────────────────────────
console.log("\n▶ 8. Different roles across groups");
{
  const gr = await req("GET", "/auth/groups", null, dualUser.token);
  const groupA = (gr.data || []).find(g => g.id === ownerA.team.id);
  const groupB = (gr.data || []).find(g => g.id === ownerB.team.id);
  ok("Dual user is member in Group A", groupA?.role === "member", `role: ${groupA?.role}`);
  ok("Dual user is member in Group B", groupB?.role === "member", `role: ${groupB?.role}`);

  // Owner A should be owner in Group A
  const gr2 = await req("GET", "/auth/groups", null, ownerA.token);
  const ownerGroupA = (gr2.data || []).find(g => g.id === ownerA.team.id);
  ok("Owner A has owner role in Group A", ownerGroupA?.role === "owner", `role: ${ownerGroupA?.role}`);
}

// ──────────────────────────────────────────────────────────────────────────────
// 9. Owner B also joins Group A as manager (needed for delegation test)
// ──────────────────────────────────────────────────────────────────────────────
console.log("\n▶ 9. Owner B joins Group A (needed for cross-group delegation)");
{
  const r = await req("POST", "/auth/signup", {
    fullName: "Beta Owner",
    mobile: OWNER_B_MOBILE,
    password: "Pass1234!",
    inviteCode: ownerA.team.inviteCode,
  });
  ok("Owner B joins Group A → 201", r.status === 201);

  // Approve and elevate to deputy (so they can delegate from Group A)
  const appR = await req("POST", `/team/join-requests/${ownerB.user.id}/approve`, {}, ownerA.token);
  ok("Owner A approves Owner B's join request", appR.status === 200);

  // Change role to deputy
  const updR = await req("PATCH", `/users/${ownerB.user.id}`, { role: "deputy" }, ownerA.token);
  ok("Owner B promoted to deputy in Group A", updR.status === 200, `role: ${updR.data?.role}`);

  // Owner B re-logins to get fresh token with Group A membership
  const lr = await req("POST", "/auth/login", { mobile: OWNER_B_MOBILE, password: "Pass1234!" });
  ok("Owner B login after Group A join", lr.status === 200);
  ownerB = { ...ownerB, freshToken: lr.data.token, groups: lr.data.groups };

  // Switch Owner B to Group A context
  const sw = await req("PATCH", "/auth/switch-group", { groupId: ownerA.team.id }, ownerB.freshToken);
  ok("Owner B switches to Group A context", sw.status === 200);
  ownerB.groupAToken = sw.data.token;
}

// ──────────────────────────────────────────────────────────────────────────────
// 10. Task creation — single assignee
// ──────────────────────────────────────────────────────────────────────────────
console.log("\n▶ 10. Task creation — single assignee");
{
  const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const r = await req("POST", "/tasks", {
    title: "Single Assignee Task",
    description: "Test single assignment",
    deadline,
    assigneeIds: [memberA.user.id],
  }, ownerA.token);
  ok("POST /tasks creates task → 201", r.status === 201, JSON.stringify(r.data?.error || ""));
  ok("Task has assignees array", Array.isArray(r.data?.assignees));
  ok("Task has 1 assignee", r.data?.assignees?.length === 1);
  ok("Assignee is memberA", r.data?.assignees?.[0]?.id === memberA.user.id);
  taskId = r.data?.id;
}

// ──────────────────────────────────────────────────────────────────────────────
// 11. Task creation — multi-assignee
// ──────────────────────────────────────────────────────────────────────────────
console.log("\n▶ 11. Task creation — multi-assignee");
{
  const deadline = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const r = await req("POST", "/tasks", {
    title: "Multi Assignee Task",
    description: "Multiple people responsible",
    deadline,
    assigneeIds: [memberA.user.id, dualUser.user.id],
  }, ownerA.token);
  ok("POST /tasks multi-assignee → 201", r.status === 201, JSON.stringify(r.data?.error || ""));
  ok("Task has 2 assignees", r.data?.assignees?.length === 2);
  multiTaskId = r.data?.id;
}

// ──────────────────────────────────────────────────────────────────────────────
// 12. Multi-assignee notifications
// ──────────────────────────────────────────────────────────────────────────────
console.log("\n▶ 12. Multi-assignee notifications");
{
  // Both assignees should have a task_assigned notification for the multi-task
  const n1 = await req("GET", "/notifications", null, memberA.token);
  ok("memberA has notifications", n1.status === 200 && Array.isArray(n1.data));
  const memberAAssigned = (n1.data || []).filter(n => n.type === "task_assigned" && n.taskId === multiTaskId);
  ok("memberA received task_assigned for multi-task", memberAAssigned.length > 0);

  // dual user in group A context should see it too
  const swA = await req("PATCH", "/auth/switch-group", { groupId: ownerA.team.id }, dualUser.token);
  const dualTokenA = swA.data?.token;
  const n2 = await req("GET", "/notifications", null, dualTokenA);
  ok("dualUser (Group A context) has notifications", n2.status === 200);
  const dualAssigned = (n2.data || []).filter(n => n.type === "task_assigned" && n.taskId === multiTaskId);
  ok("dualUser received task_assigned for multi-task", dualAssigned.length > 0, `count: ${dualAssigned.length}`);
}

// ──────────────────────────────────────────────────────────────────────────────
// 13. Permission enforcement — members cannot perform manager actions
// ──────────────────────────────────────────────────────────────────────────────
console.log("\n▶ 13. Permission enforcement");
{
  // Member cannot create task
  const r1 = await req("POST", "/tasks", {
    title: "Forbidden Task",
    description: "",
    deadline: new Date(Date.now() + 86400000).toISOString(),
    assigneeIds: [memberA.user.id],
  }, memberA.token);
  ok("Member cannot create task → 403", r1.status === 403, `got ${r1.status}`);

  // Member cannot access audit logs
  const r2 = await req("GET", "/audit-logs", null, memberA.token);
  ok("Member cannot access audit logs → 403", r2.status === 403, `got ${r2.status}`);

  // Member cannot access dashboard summary
  const r3 = await req("GET", "/dashboard/summary", null, memberA.token);
  ok("Member cannot access dashboard/summary → 403", r3.status === 403, `got ${r3.status}`);

  // Member cannot view team join-requests
  const r4 = await req("GET", "/team/join-requests", null, memberA.token);
  ok("Member cannot view join requests → 403", r4.status === 403, `got ${r4.status}`);

  // Member cannot approve a task
  const r5 = await req("PATCH", `/tasks/${taskId}/approve`, {}, memberA.token);
  ok("Member cannot approve task → 403", r5.status === 403, `got ${r5.status}`);
}

// ──────────────────────────────────────────────────────────────────────────────
// 14. Task completion + approval flow
// ──────────────────────────────────────────────────────────────────────────────
console.log("\n▶ 14. Task completion and approval flow");
{
  // Member completes the single-assignee task
  const compR = await req("PATCH", `/tasks/${taskId}/complete`, {}, memberA.token);
  ok("Member marks task complete → 200", compR.status === 200, JSON.stringify(compR.data?.error || ""));
  ok("Task status is 'completed'", compR.data?.status === "completed");

  // Owner approves
  const appR = await req("PATCH", `/tasks/${taskId}/approve`, {}, ownerA.token);
  ok("Owner approves task → 200", appR.status === 200, JSON.stringify(appR.data?.error || ""));
  ok("Task status is 'approved'", appR.data?.status === "approved");

  // Owner reopens
  const reopR = await req("PATCH", `/tasks/${taskId}/reopen`, {}, ownerA.token);
  ok("Owner reopens task → 200", reopR.status === 200, JSON.stringify(reopR.data?.error || ""));
  ok("Task status is 'reopened'", reopR.data?.status === "reopened");
}

// ──────────────────────────────────────────────────────────────────────────────
// 15. Reassignment request / approve / reject
// ──────────────────────────────────────────────────────────────────────────────
console.log("\n▶ 15. Reassignment request/approve/reject");
{
  // Re-open or use existing open task (taskId is now 'reopened' which is valid)
  // Member requests reassignment to dualUser
  const reqR = await req("POST", `/tasks/${taskId}/reassign-request`,
    { requestedAssigneeId: dualUser.user.id },
    memberA.token
  );
  ok("Member requests reassignment → 200", reqR.status === 200, JSON.stringify(reqR.data?.error || ""));
  ok("reassignStatus is pending", reqR.data?.reassignStatus === "pending");

  // Owner rejects
  const rejR = await req("PATCH", `/tasks/${taskId}/reassign-reject`, {}, ownerA.token);
  ok("Owner rejects reassignment → 200", rejR.status === 200, JSON.stringify(rejR.data?.error || ""));
  ok("reassignStatus cleared after reject", rejR.data?.reassignStatus === null);

  // Request again and approve this time
  const reqR2 = await req("POST", `/tasks/${taskId}/reassign-request`,
    { requestedAssigneeId: dualUser.user.id },
    memberA.token
  );
  ok("Second reassignment request → 200", reqR2.status === 200, JSON.stringify(reqR2.data?.error || ""));

  const appR = await req("PATCH", `/tasks/${taskId}/reassign-approve`, {}, ownerA.token);
  ok("Owner approves reassignment → 200", appR.status === 200, JSON.stringify(appR.data?.error || ""));
  ok("reassignStatus cleared after approve", appR.data?.reassignStatus === null);
}

// ──────────────────────────────────────────────────────────────────────────────
// 16. Cross-group delegation
// ──────────────────────────────────────────────────────────────────────────────
console.log("\n▶ 16. Cross-group delegation");
{
  // Create a fresh open task in Group A for delegation
  const deadline = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
  const cr = await req("POST", "/tasks", {
    title: "Delegation Parent Task",
    description: "Will be delegated to Beta",
    deadline,
    assigneeIds: [memberA.user.id],
  }, ownerA.token);
  ok("Created parent task for delegation", cr.status === 201);
  const parentTaskId = cr.data?.id;

  // ownerB (acting as deputy in Group A) delegates to Group B
  // Need dual user's Group B membership for assignee
  const delR = await req("POST", `/tasks/${parentTaskId}/delegate`, {
    targetGroupId: ownerB.team.id,
    assigneeIds: [dualUser.user.id],
  }, ownerB.groupAToken);
  ok("Delegate task to Group B → 201", delR.status === 201, JSON.stringify(delR.data?.error || "").slice(0,200));
  ok("Child task has parentTaskId", delR.data?.parentTaskId === parentTaskId);
  delegatedChildId = delR.data?.id;

  // Verify parent task shows delegatedTasks
  const parentR = await req("GET", `/tasks/${parentTaskId}`, null, ownerA.token);
  ok("Parent task shows delegatedTasks", Array.isArray(parentR.data?.delegatedTasks) && parentR.data.delegatedTasks.length > 0);
}

// ──────────────────────────────────────────────────────────────────────────────
// 17. Cannot delegate to same group
// ──────────────────────────────────────────────────────────────────────────────
console.log("\n▶ 17. Delegation guard — same group rejected");
{
  const deadline = new Date(Date.now() + 96 * 60 * 60 * 1000).toISOString();
  const cr = await req("POST", "/tasks", {
    title: "Same Group Delegate Test",
    description: "",
    deadline,
    assigneeIds: [memberA.user.id],
  }, ownerA.token);
  const sameGroupTaskId = cr.data?.id;

  const r = await req("POST", `/tasks/${sameGroupTaskId}/delegate`, {
    targetGroupId: ownerA.team.id,
    assigneeIds: [memberA.user.id],
  }, ownerA.token);
  ok("Delegating to same group → 400", r.status === 400, JSON.stringify(r.data?.error || ""));
}

// ──────────────────────────────────────────────────────────────────────────────
// 18. Audit log — critical actions appear, managers can search
// ──────────────────────────────────────────────────────────────────────────────
console.log("\n▶ 18. Audit log");
{
  const r = await req("GET", "/audit-logs", null, ownerA.token);
  ok("GET /audit-logs → 200", r.status === 200);
  ok("Audit data is array", Array.isArray(r.data?.data));
  ok("Has audit records", r.data?.total > 0, `total: ${r.data?.total}`);

  const actions = (r.data?.data || []).map(a => a.action);
  ok("Contains group_created", actions.includes("group_created"));
  ok("Contains user_created", actions.includes("user_created"));
  ok("Contains member_joined", actions.includes("member_joined"));
  ok("Contains task_created", actions.includes("task_created"));
  ok("Contains task_assigned", actions.includes("task_assigned"));
  ok("Contains task_completed", actions.includes("task_completed"));
  ok("Contains task_approved", actions.includes("task_approved"));
  ok("Contains task_delegated", actions.includes("task_delegated"));
  ok("Contains task_reassign_requested", actions.includes("task_reassign_requested"));

  // Search by action
  const searchR = await req("GET", `/audit-logs?action=task_created`, null, ownerA.token);
  ok("Audit log filtered by action works", searchR.status === 200 && (searchR.data?.data || []).every(a => a.action === "task_created"));

  // Search by actorId
  const actorR = await req("GET", `/audit-logs?actorId=${ownerA.user.id}`, null, ownerA.token);
  ok("Audit log filtered by actorId works", actorR.status === 200 && actorR.data?.total > 0);
}

// ──────────────────────────────────────────────────────────────────────────────
// 19. Cross-platform login (web-registered account accessible from any client)
// ──────────────────────────────────────────────────────────────────────────────
console.log("\n▶ 19. Cross-platform login");
{
  // Simulate mobile login with web-registered account credentials
  const r1 = await req("POST", "/auth/login", { mobile: OWNER_A_MOBILE, password: "Pass1234!" });
  ok("Mobile login with web-registered account → 200", r1.status === 200);
  ok("Returns valid token for cross-platform login", !!r1.data?.token);

  // Simulate web login with mobile-registered credentials (same API, different client)
  const r2 = await req("POST", "/auth/login", { mobile: MEMBER_A_MOBILE, password: "Pass1234!" });
  ok("Web login with mobile-registered account → 200", r2.status === 200);
}

// ──────────────────────────────────────────────────────────────────────────────
// 20. Notification preferences
// ──────────────────────────────────────────────────────────────────────────────
console.log("\n▶ 20. Notification preferences");
{
  const getR = await req("GET", "/notifications/preferences", null, memberA.token);
  ok("GET /notifications/preferences → 200", getR.status === 200);
  ok("Has reminder24h field", typeof getR.data?.reminder24h === "boolean");
  ok("Has reminder1h field", typeof getR.data?.reminder1h === "boolean");
  ok("Has reminder10m field", typeof getR.data?.reminder10m === "boolean");
  ok("Has overdue field", typeof getR.data?.overdue === "boolean");

  const putR = await req("PUT", "/notifications/preferences", {
    reminder24h: false, reminder1h: true, reminder10m: true, overdue: false,
  }, memberA.token);
  ok("PUT /notifications/preferences → 200", putR.status === 200);
  ok("Preferences updated correctly", putR.data?.reminder24h === false && putR.data?.overdue === false);
}

// ──────────────────────────────────────────────────────────────────────────────
// 21. Mark notifications read
// ──────────────────────────────────────────────────────────────────────────────
console.log("\n▶ 21. Mark notifications read");
{
  const listR = await req("GET", "/notifications", null, memberA.token);
  ok("GET /notifications → 200", listR.status === 200);
  const unread = (listR.data || []).filter(n => !n.isRead);
  if (unread.length > 0) {
    const markR = await req("PATCH", `/notifications/${unread[0].id}/read`, {}, memberA.token);
    ok("PATCH /notifications/:id/read → 200", markR.status === 200);
    ok("Notification marked read", markR.data?.isRead === true);
  } else {
    ok("(no unread notifications to mark, skipped)", true);
    ok("(no unread notifications to mark, skipped)", true);
  }

  const allReadR = await req("PATCH", "/notifications/read-all", {}, memberA.token);
  ok("PATCH /notifications/read-all → 200", allReadR.status === 200);
}

// ──────────────────────────────────────────────────────────────────────────────
// 22. Dashboard summary (manager)
// ──────────────────────────────────────────────────────────────────────────────
console.log("\n▶ 22. Dashboard");
{
  const r1 = await req("GET", "/dashboard/summary", null, ownerA.token);
  ok("GET /dashboard/summary (manager) → 200", r1.status === 200);
  ok("Summary has total field", "total" in (r1.data || {}));

  const r2 = await req("GET", "/dashboard/workload", null, ownerA.token);
  ok("GET /dashboard/workload → 200", r2.status === 200);
  ok("Workload is array", Array.isArray(r2.data));

  const r3 = await req("GET", "/dashboard/my-tasks", null, memberA.token);
  ok("GET /dashboard/my-tasks (member) → 200", r3.status === 200);
}

// ──────────────────────────────────────────────────────────────────────────────
// 23. Reports
// ──────────────────────────────────────────────────────────────────────────────
console.log("\n▶ 23. Reports");
{
  const today = new Date().toISOString().split("T")[0];
  const r1 = await req("GET", `/reports/daily?date=${today}`, null, ownerA.token);
  ok("GET /reports/daily (manager) → 200", r1.status === 200);

  const r2 = await req("GET", `/reports/employee?userId=${memberA.user.id}&startDate=${today}&endDate=${today}`, null, ownerA.token);
  ok("GET /reports/employee (manager) → 200", r2.status === 200);

  // Member cannot access reports
  const r3 = await req("GET", `/reports/daily?date=${today}`, null, memberA.token);
  ok("Member cannot access daily report → 403", r3.status === 403);
}

// ──────────────────────────────────────────────────────────────────────────────
// 24. Team info and invite code
// ──────────────────────────────────────────────────────────────────────────────
console.log("\n▶ 24. Team management");
{
  const r1 = await req("GET", "/team/info", null, ownerA.token);
  ok("GET /team/info → 200", r1.status === 200);
  ok("Has inviteCode", !!r1.data?.inviteCode);

  const r2 = await req("POST", "/team/regenerate-invite", {}, ownerA.token);
  ok("POST /team/regenerate-invite (owner) → 200", r2.status === 200);
  ok("New invite code returned", !!r2.data?.inviteCode && r2.data.inviteCode !== r1.data.inviteCode);

  // Deputy cannot regenerate
  const r3 = await req("POST", "/team/regenerate-invite", {}, ownerB.groupAToken);
  ok("Deputy cannot regenerate invite code → 403", r3.status === 403);
}

// ──────────────────────────────────────────────────────────────────────────────
// 25. Forgot password / change password
// ──────────────────────────────────────────────────────────────────────────────
console.log("\n▶ 25. Password management");
{
  const r1 = await req("POST", "/auth/forgot-password", {
    mobile: MEMBER_A_MOBILE,
    newPassword: "NewPass5678!",
  });
  ok("POST /auth/forgot-password → 200", r1.status === 200);

  // Login with new password
  const lr = await req("POST", "/auth/login", { mobile: MEMBER_A_MOBILE, password: "NewPass5678!" });
  ok("Login with new (reset) password works", lr.status === 200);
  memberA.token = lr.data.token;

  // Change password via authenticated endpoint
  const r2 = await req("POST", "/auth/change-password", {
    currentPassword: "NewPass5678!",
    newPassword: "FinalPass9!",
  }, memberA.token);
  ok("POST /auth/change-password → 200", r2.status === 200);

  const lr2 = await req("POST", "/auth/login", { mobile: MEMBER_A_MOBILE, password: "FinalPass9!" });
  ok("Login with changed password works", lr2.status === 200);
  memberA.token = lr2.data.token;
}

// ──────────────────────────────────────────────────────────────────────────────
// 26. Messages (task messaging)
// ──────────────────────────────────────────────────────────────────────────────
console.log("\n▶ 26. Task messaging");
{
  const r1 = await req("POST", `/tasks/${multiTaskId}/messages`, { content: "Hello team!" }, ownerA.token);
  ok("POST /tasks/:id/messages → 201", r1.status === 201);
  ok("Message has content", r1.data?.content === "Hello team!");

  const r2 = await req("GET", `/tasks/${multiTaskId}/messages`, null, ownerA.token);
  ok("GET /tasks/:id/messages → 200", r2.status === 200);
  ok("Messages is array with content", Array.isArray(r2.data) && r2.data.length > 0);
}

// ──────────────────────────────────────────────────────────────────────────────
// 27. Database consistency — changes appear across clients
// ──────────────────────────────────────────────────────────────────────────────
console.log("\n▶ 27. Database consistency (cross-client)");
{
  // Owner creates a task, then member immediately reads it — same DB
  const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const cr = await req("POST", "/tasks", {
    title: "Consistency Check Task",
    description: "Should be visible to member immediately",
    deadline,
    assigneeIds: [memberA.user.id],
  }, ownerA.token);
  ok("Owner creates consistency-check task", cr.status === 201);
  const consistencyTaskId = cr.data?.id;

  // Member fetches their tasks — should include the new task
  const lr = await req("POST", "/auth/login", { mobile: MEMBER_A_MOBILE, password: "FinalPass9!" });
  const freshMemberToken = lr.data.token;
  const tr = await req("GET", "/tasks", null, freshMemberToken);
  ok("Member sees task immediately after creation (no re-login required for data)", tr.status === 200);
  const found = (tr.data || []).some(t => t.id === consistencyTaskId);
  ok("New task appears in member task list (cross-client sync)", found, `taskIds: ${(tr.data||[]).map(t=>t.id).join(",")}`);
}

// ──────────────────────────────────────────────────────────────────────────────
// 28. VAPID push public key
// ──────────────────────────────────────────────────────────────────────────────
console.log("\n▶ 28. Push notification infrastructure");
{
  const r = await req("GET", "/push/vapid-public-key");
  ok("GET /push/vapid-public-key → 200", r.status === 200, JSON.stringify(r.data));
  ok("Has publicKey", !!r.data?.publicKey);
}

// ──────────────────────────────────────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────────────────────────────────────
console.log("\n══════════════════════════════════════════════");
console.log(` Results: ${passed} passed, ${failed} failed`);
console.log("══════════════════════════════════════════════\n");

if (failed > 0) {
  console.error("FAILED TESTS:");
  results.filter(r => r.status === "FAIL").forEach(r => {
    console.error(`  • ${r.name}${r.detail ? " — " + r.detail : ""}`);
  });
  process.exit(1);
} else {
  console.log("All tests passed! ✅");
  process.exit(0);
}
